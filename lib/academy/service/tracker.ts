import type { NewHireStatus, OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import { canManageOnboarding } from '@/lib/permissions'
import type { AcknowledgementRow } from '../acknowledgement-export'
import { linkedinUrlSchema } from '../bank'
import { AcademyError } from '../errors'
import { moduleCardState, parseProgressState } from '../progress'
import { timeZoneFor } from '../time'
import {
  quizScoreLabel,
  shapeForRole,
  type DrawerAcknowledgement,
  type DrawerLinkedin,
  type DrawerModule,
  type DrawerPayment,
  type DrawerQuizAttempt,
  type OaTrackerRow,
  type TrackerDrawer,
  type TrackerFilters,
  type TrackerPaymentStatus,
  type TrackerRow,
} from '../tracker'
import { locationLabel, toModuleCard } from '../view'
import { formatCertificateDate } from '../view-labels'
import { countChecklists, listChecklist, syncChecklists } from './checklist'
import { LINKEDIN_MODULE_SLUG } from './fields'
import { readPayout } from './payout'
import { listCourseModules, versionIdFor, type CourseModule } from './progress'
import { readAcademyAttemptsFor, type AcademyAttempt } from './quiz'

/** Finished hires stay on the list this long, so they stay visible even if a notice was lost. */
const FINISHED_WINDOW_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const VALUES_KIND = 'VALUES_CODE_OF_CONDUCT'
const REMOVED_QUESTION = 'This question is no longer in the quiz.'

export interface TrackerViewer { id: string; role: string }

const forbidden = () => new AcademyError('Forbidden', 403)

function assertHr(viewer: TrackerViewer): void {
  if (!canManageOnboarding(viewer.role)) throw forbidden()
}

const HIRE_SELECT = {
  id: true,
  name: true,
  title: true,
  department: true,
  email: true,
  status: true,
  userId: true,
  onboardingDate: true,
  academyReleasedAt: true,
  linkedinVerifiedAt: true,
  officeLocation: true,
  remoteCountry: true,
  user: { select: { name: true, email: true, officeLocation: true, remoteCountry: true, linkedinUrl: true } },
} satisfies Prisma.NewHireSelect

type HireRow = Prisma.NewHireGetPayload<{ select: typeof HIRE_SELECT }>

const hireName = (hire: HireRow): string => hire.user?.name ?? hire.name
const hireLocation = (hire: HireRow): string | null => locationLabel(hire.user ?? hire) || null

/** A finish is dated by the values signature, as the certificate is. Older, legacy finishes have none. */
export function listedWhere(now: Date): Prisma.NewHireWhereInput {
  const cutoff = new Date(now.getTime() - FINISHED_WINDOW_DAYS * DAY_MS)
  const signedSince = { some: { kind: VALUES_KIND, signedAt: { gte: cutoff } } } as const
  return {
    OR: [
      { status: { in: ['PENDING', 'ONBOARDING'] } },
      { status: 'COMPLETED', user: { is: { onboardingAcknowledgements: signedSince } } },
    ],
  }
}

async function listHires(db: PrismaClient, filters: TrackerFilters, now: Date): Promise<HireRow[]> {
  const hires = await db.newHire.findMany({
    where: listedWhere(now),
    select: HIRE_SELECT,
    orderBy: [{ onboardingDate: 'desc' }, { id: 'asc' }],
  })
  return hires.filter(
    (hire) =>
      (!filters.location || hireLocation(hire) === filters.location) &&
      (!filters.department || hire.department === filters.department) &&
      (!filters.status || hire.status === filters.status),
  )
}

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(keyOf(row), [...(groups.get(keyOf(row)) ?? []), row])
  return groups
}

const firstValuesSignatures = async (db: PrismaClient, userIds: readonly string[]): Promise<Map<string, Date>> => {
  const rows = await db.onboardingAcknowledgement.findMany({
    where: { userId: { in: [...userIds] }, kind: VALUES_KIND },
    orderBy: { signedAt: 'desc' },
    select: { userId: true, signedAt: true },
  })
  // Newest first, so the first signature, the one that stands, is written last.
  return new Map(rows.map((row) => [row.userId, row.signedAt]))
}

