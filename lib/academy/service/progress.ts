import type { OnboardingModule, OnboardingPhase, OnboardingCompletionRule, OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import type { PersonAttributes } from '../attributes'
import { filterBlocks, parseBlocks, type Block } from '../blocks'
import { effectiveRule, evaluateCompletion, type PaymentFacts } from '../completion'
import { AcademyError } from '../errors'
import { resolveAcademyLink } from '../links'
import { applyEvent, moduleCardState, nextToUnlock, parseProgressState, type ProgressEvent, type ProgressState } from '../progress'
import { holidayTeamFor, moduleDueAt } from '../schedule'
import { timeZoneFor } from '../time'
import { eventKeysFor, type ModuleProgressView } from '../view'
import { ATTRIBUTE_SELECT } from './attributes'
import { loadHireFacts, type HireFacts } from './context'
import { getAcademyConfig } from './library'

type Db = PrismaClient | Prisma.TransactionClient
type Tx = Prisma.TransactionClient

/** A hire's ticks queue on the row lock, and the database may be a cold serverless one. */
export const COURSE_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const

const PHASES: readonly OnboardingPhase[] = ['DAY_1', 'WEEK_1']
const notFound = () => new AcademyError('Module not found', 404)

export type CourseModule = OnboardingModule & {
  phase: OnboardingPhase
  completionRule: OnboardingCompletionRule
  currentVersionId: string
}

const isCourseModule = (m: OnboardingModule): m is CourseModule =>
  m.phase !== null && m.completionRule !== null && m.currentVersionId !== null

/** Active modules with content, in order. Legacy modules have no rule or version and never count. */
export async function listCourseModules(db: Db): Promise<CourseModule[]> {
  const modules = await db.onboardingModule.findMany({ where: { isActive: true }, orderBy: { orderIndex: 'asc' } })
  return modules.filter(isCourseModule)
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

/** The `payment` input for evaluateCompletion. Selects only what it needs: values never leave here. */
export async function paymentFacts(db: Db, userId: string): Promise<PaymentFacts> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      contractType: true,
      payrollProfile: { select: { iban: true } },
      contractorPayoutDetails: { select: { id: true } },
      onboardingPendingBank: { select: { id: true } },
    },
  })
  // Details held until HR creates the payroll profile count as saved.
  if (user.contractType === 'PK_EMPLOYMENT') {
    return { kind: 'PK', bankSaved: Boolean(user.payrollProfile?.iban) || user.onboardingPendingBank !== null }
  }
  return { kind: 'OTHER', payoutSaved: user.contractorPayoutDetails !== null }
}

/** The first signature, which is the one that stands. */
export async function securityAcknowledgement(db: Db, userId: string) {
  return db.onboardingAcknowledgement.findFirst({
    where: { userId, kind: 'SECURITY_SOPS' },
    orderBy: { signedAt: 'asc' },
    select: { statementText: true, typedName: true, signedAt: true },
  })
}

/** A completed row keeps the version it was completed on; every other row shows the current one. */
export function versionIdFor(row: Pick<OnboardingProgress, 'status' | 'versionId'>, module: CourseModule): string {
  return row.status === 'COMPLETED' && row.versionId ? row.versionId : module.currentVersionId
}

/** The version's blocks with this hire's conditions applied. */
export async function moduleBlocks(db: Db, versionId: string, facts: Pick<HireFacts, 'conditions'>): Promise<Block[]> {
  const version = await db.onboardingModuleVersion.findUnique({ where: { id: versionId }, select: { blocks: true } })
  if (!version) throw notFound()
  try {
    return filterBlocks(parseBlocks(version.blocks), facts.conditions)
  } catch (error) {
    console.error('[academy] stored module content failed validation', { versionId, error })
    throw new AcademyError("This module's content couldn't be loaded. Tell HR.", 500)
  }
}

