import { prisma } from '@/lib/db'
import { categoryCoverage } from '../coverage'
import { evaluatorDrift } from '../drift'
import { renderHrReminderEmail } from '../emails-round'
import type { CoverageView, DashboardResponse, DepartmentProgressView, EvaluatorStatsView, WeekProgressView } from '../view-types'
import { loadAnswerRecords } from './answer-states'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, loadCycle } from './cycles'
import { WeeklyError } from './errors'
import { deliverOnce, weeklyDedupeKey, type WeeklySendMail, type WeeklySendResult } from './notifications'

export async function coverageRows(cycleId: string): Promise<CoverageView[]> {
  const slots = await prisma.weeklySlot.findMany({
    where: { cycleId },
    select: { evaluatorId: true, evaluateeId: true, status: true, competency: { select: { perspective: true } } },
  })
  const rows = categoryCoverage(slots.map((s) => ({ evaluatorId: s.evaluatorId, evaluateeId: s.evaluateeId, perspective: s.competency.perspective, status: s.status })))
  const people = await loadPeople(rows.map((r) => r.evaluateeId))
  return rows
    .map((r) => ({
      evaluatee: personRef(people, r.evaluateeId), perspective: r.perspective, satisfied: r.satisfied, total: r.total,
      evaluatorsContributing: r.evaluatorsContributing, share: r.share, lowEvidence: r.lowEvidence,
    }))
    .sort((a, b) => Number(b.lowEvidence) - Number(a.lowEvidence) || a.share - b.share || byName(a.evaluatee, b.evaluatee))
}

export async function lowEvidenceRows(cycleId: string): Promise<CoverageView[]> {
  return (await coverageRows(cycleId)).filter((row) => row.lowEvidence)
}

async function evaluatorStats(cycleId: string, currentWeek: number): Promise<EvaluatorStatsView[]> {
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, kind: { not: 'COMMENT' }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
    select: { evaluatorId: true, status: true, weekIndex: true },
  })
  const people = await loadPeople(prompts.map((p) => p.evaluatorId))
  const byEvaluator = new Map<string, EvaluatorStatsView>()
  for (const p of prompts) {
    const row = byEvaluator.get(p.evaluatorId) ?? { evaluator: personRef(people, p.evaluatorId), released: 0, answered: 0, notObserved: 0, open: 0, overdue: 0, responseRate: null }
    const open = p.status === 'OPEN' || p.status === 'DRAFT'
    byEvaluator.set(p.evaluatorId, {
      ...row,
      released: row.released + 1,
      answered: row.answered + (p.status === 'SUBMITTED' ? 1 : 0),
      notObserved: row.notObserved + (p.status === 'NOT_OBSERVED' ? 1 : 0),
      open: row.open + (open ? 1 : 0),
      overdue: row.overdue + (open && p.weekIndex < currentWeek ? 1 : 0),
    })
  }
  return [...byEvaluator.values()]
    .map((row) => {
      const handled = row.answered + row.notObserved
      return { ...row, responseRate: handled + row.open > 0 ? handled / (handled + row.open) : null }
    })
    .sort((a, b) => (a.responseRate ?? 1) - (b.responseRate ?? 1) || byName(a.evaluator, b.evaluator))
}

export async function dashboardView(actor: WeeklyActor, cycleId: string, now: Date): Promise<DashboardResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const summary = cycleSummary(cycle, now)
  const [records, coverage, evaluators, progress] = await Promise.all([loadAnswerRecords({ cycleId }), coverageRows(cycleId), evaluatorStats(cycleId, summary.currentWeek), progressBreakdown(cycleId, now)])
  const drift = evaluatorDrift(records.flatMap((r) => (r.score === null ? [] : [{ evaluatorId: r.evaluatorId, perspective: r.perspective, finalScore: r.score }])))
  const people = await loadPeople(drift.map((d) => d.evaluatorId))
  return {
    cycle: summary,
    coverage,
    evaluators,
    drift: drift.map((d) => ({ evaluator: personRef(people, d.evaluatorId), perspective: d.perspective, difference: d.difference, count: d.count })),
    ...progress,
  }
}

const ANSWERED = new Set(['SUBMITTED', 'NOT_OBSERVED'])
const OPEN = new Set(['OPEN', 'DRAFT'])

