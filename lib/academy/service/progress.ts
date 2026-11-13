import type { OnboardingModule, OnboardingPhase, OnboardingCompletionRule, OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import type { PersonAttributes } from '../attributes'
import { collectingBlocks, filterBlocks, parseBlocks, type Block, type Collects } from '../blocks'
import { effectiveRule, evaluateCompletion, type PaymentFacts } from '../completion'
import { AcademyError } from '../errors'
import { resolveAcademyLink } from '../links'
import {
  applyEvent, applyVideoProgress, moduleCardState, nextToUnlock, parseProgressState, type ProgressEvent, type ProgressState,
} from '../progress'
import { holidayTeamFor, moduleDueAt } from '../schedule'
import { timeZoneFor } from '../time'
import { eventKeysFor, latestDue, moduleVideo, type ModuleProgressView } from '../view'
import { ATTRIBUTE_SELECT } from './attributes'
import { loadRowFacts, type HireFacts, type LearnerFacts } from './context'
import { getAcademyConfig } from './library'
import { companyHolidayDates } from './shared-reads'

type Db = PrismaClient | Prisma.TransactionClient
type Tx = Prisma.TransactionClient

/** A hire's ticks queue on the row lock, and the database may be a cold serverless one. */
export const COURSE_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const

export const COURSE_MODULE_COUNT = 14
export const BANK_MODULE_SLUG = 'getting-paid'
export const READING_ONLY_MESSAGE = 'This module is for reading only.'
const PAYMENT_UNAVAILABLE_MESSAGE = "This isn't available yet."

const PHASES: readonly OnboardingPhase[] = ['DAY_1', 'WEEK_1']
const notFound = () => new AcademyError('Module not found', 404)

export type CourseModule = OnboardingModule & {
  phase: OnboardingPhase
  completionRule: OnboardingCompletionRule
  currentVersionId: string
}

export const isCourseModule = (m: OnboardingModule): m is CourseModule =>
  m.phase !== null && m.completionRule !== null && m.currentVersionId !== null

/** Active modules with content, in order. Legacy modules have no rule or version and never count. */
export async function listCourseModules(db: Db): Promise<CourseModule[]> {
  const modules = await db.onboardingModule.findMany({ where: { isActive: true }, orderBy: { orderIndex: 'asc' } })
  return modules.filter(isCourseModule)
}

/**
 * The one test of "the modules are done", for the quiz and for finishing. Anything but the whole
 * course, each module finished as a course row, counts as not done: it fails closed.
 */
export async function readCourseProgress(db: Db, userId: string): Promise<{ modulesDone: boolean; dueAt: string | null }> {
  const modules = await listCourseModules(db)
  const rows = await db.onboardingProgress.findMany({
    where: { userId, moduleId: { in: modules.map((m) => m.id) }, source: 'COURSE' },
    select: { moduleId: true, status: true, dueAt: true },
  })
  const completed = new Set(rows.filter((r) => r.status === 'COMPLETED').map((r) => r.moduleId))
  return {
    modulesDone: modules.length === COURSE_MODULE_COUNT && modules.every((m) => completed.has(m.id)),
    dueAt: latestDue(rows.map((r) => ({ dueAt: r.dueAt?.toISOString() ?? null }))),
  }
}

/** `index` is zero-based, so it is also the number of the module before. */
export function findCourseModule(modules: readonly CourseModule[], slug: string): { module: CourseModule; index: number } {
  const index = modules.findIndex((m) => m.slug === slug)
  if (index < 0) throw notFound()
  return { module: modules[index], index }
}

/** A row HR has unlocked early stays open even while its status still says LOCKED. */
export function assertModuleOpen(row: Pick<OnboardingProgress, 'status' | 'unlockedEarlyById'>, index: number): void {
  if (row.status === 'LOCKED' && !row.unlockedEarlyById) throw new AcademyError(`Complete Module ${index} first`, 403)
}

/**
 * Locks one hire's row for one module until the transaction ends, then reads it fresh, so
 * read-apply-write on `state` cannot lose another writer's change. 404 when there is no row.
 */
export async function lockProgressRow(tx: Tx, userId: string, moduleId: string): Promise<OnboardingProgress> {
  await tx.$queryRaw`SELECT id FROM "OnboardingProgress" WHERE "userId" = ${userId} AND "moduleId" = ${moduleId} FOR UPDATE`
  const row = await tx.onboardingProgress.findUnique({ where: { userId_moduleId: { userId, moduleId } } })
  if (!row) throw notFound()
  return row
}

/** Locks this person's Module 11 row. No row means nothing is locked: it just isn't there yet. */
export async function lockPaymentRow(tx: Tx, userId: string): Promise<{ row: OnboardingProgress; index: number }> {
  try {
    const { module, index } = findCourseModule(await listCourseModules(tx), BANK_MODULE_SLUG)
    return { row: await lockProgressRow(tx, userId, module.id), index }
  } catch (error) {
    if (error instanceof AcademyError && error.status === 404) throw paymentUnavailable()
    throw error
  }
}

export const paymentUnavailable = () => new AcademyError(PAYMENT_UNAVAILABLE_MESSAGE, 404)

/** Saved data comes in through the course only: a re-read or an assignment is for reading. */
export function assertCollectsData(row: Pick<OnboardingProgress, 'source'>): void {
  if (row.source !== 'COURSE') throw new AcademyError(READING_ONLY_MESSAGE, 403)
}

/**
 * What this row takes in: the course row everything. Module 11 read again by someone who went through
 * it before (archive() writes history on every reopen) takes payout only, since bank details are set
 * once. Fresh assignments and every other module only read.
 */
export async function collectionFor(db: Db, row: Pick<OnboardingProgress, 'source' | 'userId' | 'moduleId'>): Promise<Collects> {
  if (row.source === 'COURSE') return 'all'
  // Only Module 11 collects after a re-read: LinkedIn and the rest stay reading-only.
  const paymentModule = (await listCourseModules(db)).find((m) => m.slug === BANK_MODULE_SLUG)
  if (paymentModule?.id !== row.moduleId) return 'none'
  const before = await db.onboardingProgressHistory.count({ where: { userId: row.userId, moduleId: row.moduleId } })
  return before > 0 ? 'payout' : 'none'
}

/** Whether this row takes any saved data at all. */
export async function collectsData(db: Db, row: Pick<OnboardingProgress, 'source' | 'userId' | 'moduleId'>): Promise<boolean> {
  return (await collectionFor(db, row)) !== 'none'
}

/** The payout path's refusal: a contractor who went through Module 11 may still update after a re-read. */
export async function assertCollectsPayout(db: Db, row: Pick<OnboardingProgress, 'source' | 'userId' | 'moduleId'>): Promise<void> {
  if (!(await collectsData(db, row))) throw new AcademyError(READING_ONLY_MESSAGE, 403)
}

/** The `payment` input for evaluateCompletion. Selects only what it needs: values never leave here. */
export async function paymentFacts(db: Db, userId: string): Promise<PaymentFacts> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { contractType: true, onboardingPaymentDetails: { select: { method: true } } },
  })
  // Contract type chooses the form; a row saved through the other form doesn't answer this one.
  const method = user.onboardingPaymentDetails?.method
  if (user.contractType === 'PK_EMPLOYMENT') return { kind: 'PK', bankSaved: method === 'PK_BANK' }
  return { kind: 'OTHER', payoutSaved: method !== undefined && method !== 'PK_BANK' }
}