const finishedAtOf = (status: NewHireStatus, signedAt: Date | undefined): string | null =>
  status === 'COMPLETED' ? (signedAt?.toISOString() ?? null) : null

interface RowFacts {
  modules: CourseModule[]
  progress: Map<string, OnboardingProgress[]>
  attempts: Map<string, AcademyAttempt[]>
  signatures: Map<string, Date>
  payments: Map<string, { method: TrackerPaymentStatus['method']; updatedAt: Date }>
  checklists: Map<string, { done: number; total: number }>
}

async function gatherRowFacts(db: PrismaClient, hires: readonly HireRow[]): Promise<RowFacts> {
  const userIds = hires.flatMap((hire) => (hire.userId ? [hire.userId] : []))
  const modules = await listCourseModules(db)
  const [progress, attempts, signatures, payments, checklists] = await Promise.all([
    db.onboardingProgress.findMany({
      where: { userId: { in: userIds }, moduleId: { in: modules.map((m) => m.id) }, source: 'COURSE' },
    }),
    readAcademyAttemptsFor(db, userIds),
    firstValuesSignatures(db, userIds),
    db.onboardingPaymentDetails.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, method: true, updatedAt: true },
    }),
    countChecklists(db, hires.map((hire) => hire.id)),
  ])
  return {
    modules,
    progress: groupBy(progress, (row) => row.userId),
    attempts: groupBy(attempts, (attempt) => attempt.userId),
    signatures,
    payments: new Map(payments.map((row) => [row.userId, row])),
    checklists,
  }
}

function paymentStatusOf(userId: string | null, payments: RowFacts['payments']): TrackerPaymentStatus {
  const payment = userId ? payments.get(userId) : undefined
  return {
    userId,
    saved: payment !== undefined,
    method: payment?.method ?? null,
    lastChangedAt: payment?.updatedAt.toISOString() ?? null,
  }
}

function toRow(hire: HireRow, facts: RowFacts, now: Date): TrackerRow {
  const { userId } = hire
  const rows = (userId && facts.progress.get(userId)) || []
  const latest = userId ? facts.attempts.get(userId)?.[0] : undefined
  const checklist = facts.checklists.get(hire.id)
  return {
    newHireId: hire.id,
    name: hireName(hire),
    title: hire.title,
    department: hire.department,
    location: hireLocation(hire),
    joiningDate: hire.onboardingDate.toISOString(),
    status: hire.status,
    modulesDone: rows.filter((row) => row.status === 'COMPLETED').length,
    modulesTotal: hire.academyReleasedAt ? facts.modules.length : 0,
    overdueCount: rows.filter((row) => moduleCardState(row, now).overdue).length,
    quizScore: quizScoreLabel(latest),
    checklistDone: checklist?.done ?? 0,
    checklistTotal: checklist?.total ?? 0,
    finishedAt: finishedAtOf(hire.status, userId ? facts.signatures.get(userId) : undefined),
    paymentStatus: paymentStatusOf(userId, facts.payments),
  }
}

/** A read must not fail because a write did: the page shows what is stored, and the next load tries again. */
async function syncForRead(db: PrismaClient, newHireIds: readonly string[], now: Date): Promise<void> {
  try {
    await syncChecklists(db, newHireIds, now)
  } catch (error) {
    console.error('[academy] checklist sync failed', { newHireIds, error: error instanceof Error ? error.name : 'unknown' })
  }
}

/** HR's list. OA never comes through here: their list is loadPaymentTracker. */
export async function loadTracker(db: PrismaClient, viewer: TrackerViewer, filters: TrackerFilters): Promise<TrackerRow[]> {
  assertHr(viewer)
  const now = new Date()
  const hires = await listHires(db, filters, now)
  await syncForRead(db, hires.map((hire) => hire.id), now)
  const facts = await gatherRowFacts(db, hires)
  return hires.map((hire) => toRow(hire, facts, now))
}

