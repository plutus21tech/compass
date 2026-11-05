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
    title: row.templateItem.title,
    ownerRole: row.templateItem.ownerRole as ChecklistOwnerRole,
    autoTickEvent: row.templateItem.autoTickEvent,
    dueAt: row.dueAt.toISOString(),
    doneAt: row.doneAt?.toISOString() ?? null,
    doneById: row.doneById,
    autoTicked: row.autoTicked,
    missReason: row.missReason,
    state: toItemState(row, now),
  }
}

/** Creates the rows these hires are missing from the active template. Existing rows are never touched. */
async function createMissingItems(db: Db, hires: ReadonlyArray<{ id: string; onboardingDate: Date }>): Promise<number> {
  const templates = await db.onboardingChecklistTemplateItem.findMany({
    where: { isActive: true },
    select: { id: true, dueOffsetDays: true },
  })
  const created = await db.onboardingChecklistItem.createMany({
    data: hires.flatMap((hire) =>
      templates.map((t) => ({
        newHireId: hire.id,
        templateItemId: t.id,
        dueOffsetDays: t.dueOffsetDays,
        dueAt: checklistDueAt(hire.onboardingDate, t.dueOffsetDays),
      })),
    ),
    skipDuplicates: true,
  })
  return created.count
}

export async function createChecklist(db: Db, newHireId: string): Promise<number> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { id: true, onboardingDate: true } })
  if (!hire) throw new AcademyError('New hire not found', 404)
  return createMissingItems(db, [hire])
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

/**
 * For each hire: backfills missing rows, ticks open items whose event is met (never unticks), and
 * moves the due date of open items when the joining date changed. Returns how many items were ticked.
 * The reads don't grow with the list; only rows that actually change are written, one by one.
 */
export async function syncChecklists(db: Db, newHireIds: readonly string[], now: Date = new Date()): Promise<number> {
  if (newHireIds.length === 0) return 0
  const hires = await db.newHire.findMany({ where: { id: { in: [...newHireIds] } }, include: SYNC_INCLUDE })
  await createMissingItems(db, hires)
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
    // Guarded on doneAt: null, so a manual tick that landed since the read is never overwritten.
    const data = tick ? { dueAt, doneAt: now, autoTicked: true } : { dueAt }
    const result = await db.onboardingChecklistItem.updateMany({ where: { id: item.id, doneAt: null }, data })
    if (tick && result.count === 1) ticked += 1
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
  return rows.reduce((counts, row) => {
    const current = counts.get(row.newHireId) ?? { done: 0, total: 0 }
    return new Map(counts).set(row.newHireId, { done: current.done + (row.doneAt ? 1 : 0), total: current.total + 1 })
  }, new Map<string, { done: number; total: number }>())
}

/** One hire's items in template order, each with its state. */
export async function listChecklist(db: Db, newHireId: string, now: Date = new Date()): Promise<ChecklistItemView[]> {
  const rows = await db.onboardingChecklistItem.findMany({
    where: { newHireId },
    include: WITH_TEMPLATE,
    orderBy: { templateItem: { orderIndex: 'asc' } },
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
