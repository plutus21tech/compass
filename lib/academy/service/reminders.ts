import type { ChecklistOwnerRole, Prisma, PrismaClient } from '@prisma/client'
import {
  sendBuddyNotice,
  sendChecklistDigestNotice,
  sendLeadInputOverdueNotice,
  sendModuleOverdueNotice,
} from '@/lib/email'
import { isPastDue } from '../checklist'
import { isOwnerChasable, isReminderWindow, localDateKey, oldestOverdue, overdueDayCount } from '../reminders'
import { parseProgressState } from '../progress'
import { isLeadInputSubmitted } from '../setup'
import { timeZoneFor } from '../time'
import { syncChecklists } from './checklist'
import { LINKEDIN_MODULE_SLUG } from './fields'
import { deliverOnce, type SendResult } from './notify'
import { listCourseModules } from './progress'
import { SETUP_INCLUDE } from './setup-read'
import { listedWhere } from './tracker'

/** Newest joiners first, so anything cut off is the oldest and most likely stale. */
const MAX_HIRES = 200
const LEAD_COPIED_FROM_DAY = 2
const OWNER_ROLES = ['HR', 'SECURITY', 'OA'] as const

export interface ReminderSenders {
  leadInputOverdue(input: { to: string; leadName: string; hireName: string; newHireId: string }): Promise<SendResult>
  buddy(input: { to: string; buddyName: string; hireName: string }): Promise<SendResult>
  moduleOverdue(input: { to: string; cc: string | null; hireName: string; moduleCount: number }): Promise<SendResult>
  checklistDigest(input: {
    to: readonly string[]
    hireName: string
    newHireId: string
    ownerRole: ChecklistOwnerRole
    items: ReadonlyArray<{ title: string; dueDate: string; overdue: boolean }>
  }): Promise<SendResult>
}

export const emailSenders: ReminderSenders = {
  leadInputOverdue: sendLeadInputOverdueNotice,
  buddy: sendBuddyNotice,
  moduleOverdue: sendModuleOverdueNotice,
  checklistDigest: sendChecklistDigestNotice,
}

export interface JobSummary {
  /** Hires looked at. */
  hires: number
  /** True when more hires were open than one run takes. */
  limited: boolean
  /** Checklist items auto-ticked. */
  ticked: number
  sent: number
  failed: number
  /** Notices due that had nobody to go to. Their keys stay free, so a later run still sends them. */
  noRecipient: number
}

const HIRE_SELECT = {
  id: true,
  name: true,
  preferredName: true,
  email: true,
  status: true,
  userId: true,
  onboardingDate: true,
  academyReleasedAt: true,
  officeLocation: true,
  remoteCountry: true,
  teamLead: { select: { name: true, email: true } },
  buddy: { select: { name: true, email: true } },
  teamLeadForm: { select: { ...SETUP_INCLUDE.teamLeadForm.select, createdAt: true } },
  user: { select: { name: true, email: true, officeLocation: true, remoteCountry: true, onboardingCompleted: true } },
} satisfies Prisma.NewHireSelect

type Hire = Prisma.NewHireGetPayload<{ select: typeof HIRE_SELECT }>
type Outcome = 'SENT' | 'ALREADY_SENT' | 'FAILED' | 'NO_RECIPIENT' | 'NOT_DUE'

interface JobContext {
  db: PrismaClient
  now: Date
  senders: ReminderSenders
  moduleIds: string[]
  ownerEmails: ReadonlyMap<ChecklistOwnerRole, string[]>
}

/** One hire at this moment: their zone's date decides the keys. */
interface HireTurn {
  job: JobContext
  hire: Hire
  hireName: string
  timeZone: string | null
  date: string
}

function logFailure(step: string, ids: { newHireId: string }, error: unknown): void {
  console.error('[academy] reminder step failed', { step, ...ids, error: error instanceof Error ? error.name : 'unknown' })
}

/** One step's failure stays that step's: the rest of the hire and the rest of the run carry on. */
async function guarded(step: string, ids: { newHireId: string }, run: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await run()
  } catch (error) {
    logFailure(step, ids, error)
    return 'FAILED'
  }
}

const isFinished = (hire: Hire): boolean => hire.status === 'COMPLETED' || hire.user?.onboardingCompleted === true
const storedDate = (date: Date): string => date.toISOString().slice(0, 10)

