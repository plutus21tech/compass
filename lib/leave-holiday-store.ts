import type { Prisma } from '@prisma/client'
import { calculateLeaveDuration, type LeaveHolidayKeys } from '@/lib/leave-utils'
import { leaveHolidayKeysForTeam } from '@/lib/leave-holidays'

/**
 * Database side of leave-calendar holidays: which days a person is not charged for,
 * and keeping already-charged balances right when HR changes a holiday.
 *
 * Every function takes the client to use so it can run inside the caller's transaction.
 */

type Db = Prisma.TransactionClient

const DAY_MS = 24 * 60 * 60 * 1000

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/** Holiday keys per team for the given teams, over [from, to] (UTC days, inclusive). */
async function loadTeamHolidayKeys(
  db: Db,
  teamTags: readonly string[],
  from: Date,
  to: Date
): Promise<Map<string, Set<string>>> {
  const teams = [...new Set(teamTags)]
  if (teams.length === 0) return new Map()

  const holidays = await db.leaveHoliday.findMany({
    where: { date: { gte: utcDay(from), lte: utcDay(to) }, teamTags: { hasSome: teams } },
    select: { date: true, teamTags: true },
  })
  return new Map(teams.map((team) => [team, leaveHolidayKeysForTeam(holidays, team)]))
}

const EMPTY_KEYS: LeaveHolidayKeys = new Set<string>()

/** The holiday days in [from, to] that are not charged for this employee. */
export async function loadEmployeeLeaveHolidayKeys(
  db: Db,
  employeeId: string,
  from: Date,
  to: Date
): Promise<LeaveHolidayKeys> {
  const user = await db.user.findUnique({ where: { id: employeeId }, select: { teamTag: true } })
  if (!user?.teamTag) return EMPTY_KEYS
  const byTeam = await loadTeamHolidayKeys(db, [user.teamTag], from, to)
  return byTeam.get(user.teamTag) ?? EMPTY_KEYS
}

type LeaveSpan = { employeeId: string; startDate: Date; endDate: Date; isHalfDay: boolean }

/** The days a leave charges once the person's holidays are left out. */
export async function chargeableLeaveDays(db: Db, leave: LeaveSpan): Promise<number> {
  const start = new Date(leave.startDate)
  const end = new Date(leave.endDate)
  const holidays = await loadEmployeeLeaveHolidayKeys(db, leave.employeeId, start, end)
  return calculateLeaveDuration(start, end, leave.isHalfDay, holidays)
}

/**
 * Adds `leaveDays` (holiday-aware) to each request, so pages show the number that is
 * actually charged without each one loading every employee's holidays itself.
 */
export async function withLeaveDays<T extends LeaveSpan>(db: Db, requests: readonly T[]): Promise<Array<T & { leaveDays: number }>> {
  if (requests.length === 0) return []

  const employeeIds = [...new Set(requests.map((request) => request.employeeId))]
  const users = await db.user.findMany({ where: { id: { in: employeeIds } }, select: { id: true, teamTag: true } })
  const teamByEmployee = new Map(users.map((user) => [user.id, user.teamTag]))

  const from = new Date(Math.min(...requests.map((request) => new Date(request.startDate).getTime())))
  const to = new Date(Math.max(...requests.map((request) => new Date(request.endDate).getTime())))
  const teams = users.flatMap((user) => (user.teamTag ? [user.teamTag] : []))
  const keysByTeam = await loadTeamHolidayKeys(db, teams, from, to)

  return requests.map((request) => {
    const team = teamByEmployee.get(request.employeeId)
    const holidays = (team && keysByTeam.get(team)) || EMPTY_KEYS
    return {
      ...request,
      leaveDays: calculateLeaveDuration(new Date(request.startDate), new Date(request.endDate), request.isHalfDay, holidays),
    }
  })
}

// ---------------------------------------------------------------------------
// Holiday changes after leave is booked

type UsedField = 'casualUsed' | 'sickUsed' | 'annualUsed'

export type ChargedLeave = LeaveSpan & { leaveType: string; teamTag: string | null }

export type BalanceRecharge = { employeeId: string; year: number; usedField: UsedField; delta: number }

function usedFieldFor(leaveType: string): UsedField {
  return `${leaveType.toLowerCase()}Used` as UsedField
}

/**
 * How much each balance must move when a person's holidays change from `before` to
 * `after`: the new count minus the old, summed per employee, balance year and leave
 * type. Positive charges more (a holiday was removed), negative gives days back.
 * The balance year is the leave's start year, as when the leave was charged.
 */
