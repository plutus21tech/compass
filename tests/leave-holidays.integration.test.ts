import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '../lib/teams/catalog'
import { prisma } from '../lib/db'
import { changeHolidayAndRecharge, chargeableLeaveDays, withLeaveDays } from '../lib/leave-holiday-store'
import { restoreCancelledLeaveBalance } from '../lib/leave-balance'
import { isWeeklyTestDatabase } from './helpers/weekly-test-db'

/**
 * Holiday-aware leave counting against a local test database.
 * Run with LEAVE_DB_TEST=true and DATABASE_URL pointing at a local compass_weekly_test
 * or compass_leave_test database (the reset below deletes data, so nothing else is allowed).
 */
function isLeaveTestDatabase(url: string | undefined): boolean {
  if (isWeeklyTestDatabase(url)) return true
  try {
    const parsed = new URL(url ?? '')
    return ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/compass_leave_test'
  } catch {
    return false
  }
}

const READY = process.env.LEAVE_DB_TEST === 'true' && isLeaveTestDatabase(process.env.DATABASE_URL)
const DB_TEST = { skip: READY ? false : 'Set LEAVE_DB_TEST=true and DATABASE_URL to a local compass_weekly_test or compass_leave_test database' }

// Fictional people only: the repository is public.
const PK = { id: 'lht-pk', name: 'Pia Kestrel', teamTag: 'PAKISTAN' as TeamTag }
const PK3E = { id: 'lht-pk3e', name: 'Omar Vantly', teamTag: 'THREE_E_PAKISTAN' as TeamTag }
const MA = { id: 'lht-ma', name: 'Mina Arlow', teamTag: 'MOROCCO' as TeamTag }
const PEOPLE = [PK, PK3E, MA]
const IDS = PEOPLE.map((p) => p.id)

// Mon 7 Dec - Fri 11 Dec 2026, well after "now" below, so nothing has ended.
const day = (d: number) => new Date(Date.UTC(2026, 11, d))
const NOW = new Date(Date.UTC(2026, 10, 9, 9))

async function reset() {
  if (!isLeaveTestDatabase(process.env.DATABASE_URL)) throw new Error('Refusing to touch a database that is not a local leave test database')
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { in: IDS } } })
  await prisma.leaveBalance.deleteMany({ where: { employeeId: { in: IDS } } })
  await prisma.employeeBirthday.deleteMany({ where: { userId: { in: IDS } } })
  await prisma.leaveHoliday.deleteMany()
  await prisma.user.deleteMany({ where: { id: { in: IDS } } })
  for (const person of PEOPLE) {
    await prisma.user.create({ data: { id: person.id, name: person.name, teamTag: person.teamTag, department: 'Leave Test' } })
    await prisma.leaveBalance.create({ data: { employeeId: person.id, year: 2026 } })
  }
}

/** An approved leave whose days were charged with the current holidays, as the approve route does. */
async function approvedLeave(employeeId: string, start: number, end: number, opts: { isHalfDay?: boolean; status?: 'APPROVED' | 'PENDING' } = {}) {
  const isHalfDay = opts.isHalfDay ?? false
  const status = opts.status ?? 'APPROVED'
  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveType: isHalfDay ? 'CASUAL' : 'ANNUAL',
      isHalfDay,
      startDate: day(start),
      endDate: day(end),
      reason: 'Test leave',
      transitionPlan: '',
      status,
    },
  })
  if (status === 'APPROVED') {
    const days = await chargeableLeaveDays(prisma, leave)
    await prisma.leaveBalance.update({
      where: { employeeId_year: { employeeId, year: 2026 } },
      data: { [isHalfDay ? 'casualUsed' : 'annualUsed']: { increment: days } },
    })
  }
  return leave
}

const used = async (employeeId: string) => {
  const b = await prisma.leaveBalance.findUniqueOrThrow({ where: { employeeId_year: { employeeId, year: 2026 } } })
  return { annual: b.annualUsed, casual: b.casualUsed }
}

const addHoliday = (date: Date, teamTags: string[]) =>
  prisma.$transaction((tx) =>
    changeHolidayAndRecharge(tx, { dates: [date], teamTags }, () => tx.leaveHoliday.create({ data: { date, name: 'Test Holiday', teamTags } }), NOW)
  )

beforeEach(async () => {
  if (READY) await reset()
})
after(async () => {
  if (READY) await reset()
  await prisma.$disconnect()
})