async function leadInputNotice({ job, hire, hireName, timeZone, date }: HireTurn): Promise<Outcome> {
  const form = hire.teamLeadForm
  const dueAt = form?.leadInputDueAt
  if (!form || !dueAt || !isPastDue(dueAt, job.now) || isLeadInputSubmitted(form)) return 'NOT_DUE'
  // A setup saved after the due date has just sent the first request: the reminder starts tomorrow.
  if (localDateKey(form.createdAt, timeZone) === date) return 'NOT_DUE'
  const lead = hire.teamLead
  if (!lead?.email) return 'NO_RECIPIENT'
  const to = lead.email
  return deliverOnce(job.db, `lead-input:${hire.id}:${date}`, () =>
    job.senders.leadInputOverdue({ to, leadName: lead.name, hireName, newHireId: hire.id }),
  )
}

/** The joining date is stored as a plain date at UTC midnight, so it is compared as it stands. */
async function buddyNotice({ job, hire, hireName, date }: HireTurn): Promise<Outcome> {
  if (storedDate(hire.onboardingDate) !== date) return 'NOT_DUE'
  const buddy = hire.buddy
  if (!buddy) return 'NOT_DUE'
  if (!buddy.email) return 'NO_RECIPIENT'
  const to = buddy.email
  return deliverOnce(job.db, `buddy:${hire.id}`, () => job.senders.buddy({ to, buddyName: buddy.name, hireName }))
}

async function overdueNotice({ job, hire, hireName, timeZone, date }: HireTurn): Promise<Outcome> {
  const { userId } = hire
  if (!userId || !hire.academyReleasedAt) return 'NOT_DUE'
  const rows = await job.db.onboardingProgress.findMany({
    where: { userId, moduleId: { in: job.moduleIds }, source: 'COURSE', status: { not: 'COMPLETED' }, dueAt: { not: null } },
    select: { status: true, startedAt: true, dueAt: true, unlockedEarlyById: true },
  })
  const overdue = oldestOverdue(rows, job.now)
  if (!overdue) return 'NOT_DUE'
  const to = hire.user?.email ?? hire.email
  const copyLead = overdueDayCount(overdue.oldestDueAt, job.now, timeZone) >= LEAD_COPIED_FROM_DAY
  const cc = copyLead ? (hire.teamLead?.email ?? null) : null
  return deliverOnce(job.db, `overdue:${userId}:${date}`, () =>
    job.senders.moduleOverdue({ to, cc, hireName, moduleCount: overdue.count }),
  )
}

/** Only a link the hire saved in the module can be verified, so only that counts as submitted. */
async function hasSubmittedLinkedin(job: JobContext, userId: string | null): Promise<boolean> {
  if (!userId) return false
  const row = await job.db.onboardingProgress.findFirst({
    where: { userId, module: { slug: LINKEDIN_MODULE_SLUG } },
    select: { state: true },
  })
  return parseProgressState(row?.state).linkedinUrl !== undefined
}

function ownerAddresses(job: JobContext, hire: Hire, ownerRole: ChecklistOwnerRole): string[] {
  if (ownerRole !== 'TEAM_LEAD') return job.ownerEmails.get(ownerRole) ?? []
  return hire.teamLead?.email ? [hire.teamLead.email] : []
}

/** One digest per hire, per owner, per day. A failure takes the whole digest to a later run. */
async function checklistNotices({ job, hire, hireName, date }: HireTurn): Promise<Outcome[]> {
  // Only a saved setup sets this: hires from before the Academy have nothing to be chased for.
  if (!hire.teamLeadForm?.leadInputDueAt) return []
  const open = await job.db.onboardingChecklistItem.findMany({
    where: { newHireId: hire.id, doneAt: null },
    select: { dueAt: true, title: true, ownerRole: true, templateItem: { select: { key: true, autoTickEvent: true } } },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  })
  const due = open.filter((item) => storedDate(item.dueAt) <= date)
  const linkedinSubmitted = due.some((item) => item.templateItem.autoTickEvent === 'LINKEDIN_VERIFIED')
    ? await hasSubmittedLinkedin(job, hire.userId)
    : false
  const chasable = due.filter((item) => isOwnerChasable(item.templateItem, linkedinSubmitted))

  const outcomes: Outcome[] = []
  for (const ownerRole of new Set(chasable.map((item) => item.ownerRole))) {
    const to = ownerAddresses(job, hire, ownerRole)
    const items = chasable
      .filter((item) => item.ownerRole === ownerRole)
      .map((item) => {
        const dueDate = storedDate(item.dueAt)
        return { title: item.title, dueDate, overdue: dueDate < date }
      })
    outcomes.push(
      to.length === 0
        ? 'NO_RECIPIENT'
        : await guarded('checklist', { newHireId: hire.id }, () =>
            deliverOnce(job.db, `check:${hire.id}:${ownerRole}:${date}`, () =>
              job.senders.checklistDigest({ to, hireName, newHireId: hire.id, ownerRole, items }),
            ),
          ),
    )
  }
  return outcomes
}