/** OA's list. Takes no filters: filtering by location or status would tell OA what its rows hide. */
export async function loadPaymentTracker(db: PrismaClient, viewer: TrackerViewer): Promise<OaTrackerRow[]> {
  if (viewer.role !== 'OA') throw forbidden()
  const now = new Date()
  const hires = await listHires(db, {}, now)
  const facts = await gatherRowFacts(db, hires)
  return hires.map((hire) => shapeForRole(toRow(hire, facts, now), 'OA'))
}

async function versionNumbers(db: PrismaClient, ids: readonly string[]): Promise<Map<string, number>> {
  const rows = await db.onboardingModuleVersion.findMany({ where: { id: { in: [...ids] } }, select: { id: true, version: true } })
  return new Map(rows.map((row) => [row.id, row.version]))
}

async function drawerModules(
  db: PrismaClient, modules: readonly CourseModule[], rows: readonly OnboardingProgress[], now: Date,
): Promise<DrawerModule[]> {
  const rowOf = (module: CourseModule) => rows.find((row) => row.moduleId === module.id)
  const versionId = (module: CourseModule) => {
    const row = rowOf(module)
    return row ? versionIdFor(row, module) : module.currentVersionId
  }
  const versions = await versionNumbers(db, modules.map(versionId))
  return modules.map((module, index) => {
    const row = rowOf(module)
    const card = toModuleCard(module, index + 1, row, now)
    return {
      moduleId: module.id,
      slug: module.slug,
      title: module.title,
      number: card.number,
      status: card.status,
      overdue: card.overdue,
      version: versions.get(versionId(module)) ?? null,
      startedAt: row?.startedAt?.toISOString() ?? null,
      dueAt: card.dueAt,
      completedAt: card.completedAt,
      unlockedEarly: Boolean(row?.unlockedEarlyById),
      unlockable: card.status === 'LOCKED' && row !== undefined,
    }
  })
}

/** Wrong answers come from the attempt itself, so a later edit to the question can't change them. */
async function drawerAttempts(db: PrismaClient, attempts: readonly AcademyAttempt[]): Promise<DrawerQuizAttempt[]> {
  const wrongOf = (attempt: AcademyAttempt) => attempt.answers.filter((answer) => !answer.correct)
  const ids = [...new Set(attempts.flatMap((attempt) => wrongOf(attempt).map((answer) => answer.questionId)))]
  const questions = await db.onboardingQuizQuestion.findMany({ where: { id: { in: ids } }, select: { id: true, questionText: true } })
  const textOf = new Map(questions.map((q) => [q.id, q.questionText]))
  return attempts.map((attempt) => ({
    id: attempt.id,
    score: attempt.score,
    total: attempt.totalQuestions,
    passed: attempt.passed,
    takenAt: attempt.createdAt.toISOString(),
    wrongQuestions: wrongOf(attempt).map(({ questionId, chosen, correctAnswer }) => ({
      questionId,
      question: textOf.get(questionId) ?? REMOVED_QUESTION,
      chosen,
      correctAnswer,
    })),
  }))
}

async function drawerAcknowledgements(db: PrismaClient, userId: string): Promise<DrawerAcknowledgement[]> {
  const rows = await db.onboardingAcknowledgement.findMany({
    where: { userId },
    orderBy: { signedAt: 'asc' },
    select: { id: true, kind: true, typedName: true, signedAt: true },
  })
  return rows.map((row) => ({ ...row, signedAt: row.signedAt.toISOString() }))
}

/** Only a link that still passes the rules reaches a page: stored state could be anything. */
function drawerLinkedin(hire: HireRow, state: OnboardingProgress['state'] | undefined): DrawerLinkedin {
  const parsed = linkedinUrlSchema.safeParse(parseProgressState(state).linkedinUrl)
  const url = parsed.success ? parsed.data : null
  const profile = linkedinUrlSchema.safeParse(hire.user?.linkedinUrl)
  return {
    url,
    profileUrl: profile.success ? profile.data : null,
    verified: url !== null && hire.linkedinVerifiedAt !== null && hire.user?.linkedinUrl === url,
    verifiedAt: hire.linkedinVerifiedAt?.toISOString() ?? null,
  }
}

