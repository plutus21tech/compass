// Pure rules for the HR onboarding checklist. No server-only imports: safe for client components.

const DAY_MS = 24 * 60 * 60 * 1000
const SATURDAY = 6
const SUNDAY = 0

export const AUTO_TICK_EVENTS = [
  'LEAD_INPUT_SUBMITTED',
  'SETUP_READY',
  'ACCOUNT_LINKED',
  'COURSE_RELEASED',
  'DISCORD_USERNAME_SAVED',
  'SECURITY_ACK_SIGNED',
  'LINKEDIN_VERIFIED',
  'PAYMENT_SETUP_DONE',
  'COURSE_COMPLETED',
] as const

export type AutoTickEvent = (typeof AUTO_TICK_EVENTS)[number]
export type ChecklistOwnerRole = 'HR' | 'SECURITY' | 'OA' | 'TEAM_LEAD'
export type ItemState = 'OPEN' | 'OVERDUE' | 'DONE' | 'DONE_LATE' | 'DONE_LATE_NEEDS_REASON'

/** Calendar days from the joining date (stored at UTC midnight); a weekend result moves back to the Friday before. */
export function checklistDueAt(joiningDate: Date, offsetDays: number): Date {
  const due = new Date(joiningDate.getTime() + offsetDays * DAY_MS)
  const weekday = due.getUTCDay()
  if (weekday === SATURDAY) return new Date(due.getTime() - DAY_MS)
  if (weekday === SUNDAY) return new Date(due.getTime() - 2 * DAY_MS)
  return due
}

export interface ChecklistFacts {
  leadInputSubmitted: boolean
  setupReady: boolean
  userLinked: boolean
  courseReleased: boolean
  discordSaved: boolean
  securityAckSigned: boolean
  linkedinVerified: boolean
  paymentSetupDone: boolean
  courseCompleted: boolean
}

const EVENT_FACTS: Record<AutoTickEvent, keyof ChecklistFacts> = {
  LEAD_INPUT_SUBMITTED: 'leadInputSubmitted',
  SETUP_READY: 'setupReady',
  ACCOUNT_LINKED: 'userLinked',
  COURSE_RELEASED: 'courseReleased',
  DISCORD_USERNAME_SAVED: 'discordSaved',
  SECURITY_ACK_SIGNED: 'securityAckSigned',
  LINKEDIN_VERIFIED: 'linkedinVerified',
  PAYMENT_SETUP_DONE: 'paymentSetupDone',
  COURSE_COMPLETED: 'courseCompleted',
}

/** The auto-tick events whose fact currently holds. */
export function eventsMet(facts: ChecklistFacts): Set<string> {
  return new Set(AUTO_TICK_EVENTS.filter((event) => facts[EVENT_FACTS[event]]))
}

export interface ItemTiming {
  dueAt: Date
  doneAt: Date | null
  autoTicked: boolean
  missReason: string | null
}

/** A date is met through the whole of its day. */
export function isPastDue(dueAt: Date, at: Date): boolean {
  return at.getTime() >= dueAt.getTime() + DAY_MS
}

export function toItemState(item: ItemTiming, now: Date): ItemState {
  if (!item.doneAt) return isPastDue(item.dueAt, now) ? 'OVERDUE' : 'OPEN'
  if (!isPastDue(item.dueAt, item.doneAt)) return 'DONE'
  return item.missReason ? 'DONE_LATE' : 'DONE_LATE_NEEDS_REASON'
}

/** The hire's assigned team lead owns the team lead items, whatever their role; HR any item; Security and OA their own. */
export function canTickItem(
  role: string,
  item: { ownerRole: ChecklistOwnerRole },
  leadUserId: string | null,
  userId: string,
): boolean {
  if (item.ownerRole === 'TEAM_LEAD' && leadUserId === userId) return true
  if (role === 'HR') return true
  return (role === 'SECURITY' || role === 'OA') && item.ownerRole === role
}

/** JSON-safe: dates are ISO strings. */
export interface ChecklistItemView {
  id: string
  key: string
  title: string
  ownerRole: ChecklistOwnerRole
  autoTickEvent: string | null
  dueAt: string
  doneAt: string | null
  doneById: string | null
  autoTicked: boolean
  missReason: string | null
  state: ItemState
}
