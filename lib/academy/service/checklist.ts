import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { getSetupReadiness } from '../setup'
import {
  checklistDueAt,
  eventsMet,
  isPastDue,
  toItemState,
  type ChecklistFacts,
  type ChecklistItemView,
  type ChecklistOwnerRole,
} from '../checklist'
import { SETUP_INCLUDE, toSetupSnapshot } from './setup-read'

type Db = PrismaClient | Prisma.TransactionClient

const WITH_TEMPLATE = { templateItem: true } satisfies Prisma.OnboardingChecklistItemInclude
type ItemRow = Prisma.OnboardingChecklistItemGetPayload<{ include: typeof WITH_TEMPLATE }>

function toView(row: ItemRow, now: Date): ChecklistItemView {
  return {
    id: row.id,
    key: row.templateItem.key,
    title: row.title,
    ownerRole: row.ownerRole as ChecklistOwnerRole,
    autoTickEvent: row.templateItem.autoTickEvent,
    dueAt: row.dueAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
    doneById: row.doneById,
    autoTicked: row.autoTicked,
    missReason: row.missReason,
    state: toItemState(row, now),
  }
}

type FirstChecklistHire = { id: string; onboardingDate: Date; teamLeadForm?: { leadInputDueAt: Date | null } | null }

/**
 * Gives a checklist from the active template to the hires who have none. A hire with any rows keeps
 * exactly those: a template change never adds to, or restores a row on, a checklist already created.
 */
async function createFirstChecklists(db: Db, allCandidates: ReadonlyArray<FirstChecklistHire>): Promise<number> {
  // A checklist starts at the first setup save, not at the job: a hire with no saved setup gets none.
  const candidates = allCandidates.filter((hire) => hire.teamLeadForm?.leadInputDueAt != null)
  const existing = await db.onboardingChecklistItem.groupBy({
    by: ['newHireId'],
    where: { newHireId: { in: candidates.map((hire) => hire.id) } },
  })
  const started = new Set(existing.map((row) => row.newHireId))
  const hires = candidates.filter((hire) => !started.has(hire.id))
  if (hires.length === 0) return 0
  const templates = await db.onboardingChecklistTemplateItem.findMany({
    where: { isActive: true },
    select: { id: true, title: true, ownerRole: true, orderIndex: true, dueOffsetDays: true },
  })
  const created = await db.onboardingChecklistItem.createMany({
    data: hires.flatMap((hire) =>
      templates.map((t) => ({
        newHireId: hire.id,
        templateItemId: t.id,
        title: t.title,
        ownerRole: t.ownerRole,
        orderIndex: t.orderIndex,
        dueOffsetDays: t.dueOffsetDays,
        dueAt: checklistDueAt(hire.onboardingDate, t.dueOffsetDays),
      })),
    ),
    skipDuplicates: true,
  })
  return created.count
}

export async function createChecklist(db: Db, newHireId: string): Promise<number> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId },
    select: { id: true, onboardingDate: true, teamLeadForm: { select: { leadInputDueAt: true } } },
  })
  if (!hire) throw new AcademyError('New hire not found', 404)
  return createFirstChecklists(db, [hire])
}

const SYNC_INCLUDE = {
  ...SETUP_INCLUDE,
  user: { select: { ...SETUP_INCLUDE.user.select, discordUsername: true, onboardingCompleted: true } },
} satisfies Prisma.NewHireInclude
type SyncHire = Prisma.NewHireGetPayload<{ include: typeof SYNC_INCLUDE }>

function factsFor(hire: SyncHire, signed: ReadonlySet<string>, paid: ReadonlySet<string>): ChecklistFacts {
  const setup = toSetupSnapshot(hire)
  const { userId } = hire
  return {
    leadInputSubmitted: setup.leadInputSubmitted,
    setupReady: getSetupReadiness(setup).ready,
    userLinked: setup.userLinked,
    courseReleased: hire.academyReleasedAt !== null,
    discordSaved: Boolean(hire.user?.discordUsername?.trim()),
    securityAckSigned: userId !== null && signed.has(userId),
    linkedinVerified: hire.linkedinVerifiedAt !== null,
    paymentSetupDone: userId !== null && paid.has(userId),
    courseCompleted: hire.user?.onboardingCompleted === true,
  }
}

/** The events met by each hire, by hire id. */
async function eventsByHire(db: Db, hires: readonly SyncHire[]): Promise<Map<string, Set<string>>> {
  const userIds = hires.flatMap((hire) => (hire.userId ? [hire.userId] : []))
  const [acks, payments] = await Promise.all([
    db.onboardingAcknowledgement.findMany({
      where: { userId: { in: userIds }, kind: 'SECURITY_SOPS' },
      distinct: ['userId'],
      select: { userId: true },
    }),
    db.onboardingPaymentDetails.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }),
  ])
  const signed = new Set(acks.map((row) => row.userId))
  const paid = new Set(payments.map((row) => row.userId))
  return new Map(hires.map((hire) => [hire.id, eventsMet(factsFor(hire, signed, paid))]))
}