/** The masked reader only: no reveal, no log line. A row that can't be opened must not cost HR the drawer. */
async function drawerPayment(db: PrismaClient, userId: string, viewerId: string): Promise<DrawerPayment | null> {
  try {
    const view = await readPayout(db, userId, { reveal: false, viewerId })
    if (!view) return null
    const { method, accountHolderName, currency, fields, updatedAt } = view
    return { method, accountHolderName, currency, fields, lastChangedAt: updatedAt, unreadable: false }
  } catch (error) {
    // Decryption errors never quote the stored value.
    console.error('[academy] stored payment details could not be read', { userId, error: error instanceof Error ? error.message : 'unknown' })
    const row = await db.onboardingPaymentDetails.findUniqueOrThrow({ where: { userId }, select: { method: true, updatedAt: true } })
    return { method: row.method, accountHolderName: null, currency: null, fields: {}, lastChangedAt: row.updatedAt.toISOString(), unreadable: true }
  }
}

/** HR only: OA gets a 403 here, like anyone else. */
export async function loadDrawer(db: PrismaClient, viewer: TrackerViewer, newHireId: string): Promise<TrackerDrawer> {
  assertHr(viewer)
  const now = new Date()
  const found = await db.newHire.findUnique({ where: { id: newHireId }, select: { id: true } })
  if (!found) throw new AcademyError('New hire not found', 404)
  await syncForRead(db, [newHireId], now)
  const hire = await db.newHire.findUniqueOrThrow({ where: { id: newHireId }, select: HIRE_SELECT })
  const { userId } = hire
  const checklist = await listChecklist(db, newHireId, now)
  const base = {
    newHireId,
    userId,
    name: hireName(hire),
    title: hire.title,
    department: hire.department,
    location: hireLocation(hire),
    joiningDate: hire.onboardingDate.toISOString(),
    status: hire.status,
    releasedAt: hire.academyReleasedAt?.toISOString() ?? null,
    checklist,
  }
  if (!userId) {
    return {
      ...base, finishedAt: null, modules: [], quizAttempts: [], acknowledgements: [],
      linkedin: drawerLinkedin(hire, undefined), payment: null,
    }
  }
  const modules = await listCourseModules(db)
  const rows = await db.onboardingProgress.findMany({
    where: { userId, moduleId: { in: modules.map((m) => m.id) }, source: 'COURSE' },
  })
  const signatures = await firstValuesSignatures(db, [userId])
  const linkedinModule = modules.find((m) => m.slug === LINKEDIN_MODULE_SLUG)
  return {
    ...base,
    finishedAt: finishedAtOf(hire.status, signatures.get(userId)),
    modules: hire.academyReleasedAt ? await drawerModules(db, modules, rows, now) : [],
    quizAttempts: await drawerAttempts(db, await readAcademyAttemptsFor(db, [userId])),
    acknowledgements: await drawerAcknowledgements(db, userId),
    linkedin: drawerLinkedin(hire, rows.find((row) => row.moduleId === linkedinModule?.id)?.state),
    payment: await drawerPayment(db, userId, viewer.id),
  }
}

/** Every signature of one hire, oldest first, dated as it was for the hire. HR only. */
export async function loadAcknowledgementRows(
  db: PrismaClient, viewer: TrackerViewer, newHireId: string,
): Promise<AcknowledgementRow[]> {
  assertHr(viewer)
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: HIRE_SELECT })
  if (!hire) throw new AcademyError('New hire not found', 404)
  if (!hire.userId) return []
  const signed = await db.onboardingAcknowledgement.findMany({ where: { userId: hire.userId }, orderBy: { signedAt: 'asc' } })
  const timeZone = timeZoneFor(hire.user ?? hire)
  return signed.map((row) => ({
    id: row.id,
    name: hireName(hire),
    email: hire.user?.email ?? hire.email,
    kind: row.kind,
    statementText: row.statementText,
    typedName: row.typedName,
    signedOn: formatCertificateDate(row.signedAt.toISOString(), timeZone),
  }))
}