/** Runs the module's rule on fresh data. Facts only count if this hire's filtered blocks show the content. */
export async function evaluateModule(
  db: Db, userId: string, facts: HireFacts, module: CourseModule, blocks: readonly Block[], state: ProgressState,
) {
  const config = await getAcademyConfig(db)
  const payment = await paymentFacts(db, userId)
  const acknowledgement = await securityAcknowledgement(db, userId)
  const tutorialKeys = blocks.some((b) => b.type === 'tutorialCards') ? facts.tutorials.map((t) => t.key) : []
  const dashboardLinkSet =
    blocks.some((b) => b.type === 'dashboardLink') && resolveAcademyLink(config.links.COMPANY_DASHBOARD) !== null
  const rule = effectiveRule(module.completionRule, blocks, { tutorialCount: tutorialKeys.length, dashboardLinkSet })
  const completion = evaluateCompletion({
    rule,
    blocks: [...blocks],
    state,
    tutorialKeys,
    discordUsername: facts.discordUsername,
    securityAckSigned: acknowledgement !== null,
    payment,
  })
  return { rule, completion, payment, acknowledgement }
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

function assertKnownEventKey(event: ProgressEvent, blocks: readonly Block[], facts: HireFacts): void {
  if (event.type === 'SCROLLED_END') return
  const keys = eventKeysFor(blocks, facts.tutorials.map((t) => t.key))
  const allowed = event.type === 'CHECK' ? keys.checks : keys.links
  if (!allowed.includes(event.key)) throw new AcademyError("That isn't part of this module.", 400)
}

async function requireHireFacts(db: Db, userId: string): Promise<HireFacts> {
  const facts = await loadHireFacts(db, userId)
  if (!facts) throw notFound()
  return facts
}

/**
 * The row lock serializes every write to `state`. A completed module is finished record, so an
 * event on it (the end-of-page sentinel fires on a re-read) is accepted and changes nothing.
 */
export async function recordEvent(db: PrismaClient, userId: string, slug: string, event: ProgressEvent): Promise<ModuleProgressView> {
  return db.$transaction(async (tx) => {
    const { module, index } = findCourseModule(await listCourseModules(tx), slug)
    const row = await lockProgressRow(tx, userId, module.id)
    const facts = await requireHireFacts(tx, userId)
    assertModuleOpen(row, index)
    const blocks = await moduleBlocks(tx, versionIdFor(row, module), facts)
    assertKnownEventKey(event, blocks, facts)

    const now = new Date()
    const current = parseProgressState(row.state)
    const finished = row.status === 'COMPLETED'
    const state = finished ? current : applyEvent(current, event, now)
    const saved = finished
      ? row
      : await tx.onboardingProgress.update({ where: { id: row.id }, data: { state: state as unknown as Prisma.InputJsonObject } })
    return toProgressView(saved, state, await evaluateModule(tx, userId, facts, module, blocks, state), now)
  }, COURSE_TX_OPTIONS)
}

/** Everything is read under the row lock, so the rule sees fresh data and a double submit completes once. */
export async function completeModule(
  db: PrismaClient, userId: string, slug: string,
): Promise<{ nextSlug: string | null; alreadyCompleted: boolean }> {
  return db.$transaction(async (tx) => {
    const modules = await listCourseModules(tx)
    const { module, index } = findCourseModule(modules, slug)
    const row = await lockProgressRow(tx, userId, module.id)
    const facts = await requireHireFacts(tx, userId)
    const nextId = nextToUnlock(modules, module.id)
    const nextSlug = modules.find((m) => m.id === nextId)?.slug ?? null
    if (row.status === 'COMPLETED') return { nextSlug, alreadyCompleted: true }
    assertModuleOpen(row, index)

    const blocks = await moduleBlocks(tx, module.currentVersionId, facts)
    const { completion } = await evaluateModule(tx, userId, facts, module, blocks, parseProgressState(row.state))
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
  const holidays = await db.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: joiningDate }, OR: [{ teamTags: { isEmpty: true } }, { teamTags: { has: team } }] },
    select: { holidayDate: true },
  })
  return new Set(holidays.map((h) => h.holidayDate.toISOString().slice(0, 10)))
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

/** Moves the due dates of incomplete course rows; a completed row keeps its date. Returns the rows changed. */
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
        userId, source: 'COURSE', status: { not: 'COMPLETED' }, module: { phase },
        OR: [{ dueAt: null }, { dueAt: { not: dueAt } }],
      },
      data: { dueAt },
    })
    changed += count
  }
  return changed
}