/** One row's write. A row that won't write is logged and skipped, so it can't stop the rest. */
async function writeItem(db: Db, itemId: string, data: Prisma.OnboardingChecklistItemUpdateManyMutationInput): Promise<number> {
  try {
    // Guarded on doneAt: null, so a manual tick that landed since the read is never overwritten.
    const result = await db.onboardingChecklistItem.updateMany({ where: { id: itemId, doneAt: null }, data })
    return result.count
  } catch (error) {
    console.error('[academy] checklist item could not be synced', { itemId, error: error instanceof Error ? error.name : 'unknown' })
    return 0
  }
}

/**
 * For each hire: creates the checklist if they have none, ticks open items whose event is met (never
 * unticks), and moves the due date of open items when the joining date changed. Returns how many items
 * were ticked. The reads don't grow with the list; only rows that actually change are written, one by one.
 */
export async function syncChecklists(db: Db, newHireIds: readonly string[], now: Date = new Date()): Promise<number> {
  if (newHireIds.length === 0) return 0
  const hires = await db.newHire.findMany({ where: { id: { in: [...newHireIds] } }, include: SYNC_INCLUDE })
  await createFirstChecklists(db, hires)
  const met = await eventsByHire(db, hires)
  const joining = new Map(hires.map((hire) => [hire.id, hire.onboardingDate]))
  const open = await db.onboardingChecklistItem.findMany({ where: { newHireId: { in: [...newHireIds] }, doneAt: null }, include: WITH_TEMPLATE })
  let ticked = 0
  for (const item of open) {
    const joiningDate = joining.get(item.newHireId)
    if (!joiningDate) continue
    const event = item.templateItem.autoTickEvent
    const dueAt = checklistDueAt(joiningDate, item.dueOffsetDays ?? item.templateItem.dueOffsetDays)
    const tick = event !== null && met.get(item.newHireId)?.has(event) === true
    if (!tick && dueAt.getTime() === item.dueAt.getTime()) continue
    const written = await writeItem(db, item.id, tick ? { dueAt, doneAt: now, autoTicked: true } : { dueAt })
    if (tick && written === 1) ticked += 1
  }
  return ticked
}

/** One hire's sync. Returns how many items were ticked. */
export async function syncChecklist(db: Db, newHireId: string, now: Date = new Date()): Promise<number> {
  const found = await db.newHire.findUnique({ where: { id: newHireId }, select: { id: true } })
  if (!found) throw new AcademyError('New hire not found', 404)
  return syncChecklists(db, [newHireId], now)
}

/** Done and total for each hire, for lists. Hires with no rows are absent. */
export async function countChecklists(db: Db, newHireIds: readonly string[]): Promise<Map<string, { done: number; total: number }>> {
  const rows = await db.onboardingChecklistItem.findMany({
    where: { newHireId: { in: [...newHireIds] } },
    select: { newHireId: true, doneAt: true },
  })
  const counts = new Map<string, { done: number; total: number }>()
  for (const row of rows) {
    const current = counts.get(row.newHireId) ?? { done: 0, total: 0 }
    counts.set(row.newHireId, { done: current.done + (row.doneAt ? 1 : 0), total: current.total + 1 })
  }
  return counts
}

/** One hire's items in template order, each with its state. */
export async function listChecklist(db: Db, newHireId: string, now: Date = new Date()): Promise<ChecklistItemView[]> {
  const rows = await db.onboardingChecklistItem.findMany({
    where: { newHireId },
    include: WITH_TEMPLATE,
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map((row) => toView(row, now))
}

export interface TickInput {
  done: boolean
  missReason?: string
}

/** Permission is the route's job (canTickItem); this enforces the data rules. */
export async function tickItem(
  db: Db,
  itemId: string,
  actorId: string,
  input: TickInput,
  now: Date = new Date(),
): Promise<ChecklistItemView> {
  const item = await db.onboardingChecklistItem.findUnique({ where: { id: itemId }, include: WITH_TEMPLATE })
  if (!item) throw new AcademyError('Checklist item not found', 404)
  const reason = input.missReason?.trim() || null
  const data = input.done ? tickData(item, actorId, reason, now) : untickData(item)
  const saved = data ? await db.onboardingChecklistItem.update({ where: { id: itemId }, data, include: WITH_TEMPLATE }) : item
  return toView(saved, now)
}

function tickData(item: ItemRow, actorId: string, reason: string | null, now: Date): Prisma.OnboardingChecklistItemUpdateInput | null {
  if (item.doneAt) return reason ? { missReason: reason } : null
  if (isPastDue(item.dueAt, now) && !reason) throw new AcademyError('Add a reason for missing this date.', 400)
  return {
    doneAt: now,
    autoTicked: false,
    doneBy: { connect: { id: actorId } },
    ...(reason ? { missReason: reason } : {}),
  }
}

function untickData(item: ItemRow): Prisma.OnboardingChecklistItemUpdateInput | null {
  if (!item.doneAt) return null
  if (item.autoTicked) throw new AcademyError('This item ticks itself, so it cannot be unticked.', 400)
  return { doneAt: null, doneBy: { disconnect: true }, missReason: null }
}