/** The signature for the version being read. The first one on that version is the one that stands. */
export async function securityAcknowledgement(db: Db, userId: string, versionId: string) {
  return db.onboardingAcknowledgement.findFirst({
    where: { userId, kind: 'SECURITY_SOPS', moduleVersionId: versionId },
    orderBy: { signedAt: 'asc' },
    select: { statementText: true, typedName: true, signedAt: true },
  })
}

/** A completed row keeps the version it was completed on; every other row shows the current one. */
export function versionIdFor(row: Pick<OnboardingProgress, 'status' | 'versionId'>, module: CourseModule): string {
  return row.status === 'COMPLETED' && row.versionId ? row.versionId : module.currentVersionId
}

/** The version's blocks with this person's conditions applied, less what a reading row doesn't collect. */
export async function moduleBlocks(
  db: Db, versionId: string, facts: Pick<LearnerFacts, 'conditions'>, collects: Collects,
): Promise<Block[]> {
  const version = await db.onboardingModuleVersion.findUnique({ where: { id: versionId }, select: { blocks: true } })
  if (!version) throw notFound()
  try {
    const shown = filterBlocks(parseBlocks(version.blocks), facts.conditions)
    return collectingBlocks(shown, collects)
  } catch (error) {
    console.error('[academy] stored module content failed validation', { versionId, error })
    throw new AcademyError("This module's content couldn't be loaded. Tell HR.", 500)
  }
}