/** The people HR's reminder has reached today (the bulk button and the per-person one share a key). */
async function remindedToday(evaluatorIds: readonly string[], now: Date): Promise<Set<string>> {
  if (evaluatorIds.length === 0) return new Set()
  const keys = evaluatorIds.map((id) => weeklyDedupeKey('weekly-hr-reminder', id, now))
  const rows = await prisma.weeklyNotification.findMany({ where: { dedupeKey: { in: keys } }, select: { userId: true } })
  return new Set(rows.map((r) => r.userId))
}

/** UX spec, HR step 6: progress by week and by department, counting the questions still asked (not cancelled or expired). */
async function progressBreakdown(cycleId: string, now: Date): Promise<{ byWeek: WeekProgressView[]; byDepartment: DepartmentProgressView[] }> {
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, kind: { not: 'COMMENT' }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
    select: { evaluatorId: true, status: true, weekIndex: true },
  })
  const people = await loadPeople(prompts.map((p) => p.evaluatorId))
  const weeks = new Map<number, { week: number; asked: number; answered: number; open: Map<string, number> }>()
  const departments = new Map<string, DepartmentProgressView & { ids: Set<string> }>()
  for (const p of prompts) {
    const answered = ANSWERED.has(p.status) ? 1 : 0
    const week = weeks.get(p.weekIndex) ?? { week: p.weekIndex, asked: 0, answered: 0, open: new Map<string, number>() }
    const open = OPEN.has(p.status) ? new Map([...week.open, [p.evaluatorId, (week.open.get(p.evaluatorId) ?? 0) + 1]]) : week.open
    weeks.set(p.weekIndex, { ...week, asked: week.asked + 1, answered: week.answered + answered, open })
    const name = people.get(p.evaluatorId)?.department ?? 'No department'
    const dept = departments.get(name) ?? { department: name, evaluators: 0, asked: 0, answered: 0, ids: new Set<string>() }
    departments.set(name, { ...dept, ids: new Set([...dept.ids, p.evaluatorId]), asked: dept.asked + 1, answered: dept.answered + answered })
  }
  const reminded = await remindedToday([...new Set([...weeks.values()].flatMap((w) => [...w.open.keys()]))], now)
  return {
    byWeek: [...weeks.values()]
      .map(({ open, ...w }) => ({
        ...w,
        pending: [...open].map(([id, count]) => ({ evaluator: personRef(people, id), open: count, remindedToday: reminded.has(id) }))
          .sort((a, b) => byName(a.evaluator, b.evaluator)),
      }))
      .sort((a, b) => a.week - b.week),
    byDepartment: [...departments.values()].map(({ ids, ...d }) => ({ ...d, evaluators: ids.size })).sort((a, b) => a.department.localeCompare(b.department)),
  }
}

/**
 * HR's "Send reminders" (UX spec, HR step 6): everyone with an open question, or just `evaluatorId` (the Remind button
 * next to someone pending in a week). At most once a Karachi day per person, whichever button sent it. Anyone with
 * questions from an earlier week is told in red they are overdue.
 */
export async function sendHrReminders(actor: WeeklyActor, cycleId: string, now: Date, send: WeeklySendMail, appUrl: string, evaluatorId?: string): Promise<WeeklySendResult> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('Reminders can be sent only while the round is open', 409)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: cycle.periodId }, select: { isLocked: true } })
  if (period?.isLocked) throw new WeeklyError('This round is locked, so nobody can answer', 409)
  const { currentWeek } = cycleSummary(cycle, now)
  const open = await prisma.weeklyPrompt.findMany({
    where: { cycleId, kind: { not: 'COMMENT' }, status: { in: ['OPEN', 'DRAFT'] }, ...(evaluatorId ? { evaluatorId } : {}) },
    select: { evaluatorId: true, weekIndex: true },
  })
  if (evaluatorId && open.length === 0) throw new WeeklyError('This person has no open questions', 409)
  const counts = new Map<string, { open: number; overdue: number }>()
  for (const p of open) {
    const row = counts.get(p.evaluatorId) ?? { open: 0, overdue: 0 }
    counts.set(p.evaluatorId, { open: row.open + 1, overdue: row.overdue + (p.weekIndex < currentWeek ? 1 : 0) })
  }
  return deliverOnce([...counts].map(([userId, c]) => ({
    userId, kind: 'weekly-hr-reminder' as const, dedupeKey: weeklyDedupeKey('weekly-hr-reminder', userId, now),
    render: (name: string) => renderHrReminderEmail({ name, openCount: c.open, overdueCount: c.overdue, appUrl }),
  })), send)
}