/** Null when the sync failed: that hire's checklist may be stale, so nobody is mailed about it. */
async function syncHire(job: JobContext, newHireId: string): Promise<number | null> {
  try {
    return await syncChecklists(job.db, [newHireId], job.now)
  } catch (error) {
    logFailure('sync', { newHireId }, error)
    return null
  }
}

async function noticesFor(turn: HireTurn, checklistFresh: boolean): Promise<Outcome[]> {
  const newHireId = turn.hire.id
  const personal: Outcome[] = isFinished(turn.hire)
    ? []
    : [
        await guarded('lead-input', { newHireId }, () => leadInputNotice(turn)),
        await guarded('buddy', { newHireId }, () => buddyNotice(turn)),
        await guarded('overdue', { newHireId }, () => overdueNotice(turn)),
      ]
  if (!checklistFresh) return personal
  try {
    return [...personal, ...(await checklistNotices(turn))]
  } catch (error) {
    logFailure('checklist', { newHireId }, error)
    return [...personal, 'FAILED']
  }
}

async function runHire(job: JobContext, hire: Hire): Promise<{ ticked: number; outcomes: Outcome[] }> {
  const ticked = await syncHire(job, hire.id)
  const syncOutcomes: Outcome[] = ticked === null ? ['FAILED'] : []
  const timeZone = timeZoneFor(hire.user ?? hire)
  if (!isReminderWindow(job.now, timeZone)) return { ticked: ticked ?? 0, outcomes: syncOutcomes }
  const turn: HireTurn = {
    job,
    hire,
    timeZone,
    hireName: hire.preferredName?.trim() || hire.user?.name || hire.name,
    date: localDateKey(job.now, timeZone),
  }
  return { ticked: ticked ?? 0, outcomes: [...syncOutcomes, ...(await noticesFor(turn, ticked !== null))] }
}

async function loadOwnerEmails(db: PrismaClient): Promise<Map<ChecklistOwnerRole, string[]>> {
  const users = await db.user.findMany({
    where: { role: { in: [...OWNER_ROLES] }, email: { not: null } },
    select: { role: true, email: true },
  })
  return new Map(
    OWNER_ROLES.map((role) => [role, users.flatMap((user) => (user.role === role && user.email ? [user.email] : []))]),
  )
}

/**
 * The reminder job (three daily runs, see vercel.json). Hires are the tracker's list: everyone not finished, in any status, plus those who
 * finished lately, whose checklist can outlast the course. Finished hires get checklist notices only.
 * Runs may overlap or repeat: every notice goes through the once-only log.
 */
export async function runOnboardingJob(db: PrismaClient, now: Date, senders: ReminderSenders): Promise<JobSummary> {
  const [hires, modules, ownerEmails] = await Promise.all([
    db.newHire.findMany({
      where: listedWhere(now),
      select: HIRE_SELECT,
      orderBy: [{ onboardingDate: 'desc' }, { id: 'asc' }],
      take: MAX_HIRES,
    }),
    listCourseModules(db),
    loadOwnerEmails(db),
  ])
  const limited = hires.length === MAX_HIRES
  if (limited) console.warn('[academy] reminder job reached its hire limit', { limit: MAX_HIRES })

  const job: JobContext = { db, now, senders, moduleIds: modules.map((module) => module.id), ownerEmails }
  const results: Array<{ ticked: number; outcomes: Outcome[] }> = []
  for (const hire of hires) results.push(await runHire(job, hire))

  const outcomes = results.flatMap((result) => result.outcomes)
  const count = (outcome: Outcome): number => outcomes.filter((value) => value === outcome).length
  const summary: JobSummary = {
    hires: hires.length,
    limited,
    ticked: results.reduce((total, result) => total + result.ticked, 0),
    sent: count('SENT'),
    failed: count('FAILED'),
    noRecipient: count('NO_RECIPIENT'),
  }
  console.info('[academy] reminder job', summary)
  if (summary.noRecipient > 0) console.warn('[academy] reminder notices had no recipient', { count: summary.noRecipient })
  return summary
}