test('a holiday for the team is not charged when leave is booked over it', DB_TEST, async () => {
  await prisma.leaveHoliday.create({ data: { date: day(9), name: 'Test Holiday', teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'] } })
  const span = { startDate: day(7), endDate: day(11), isHalfDay: false }
  assert.equal(await chargeableLeaveDays(prisma, { employeeId: PK.id, ...span }), 4)
  assert.equal(await chargeableLeaveDays(prisma, { employeeId: PK3E.id, ...span }), 4)
  assert.equal(await chargeableLeaveDays(prisma, { employeeId: MA.id, ...span }), 5, 'another country works that day')
  assert.equal(await chargeableLeaveDays(prisma, { employeeId: PK.id, startDate: day(9), endDate: day(9), isHalfDay: true }), 0)
})

test('adding a holiday gives back the day on approved leave, for the affected teams only', DB_TEST, async () => {
  await approvedLeave(PK.id, 7, 11)
  await approvedLeave(MA.id, 7, 11)
  await approvedLeave(PK3E.id, 9, 9, { isHalfDay: true })
  await approvedLeave(PK.id, 14, 15, { status: 'PENDING' })
  assert.deepEqual(await used(PK.id), { annual: 5, casual: 0 })

  const { recharges } = await addHoliday(day(9), ['PAKISTAN', 'THREE_E_PAKISTAN'])

  assert.equal(recharges.length, 2)
  assert.deepEqual(await used(PK.id), { annual: 4, casual: 0 })
  assert.deepEqual(await used(PK3E.id), { annual: 0, casual: 0 }, 'a half day on the new holiday is refunded')
  assert.deepEqual(await used(MA.id), { annual: 5, casual: 0 })
})

test('editing a holiday to another date moves the charge; deleting it charges the day again', DB_TEST, async () => {
  await approvedLeave(PK.id, 7, 11)
  const { result: holiday } = await addHoliday(day(9), ['PAKISTAN'])
  assert.deepEqual(await used(PK.id), { annual: 4, casual: 0 })

  // Moved to a Saturday: the Wednesday is charged again, the Saturday never was.
  await prisma.$transaction((tx) =>
    changeHolidayAndRecharge(
      tx,
      { dates: [holiday.date, day(12)], teamTags: ['PAKISTAN'] },
      () => tx.leaveHoliday.update({ where: { id: holiday.id }, data: { date: day(12) } }),
      NOW
    )
  )
  assert.deepEqual(await used(PK.id), { annual: 5, casual: 0 })

  // Back onto a weekday, then switched to Morocco only: Pakistan pays again.
  await prisma.$transaction((tx) =>
    changeHolidayAndRecharge(tx, { dates: [day(12), day(10)], teamTags: ['PAKISTAN'] }, () =>
      tx.leaveHoliday.update({ where: { id: holiday.id }, data: { date: day(10) } }), NOW)
  )
  assert.deepEqual(await used(PK.id), { annual: 4, casual: 0 })
  await prisma.$transaction((tx) =>
    changeHolidayAndRecharge(tx, { dates: [day(10)], teamTags: ['PAKISTAN', 'MOROCCO'] }, () =>
      tx.leaveHoliday.update({ where: { id: holiday.id }, data: { teamTags: ['MOROCCO'] } }), NOW)
  )
  assert.deepEqual(await used(PK.id), { annual: 5, casual: 0 })

  await prisma.$transaction((tx) =>
    changeHolidayAndRecharge(tx, { dates: [day(10)], teamTags: ['MOROCCO'] }, () =>
      tx.leaveHoliday.delete({ where: { id: holiday.id } }), NOW)
  )
  assert.deepEqual(await used(PK.id), { annual: 5, casual: 0 })
  assert.equal(await prisma.leaveHoliday.count(), 0)
})

test('leave that has already ended is left alone', DB_TEST, async () => {
  await approvedLeave(PK.id, 7, 11)
  const afterLeave = new Date(Date.UTC(2026, 11, 14, 9))
  await prisma.$transaction((tx) =>
    changeHolidayAndRecharge(tx, { dates: [day(9)], teamTags: ['PAKISTAN'] }, () =>
      tx.leaveHoliday.create({ data: { date: day(9), name: 'Late Holiday', teamTags: ['PAKISTAN'] } }), afterLeave)
  )
  assert.deepEqual(await used(PK.id), { annual: 5, casual: 0 })
})

test('cancelling restores exactly what was charged, so balances never drift', DB_TEST, async () => {
  const leave = await approvedLeave(PK.id, 7, 11)
  await addHoliday(day(9), ['PAKISTAN'])
  assert.deepEqual(await used(PK.id), { annual: 4, casual: 0 })

  await prisma.$transaction((tx) => restoreCancelledLeaveBalance(tx, leave, NOW))
  assert.deepEqual(await used(PK.id), { annual: 0, casual: 0 })
})

test('request lists carry the holiday-aware day count', DB_TEST, async () => {
  await prisma.leaveHoliday.create({ data: { date: day(9), name: 'Test Holiday', teamTags: ['PAKISTAN'] } })
  await approvedLeave(PK.id, 7, 11)
  await approvedLeave(MA.id, 7, 11)
  const requests = await prisma.leaveRequest.findMany({ where: { employeeId: { in: IDS } }, orderBy: { employeeId: 'asc' } })
  const days = Object.fromEntries((await withLeaveDays(prisma, requests)).map((r) => [r.employeeId, r.leaveDays]))
  assert.deepEqual(days, { [MA.id]: 5, [PK.id]: 4 })
})