/** Runs the module's rule on fresh data. Facts only count if this person's filtered blocks show the content. */
export async function evaluateModule(
  db: Db, userId: string, facts: LearnerFacts, module: CourseModule, blocks: readonly Block[], state: ProgressState,
  versionId: string,
) {
  const config = await getAcademyConfig(db)
  const payment = await paymentFacts(db, userId)
  const acknowledgement = await securityAcknowledgement(db, userId, versionId)
  const tutorialKeys = blocks.some((b) => b.type === 'tutorialCards') ? facts.tutorials.map((t) => t.key) : []
  const dashboardLinkSet =
    blocks.some((b) => b.type === 'dashboardLink') && resolveAcademyLink(config.links.COMPANY_DASHBOARD) !== null
  const video = moduleVideo(blocks, config.videos)
  const rule = effectiveRule(module.completionRule, blocks, {
    tutorialCount: tutorialKeys.length, dashboardLinkSet, videoReady: video !== null,
  })
  const completion = evaluateCompletion({
    rule,
    blocks: [...blocks],
    state,
    tutorialKeys,
    discordUsername: facts.discordUsername,
    securityAckSigned: acknowledgement !== null,
    payment,
    videoDurationSeconds: video?.video.durationSeconds ?? null,
  })
  return { rule, completion, payment, acknowledgement, videos: config.videos }
}

export function toProgressView(
  row: OnboardingProgress,
  state: ProgressState,
  evaluated: Pick<Awaited<ReturnType<typeof evaluateModule>>, 'rule' | 'completion'>,
  now: Date,
): ModuleProgressView {
  return {
    state,
    ...moduleCardState(row, now),
    effectiveRule: evaluated.rule,
    completion: evaluated.completion,
    dueAt: row.dueAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

const notInModule = () => new AcademyError("That isn't part of this module.", 400)

function assertKnownEventKey(event: ProgressEvent, blocks: readonly Block[], facts: LearnerFacts): void {
  if (event.type === 'SCROLLED_END' || event.type === 'VIDEO_PROGRESS') return
  const keys = eventKeysFor(blocks, facts.tutorials.map((t) => t.key))
  const allowed = event.type === 'CHECK' ? keys.checks : keys.links
  if (!allowed.includes(event.key)) throw notInModule()
}

async function requireRowFacts(db: Db, userId: string, row: OnboardingProgress): Promise<LearnerFacts> {
  const facts = await loadRowFacts(db, userId, row)
  if (!facts) throw notFound()
  return facts
}

/** A video report counts only against a ready video this person is shown; the server's clock decides how far. */
async function applyReport(
  tx: Tx, event: ProgressEvent, blocks: readonly Block[], row: OnboardingProgress, now: Date,
): Promise<(state: ProgressState) => ProgressState> {
  if (event.type !== 'VIDEO_PROGRESS') return (state) => applyEvent(state, event, now)
  const video = moduleVideo(blocks, (await getAcademyConfig(tx)).videos)
  if (!video) throw notInModule()
  return (state) => applyVideoProgress(state, event.seconds, now, video.video.durationSeconds, row.startedAt)
}

/**
 * The row lock serializes every write to `state`. A completed module is finished record, so an
 * event on it (the end-of-page sentinel fires on a re-read) is accepted and changes nothing.
 * `now` is injectable for tests; routes use the server's clock.
 */
export async function recordEvent(
  db: PrismaClient, userId: string, slug: string, event: ProgressEvent, now: Date = new Date(),
): Promise<ModuleProgressView> {
  return db.$transaction(async (tx) => {
    const { module, index } = findCourseModule(await listCourseModules(tx), slug)
    const row = await lockProgressRow(tx, userId, module.id)
    const facts = await requireRowFacts(tx, userId, row)
    assertModuleOpen(row, index)
    const versionId = versionIdFor(row, module)
    const blocks = await moduleBlocks(tx, versionId, facts, await collectionFor(tx, row))
    assertKnownEventKey(event, blocks, facts)

    const current = parseProgressState(row.state)
    const finished = row.status === 'COMPLETED'
    // A finished row takes nothing, so a late report is fine even if its video has since gone unready.
    const state = finished ? current : (await applyReport(tx, event, blocks, row, now))(current)
    const saved = finished
      ? row
      : await tx.onboardingProgress.update({ where: { id: row.id }, data: { state: state as unknown as Prisma.InputJsonObject } })
    return toProgressView(saved, state, await evaluateModule(tx, userId, facts, module, blocks, state, versionId), now)
  }, COURSE_TX_OPTIONS)
}

/**
 * Everything is read under the row lock, so the rule sees fresh data and a double submit completes once.
 * Only a COURSE row moves a course on: an assigned or re-read one unlocks nothing and has no next module.
 */
export async function completeModule(
  db: PrismaClient, userId: string, slug: string,
): Promise<{ nextSlug: string | null; alreadyCompleted: boolean }> {
  return db.$transaction(async (tx) => {
    const modules = await listCourseModules(tx)
    const { module, index } = findCourseModule(modules, slug)
    const row = await lockProgressRow(tx, userId, module.id)
    const facts = await requireRowFacts(tx, userId, row)
    const nextId = row.source === 'COURSE' ? nextToUnlock(modules, module.id) : null
    const nextSlug = modules.find((m) => m.id === nextId)?.slug ?? null
    if (row.status === 'COMPLETED') return { nextSlug, alreadyCompleted: true }
    assertModuleOpen(row, index)

    const blocks = await moduleBlocks(tx, module.currentVersionId, facts, await collectionFor(tx, row))
    const state = parseProgressState(row.state)
    const { completion } = await evaluateModule(tx, userId, facts, module, blocks, state, module.currentVersionId)
    if (!completion.met) throw new AcademyError(completion.reason, 409)

    const now = new Date()
    await tx.onboardingProgress.update({
      where: { id: row.id },
      data: { status: 'COMPLETED', completedAt: now, versionId: module.currentVersionId, startedAt: row.startedAt ?? now },
    })
    if (nextId) {
      await tx.onboardingProgress.updateMany({
        where: { userId, moduleId: nextId, status: 'LOCKED' },
        data: { status: 'IN_PROGRESS' },
      })
    }
    return { nextSlug, alreadyCompleted: false }
  }, COURSE_TX_OPTIONS)
}

async function holidayKeys(db: Db, person: DuePerson, joiningDate: Date): Promise<Set<string>> {
  const team = holidayTeamFor(person.teamTag, person.officeLocation)
  if (!team) return new Set()
  const holidays = await companyHolidayDates(db, team, joiningDate)
  return new Set(holidays.map((date) => date.toISOString().slice(0, 10)))
}

/** For writers that know the hire, not the user. Safe to call after any save: it only moves rows that differ. */
export async function recomputeDueDatesForHire(db: Db, newHireId: string): Promise<number> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { userId: true } })
  return hire?.userId ? recomputeDueDates(db, hire.userId) : 0
}