export function holidayRecharges(
  leaves: readonly ChargedLeave[],
  before: ReadonlyMap<string, LeaveHolidayKeys>,
  after: ReadonlyMap<string, LeaveHolidayKeys>
): BalanceRecharge[] {
  const totals = new Map<string, BalanceRecharge>()

  for (const leave of leaves) {
    const start = new Date(leave.startDate)
    const end = new Date(leave.endDate)
    const team = leave.teamTag ?? ''
    const delta =
      calculateLeaveDuration(start, end, leave.isHalfDay, after.get(team) ?? EMPTY_KEYS) -
      calculateLeaveDuration(start, end, leave.isHalfDay, before.get(team) ?? EMPTY_KEYS)
    if (delta === 0) continue

    const recharge = { employeeId: leave.employeeId, year: start.getFullYear(), usedField: usedFieldFor(leave.leaveType) }
    const key = `${recharge.employeeId}|${recharge.year}|${recharge.usedField}`
    const existing = totals.get(key)
    totals.set(key, { ...recharge, delta: (existing?.delta ?? 0) + delta })
  }

  return [...totals.values()].filter((recharge) => recharge.delta !== 0)
}

async function applyRecharge(tx: Db, recharge: BalanceRecharge): Promise<void> {
  const where = { employeeId_year: { employeeId: recharge.employeeId, year: recharge.year } }

  if (recharge.delta > 0) {
    await tx.leaveBalance.updateMany({
      where: { employeeId: recharge.employeeId, year: recharge.year },
      data: { [recharge.usedField]: { increment: recharge.delta } },
    })
    return
  }

  // Never take used days below zero, matching how cancellations restore balance.
  const balance = await tx.leaveBalance.findUnique({ where })
  if (!balance) return
  const decrementBy = Math.min(balance[recharge.usedField], -recharge.delta)
  if (decrementBy <= 0) return
  await tx.leaveBalance.update({ where, data: { [recharge.usedField]: { decrement: decrementBy } } })
}

/** The days and teams a holiday change can touch: the old and new versions together. */
export type HolidayChangeScope = { dates: readonly Date[]; teamTags: readonly string[] }

/**
 * Charged leave that a holiday change can affect: APPROVED (the only status whose days
 * are deducted), not yet ended, overlapping one of the dates, for someone on one of
 * the teams. Pending leave is charged at approval, with the holidays of that moment.
 */
async function chargedLeavesInScope(tx: Db, scope: HolidayChangeScope, now: Date): Promise<ChargedLeave[]> {
  const teams = [...new Set(scope.teamTags)]
  if (teams.length === 0 || scope.dates.length === 0) return []

  const leaves = await tx.leaveRequest.findMany({
    where: {
      status: 'APPROVED',
      endDate: { gte: utcDay(now) },
      employee: { teamTag: { in: teams } },
      OR: scope.dates.map((date) => ({
        startDate: { lt: new Date(utcDay(date).getTime() + DAY_MS) },
        endDate: { gte: utcDay(date) },
      })),
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      isHalfDay: true,
      leaveType: true,
      employee: { select: { teamTag: true } },
    },
  })

  return leaves.map(({ employee, ...leave }) => ({ ...leave, teamTag: employee.teamTag }))
}

/**
 * Runs a holiday create/edit/delete and moves already-charged balances by the
 * difference it makes, so the days deducted for a leave always equal what the current
 * holidays say it costs. Must run inside a transaction: the holiday change and the
 * balance moves succeed or fail together.
 */
export async function changeHolidayAndRecharge<T>(
  tx: Db,
  scope: HolidayChangeScope,
  mutate: () => Promise<T>,
  now = new Date()
): Promise<{ result: T; recharges: BalanceRecharge[] }> {
  const leaves = await chargedLeavesInScope(tx, scope, now)
  if (leaves.length === 0) return { result: await mutate(), recharges: [] }

  const from = new Date(Math.min(...leaves.map((leave) => leave.startDate.getTime())))
  const to = new Date(Math.max(...leaves.map((leave) => leave.endDate.getTime())))
  const teams = leaves.flatMap((leave) => (leave.teamTag ? [leave.teamTag] : []))

  const before = await loadTeamHolidayKeys(tx, teams, from, to)
  const result = await mutate()
  const after = await loadTeamHolidayKeys(tx, teams, from, to)

  const recharges = holidayRecharges(leaves, before, after)
  for (const recharge of recharges) {
    await applyRecharge(tx, recharge)
  }
  return { result, recharges }
}
