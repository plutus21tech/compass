import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import {
  checklistDueAt,
  eventsMet,
  isPastDue,
  toItemState,
  type ChecklistFacts,
  type ChecklistItemView,
  type ChecklistOwnerRole,
} from '../checklist'
import { loadSetup } from './setup'

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

/** Creates the rows a hire is missing from the active template. Existing rows are never touched. */
export async function createChecklist(db: Db, newHireId: string): Promise<number> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { onboardingDate: true } })
  if (!hire) throw new AcademyError('New hire not found', 404)
  const templates = await db.onboardingChecklistTemplateItem.findMany({
    where: { isActive: true },
    select: { id: true, dueOffsetDays: true },
  })
  const created = await db.onboardingChecklistItem.createMany({
    data: templates.map((t) => ({
      newHireId,
      templateItemId: t.id,
      dueOffsetDays: t.dueOffsetDays,
      dueAt: checklistDueAt(hire.onboardingDate, t.dueOffsetDays),
    })),
    skipDuplicates: true,
  })
  return created.count
}

async function gatherFacts(db: Db, newHireId: string): Promise<ChecklistFacts> {
  const hire = await db.newHire.findUniqueOrThrow({
    where: { id: newHireId },
    select: {
      userId: true,
      academyReleasedAt: true,
      linkedinVerifiedAt: true,
      user: { select: { discordUsername: true, onboardingCompleted: true } },
    },
  })
  const { setup, readiness } = await loadSetup(db, newHireId)
  const userId = hire.userId
  const [acks, payments] = userId
    ? await Promise.all([
        db.onboardingAcknowledgement.count({ where: { userId, kind: 'SECURITY_SOPS' } }),
        db.onboardingPaymentDetails.count({ where: { userId } }),
      ])
    : [0, 0]
  return {
    leadInputSubmitted: setup.leadInputSubmitted,
    setupReady: readiness.ready,
    userLinked: setup.userLinked,
    courseReleased: hire.academyReleasedAt !== null,
    discordSaved: Boolean(hire.user?.discordUsername?.trim()),
    securityAckSigned: acks > 0,
    linkedinVerified: hire.linkedinVerifiedAt !== null,
    paymentSetupDone: payments > 0,
    courseCompleted: hire.user?.onboardingCompleted === true,
  }
}

/**
 * Backfills missing rows, ticks open items whose event is met (never unticks), and moves the due
 * date of open items when the joining date changed. Returns how many items were ticked.
 */
export async function syncChecklist(db: Db, newHireId: string, now: Date = new Date()): Promise<number> {
  await createChecklist(db, newHireId)
  const hire = await db.newHire.findUniqueOrThrow({ where: { id: newHireId }, select: { onboardingDate: true } })
  const met = eventsMet(await gatherFacts(db, newHireId))
  const open = await db.onboardingChecklistItem.findMany({ where: { newHireId, doneAt: null }, include: WITH_TEMPLATE })
  let ticked = 0
  for (const item of open) {
    const event = item.templateItem.autoTickEvent
    const dueAt = checklistDueAt(hire.onboardingDate, item.dueOffsetDays ?? item.templateItem.dueOffsetDays)
    const tick = event !== null && met.has(event)
    if (!tick && dueAt.getTime() === item.dueAt.getTime()) continue
    // Guarded on doneAt: null, so a manual tick that landed since the read is never overwritten.
    const data = tick ? { dueAt, doneAt: now, autoTicked: true } : { dueAt }
    const result = await db.onboardingChecklistItem.updateMany({ where: { id: item.id, doneAt: null }, data })
    if (tick && result.count === 1) ticked += 1
  }
  return ticked
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
