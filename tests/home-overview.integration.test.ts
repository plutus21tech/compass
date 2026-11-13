import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadHomeOverview } from '../lib/home/overview'
import { WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const NOW = new Date('2031-03-12T05:00:00Z')
const TAG = 'HOM_TEST'
const SECRET = 'private-leave-reason'
const day = (key: string) => new Date(`${key}T00:00:00Z`)

/** Fictional people only. */
const PEOPLE = [
  { id: 'hom-viewer', name: 'Vera Holt', department: 'Design' },
  { id: 'hom-pia', name: 'Pia Quist', department: 'Design' },
  { id: 'hom-omar', name: 'Omar Vale', department: 'Ops' },
  { id: 'hom-mina', name: 'Mina Arlow', department: 'Design' },
  { id: 'hom-gone', name: 'Gil Rowe', department: 'Design' },
]
const viewer = { id: 'hom-viewer', department: 'Design', teamTag: TAG as string | null }

async function cleanUp() {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { startsWith: 'hom-' } } })
  await prisma.leaveHoliday.deleteMany({ where: { id: { startsWith: 'hom-' } } })
  await prisma.payrollEmployeeProfile.deleteMany({ where: { userId: { startsWith: 'hom-' } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: 'hom-' } } })
}

async function seedPeople() {
  for (const person of PEOPLE) {
    await prisma.user.create({
      data: { ...person, email: `${person.id}@example.test`, role: 'EMPLOYEE', onboardingCompleted: true },
    })
  }
  await prisma.payrollEmployeeProfile.create({ data: { userId: 'hom-gone', isPayrollActive: false } })
}

async function leave(
  employeeId: string,
  start: string,
  end: string,
  status: 'PENDING' | 'LEAD_APPROVED' | 'APPROVED' | 'REJECTED' | 'CANCELLED',
  extra: { isHalfDay?: boolean; halfDaySession?: 'FIRST_HALF' | 'SECOND_HALF' } = {}
) {
  await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveType: 'CASUAL',
      startDate: day(start),
      endDate: day(end),
      reason: SECRET,
      transitionPlan: '',
      status,
      ...extra,
    },
  })
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await cleanUp()
  await seedPeople()
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanUp()
  await prisma.$disconnect()
})

test('approved only: each person counts once; pending, lead-approved, rejected and cancelled do not', WEEKLY_DB_TEST, async () => {
  await leave('hom-pia', '2031-03-12', '2031-03-12', 'APPROVED')
  await leave('hom-pia', '2031-03-11', '2031-03-13', 'PENDING')
  await leave('hom-omar', '2031-03-12', '2031-03-12', 'LEAD_APPROVED', { isHalfDay: true, halfDaySession: 'FIRST_HALF' })
  await leave('hom-mina', '2031-03-12', '2031-03-12', 'REJECTED')
  await leave('hom-viewer', '2031-03-12', '2031-03-12', 'CANCELLED')
  await leave('hom-gone', '2031-03-12', '2031-03-12', 'APPROVED')

  const overview = await loadHomeOverview(viewer, NOW)
  const mine = overview.outToday.people.filter((p) => p.id.startsWith('hom-'))
  assert.deepEqual(mine.map((p) => p.id), ['hom-pia'])
  assert.equal(mine[0].isHalfDay, false)
  assert.equal(overview.departmentOutToday, 1)
  assert.ok(!JSON.stringify(overview).includes(SECRET))
})

test('out today uses the Karachi day', WEEKLY_DB_TEST, async () => {
  await leave('hom-pia', '2031-03-13', '2031-03-13', 'APPROVED')
  const included = await loadHomeOverview(viewer, new Date('2031-03-12T19:30:00Z'))
  assert.ok(included.outToday.people.some((p) => p.id === 'hom-pia'))
  const excluded = await loadHomeOverview(viewer, new Date('2031-03-12T18:30:00Z'))
  assert.ok(!excluded.outToday.people.some((p) => p.id === 'hom-pia'))
})

test('approved half days count; pending leave never does, on either side of the Karachi midnight', WEEKLY_DB_TEST, async () => {
  await leave('hom-omar', '2031-03-13', '2031-03-13', 'APPROVED', { isHalfDay: true, halfDaySession: 'FIRST_HALF' })
  await leave('hom-mina', '2031-03-13', '2031-03-13', 'PENDING')
  const after = await loadHomeOverview(viewer, new Date('2031-03-12T19:30:00Z'))
  const ids = after.outToday.people.filter((p) => p.id.startsWith('hom-')).map((p) => p.id)
  assert.deepEqual(ids, ['hom-omar'])
  assert.equal(after.outToday.people.find((p) => p.id === 'hom-omar')?.isHalfDay, true)
  assert.equal(after.departmentOutToday, 0)
  const before = await loadHomeOverview(viewer, new Date('2031-03-12T18:30:00Z'))
  assert.equal(before.outToday.people.filter((p) => p.id.startsWith('hom-')).length, 0)
})

test('the viewer is in the raw list so each card can leave them out', WEEKLY_DB_TEST, async () => {
  await leave('hom-viewer', '2031-03-12', '2031-03-12', 'APPROVED')
  await leave('hom-pia', '2031-03-12', '2031-03-12', 'APPROVED')
  const overview = await loadHomeOverview(viewer, NOW)
  assert.ok(overview.outToday.people.some((p) => p.id === 'hom-viewer'))
  assert.equal(overview.departmentOutToday, 1)
})

test('next out in your department', WEEKLY_DB_TEST, async () => {
  await leave('hom-mina', '2031-03-20', '2031-03-20', 'APPROVED')
  await leave('hom-pia', '2031-06-01', '2031-06-01', 'APPROVED')
  await leave('hom-viewer', '2031-03-15', '2031-03-15', 'APPROVED')
  await leave('hom-omar', '2031-03-14', '2031-03-14', 'APPROVED')
  const overview = await loadHomeOverview(viewer, NOW)
  assert.deepEqual(overview.nextOutInDepartment, { name: 'Mina Arlow', startDate: '2031-03-20' })
  assert.equal(overview.department, 'Design')
})

test('next holiday for your team tag', WEEKLY_DB_TEST, async () => {
  await prisma.leaveHoliday.createMany({
    data: [
      { id: 'hom-h1', date: day('2031-03-11'), name: 'Past Day', teamTags: [TAG] },
      { id: 'hom-h2', date: day('2031-04-01'), name: 'Founders Day', teamTags: [TAG] },
      { id: 'hom-h3', date: day('2031-03-20'), name: 'Other Day', teamTags: ['OTHER_TAG'] },
    ],
  })
  const overview = await loadHomeOverview(viewer, NOW)
  assert.deepEqual(overview.nextHoliday, { date: '2031-04-01', name: 'Founders Day', daysAway: 20 })
  assert.equal(overview.teamLabel, 'HOM_TEST team')
  assert.equal(overview.upcomingHolidays.length, 1)
})

test('no team tag: no holidays, no error', WEEKLY_DB_TEST, async () => {
  const overview = await loadHomeOverview({ ...viewer, teamTag: null }, NOW)
  assert.equal(overview.nextHoliday, null)
  assert.deepEqual(overview.upcomingHolidays, [])
  assert.equal(overview.teamLabel, null)
})