export type DuePerson = Pick<PersonAttributes, 'officeLocation' | 'remoteCountry'> & { teamTag: HireFacts['teamTag'] }

/** The due date of each phase for one hire. */
export async function courseDueDates(db: Db, person: DuePerson, joiningDate: Date): Promise<Record<OnboardingPhase, Date>> {
  const keys = await holidayKeys(db, person, joiningDate)
  const timeZone = timeZoneFor(person)
  const due = (phase: OnboardingPhase) => moduleDueAt({ phase, joiningDate, timeZone, holidayKeys: keys })
  return { DAY_1: due('DAY_1'), WEEK_1: due('WEEK_1') }
}

/**
 * Moves the due dates of incomplete course rows; a completed row keeps its date. A reopened row has
 * `assignedById` set and no date on purpose, so it stays out. Returns the rows changed.
 */
export async function recomputeDueDates(db: Db, userId: string): Promise<number> {
  const hire = await db.newHire.findUnique({
    where: { userId },
    select: { onboardingDate: true, academyReleasedAt: true, user: { select: { teamTag: true, ...ATTRIBUTE_SELECT } } },
  })
  if (!hire?.academyReleasedAt || !hire.user) return 0
  const dueDates = await courseDueDates(db, hire.user, hire.onboardingDate)
  let changed = 0
  for (const phase of PHASES) {
    const dueAt = dueDates[phase]
    const { count } = await db.onboardingProgress.updateMany({
      where: {
        userId, source: 'COURSE', assignedById: null, status: { not: 'COMPLETED' }, module: { phase },
        OR: [{ dueAt: null }, { dueAt: { not: dueAt } }],
      },
      data: { dueAt },
    })
    changed += count
  }
  return changed
}
