import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { myResults } from '../lib/weekly/service/my-results'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const SECRET = 'private written feedback'
const breakdown = (score: number) => ({
  qualitativeFeedback: { TEAM_LEAD: [SECRET] },
  breakdown: [{ relationshipType: 'TEAM_LEAD', weight: 1, normalizedScore: score, evaluatorCount: 1 }],
})

let periodId = ''
const EARLIER_NAME = 'Q3 2026 (weekly my-results test)'

/** The shared reset only knows its own quarter, so this file removes the earlier one it adds. */
async function reset(): Promise<void> {
  await resetWeeklyTestData(prisma)
  await prisma.evaluationPeriod.deleteMany({ where: { name: EARLIER_NAME } })
}

/** An earlier quarter, so there is a quarter before the seeded one. */
async function earlierPeriod(): Promise<string> {
  const period = await prisma.evaluationPeriod.create({
    data: {
      name: EARLIER_NAME,
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      endDate: new Date('2026-09-30T00:00:00.000Z'),
      reviewStartDate: new Date('2026-10-05T00:00:00.000Z'),
    },
  })
  return period.id
}

async function report(employeeId: string, period: string, percent: number, sent: boolean): Promise<void> {
  const created = await prisma.report.create({ data: { employeeId, periodId: period, overallScore: percent, breakdownJson: breakdown(percent / 25) } })
  if (sent) {
    await prisma.emailQueue.create({ data: { employeeId, reportId: created.id, emailStatus: 'SENT', sentAt: new Date('2026-10-27T06:00:00.000Z') } })
  }
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await reset()
  periodId = (await seedWeeklyBase(prisma)).periodId
})

after(async () => {
  if (WEEKLY_DB_READY) await reset()
  await prisma.$disconnect()
})

test('nobody sees anything before a report exists', WEEKLY_DB_TEST, async () => {
  assert.deepEqual(await myResults(W.ana.id), { quarters: [], preparing: null })
})

test('a report that was not released is only "being prepared"', WEEKLY_DB_TEST, async () => {
  await report(W.ana.id, periodId, 75, false)
  const results = await myResults(W.ana.id)
  assert.deepEqual(results.quarters, [])
  assert.equal(results.preparing, 'Q4 2026 (weekly test)')
})

test('a sent report shows as that quarter, scores only, and only to its owner', WEEKLY_DB_TEST, async () => {
  const earlier = await earlierPeriod()
  await report(W.ana.id, earlier, 75, true)
  await report(W.ana.id, periodId, 87.5, false)
  await report(W.ben.id, earlier, 50, true)

  const ana = await myResults(W.ana.id)
  assert.deepEqual(ana.quarters.map((q) => [q.periodName, q.score, q.band]), [[EARLIER_NAME, 3, 'Exceeds Expectations']])
  assert.deepEqual(ana.quarters[0].groups, [{ key: 'TEAM_LEAD', label: 'Your lead', weightPercent: 100, score: 3 }])
  assert.equal(ana.quarters[0].emailedAt, '2026-10-27T06:00:00.000Z')
  assert.equal(ana.preparing, 'Q4 2026 (weekly test)')
  assert.ok(!JSON.stringify(ana).includes(SECRET))

  const ben = await myResults(W.ben.id)
  assert.deepEqual(ben.quarters.map((q) => q.score), [2])
  assert.equal(ben.preparing, null)
  assert.deepEqual(await myResults(W.cara.id), { quarters: [], preparing: null })
})

test('a round HR released counts as released without an email, newest quarter first', WEEKLY_DB_TEST, async () => {
  const earlier = await earlierPeriod()
  await report(W.ana.id, earlier, 75, true)
  await report(W.ana.id, periodId, 87.5, false)
  await prisma.weeklyCycle.create({
    data: {
      periodId, weekOneStartsOn: new Date('2026-10-05T00:00:00.000Z'), questionWeeks: 8, status: 'CLOSED',
      resultsPublishedAt: new Date('2027-01-10T06:00:00.000Z'), createdById: W.hr.id,
    },
  })
  const results = await myResults(W.ana.id)
  assert.deepEqual(results.quarters.map((q) => [q.periodName, q.score, q.emailedAt]), [
    ['Q4 2026 (weekly test)', 3.5, null],
    [EARLIER_NAME, 3, '2026-10-27T06:00:00.000Z'],
  ])
  assert.equal(results.preparing, null)
})
