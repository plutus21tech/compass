import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { runWeeklyDailyJob } from '../lib/weekly/service/daily-job'
import { decidePeerRequest, requestPeerChange } from '../lib/weekly/service/peer-requests'
import { changeRoundMapping } from '../lib/weekly/service/round-people'
import { loadStandardBank } from '../lib/weekly/service/content'
import { openRound } from '../lib/weekly/service/round'
import { seedFormFixtures } from './helpers/weekly-form-fixtures'
import { at, HR_ACTOR, reviewStageCycle, startedCycle } from './helpers/weekly-fixtures'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST, weeklyActor } from './helpers/weekly-test-db'

const APP = 'https://compass.example'
const send = async () => undefined
const FORM_PEOPLE = ['wkt-chief', 'wkt-hr', 'wkt-hr2']
let periodId = ''

const rowsOf = (kind: string, userId?: string) => prisma.userNotification.findMany({ where: { kind, userId: userId ?? { startsWith: 'wkt-' } }, orderBy: { createdAt: 'asc' } })

before(() => {
  process.env.WEEKLY_EVALUATIONS_ENABLED = 'true'
})
beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'wkt-' } } })
  await resetWeeklyTestData(prisma)
  ;({ periodId } = await seedWeeklyBase(prisma))
  await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'wkt-' } } })
})
after(async () => {
  await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'wkt-' } } })
  await prisma.$disconnect()
})

async function startFormsRound() {
  await seedFormFixtures(prisma)
  await startedCycle(periodId)
}

test('forms opening rings the bell once per round, with emails off', WEEKLY_DB_TEST, async () => {
  await startFormsRound()
  await runWeeklyDailyJob(send, APP, at(12))
  await runWeeklyDailyJob(send, APP, at(12, 2))
  const rows = await rowsOf('WEEKLY_FORMS_OPEN')
  assert.deepEqual(rows.map((r) => r.userId).sort(), FORM_PEOPLE)
  for (const row of rows) assert.match(row.dedupeKey ?? '', new RegExp(`:${row.userId}$`))
})

test('a person without an email still gets the bell', WEEKLY_DB_TEST, async () => {
  await startFormsRound()
  await prisma.user.update({ where: { id: 'wkt-chief' }, data: { email: null as unknown as string } })
  const result = await runWeeklyDailyJob(send, APP, at(12))
  assert.equal((await rowsOf('WEEKLY_FORMS_OPEN', 'wkt-chief')).length, 1)
  assert.ok((result.digests?.skipped ?? 0) >= 1)
})

test('a payroll-inactive person gets nothing', WEEKLY_DB_TEST, async () => {
  await startFormsRound()
  await prisma.payrollEmployeeProfile.create({ data: { userId: 'wkt-chief', isPayrollActive: false } })
  await runWeeklyDailyJob(send, APP, at(12))
  assert.equal((await rowsOf('WEEKLY_FORMS_OPEN', 'wkt-chief')).length, 0)
  assert.equal((await rowsOf('WEEKLY_FORMS_OPEN', 'wkt-hr')).length, 1)
})

test('HR deciding a list-change request rings the requester and the peer', WEEKLY_DB_TEST, async () => {
  await reviewStageCycle(periodId)
  const request = await requestPeerChange(weeklyActor(W.ana), { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'NO_LONGER_WORK_TOGETHER', reason: 'Ben moved to another project' }, at(1), send, APP)
  await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(1, 3), send, APP)
  const requester = await rowsOf('WEEKLY_LIST_DECISION', W.ana.id)
  const peer = await rowsOf('WEEKLY_LIST_DECISION', W.ben.id)
  assert.equal(requester.length, 1)
  assert.match(requester[0].title, /^Your request to .* was approved$/)
  assert.equal(peer.length, 1)
  assert.equal(peer[0].title, 'HR changed your evaluation lists after a request from Ana Torvik')
  assert.notEqual(requester[0].dedupeKey, peer[0].dedupeKey)
})

test('undecided requests lapse with a bell for the requester and the peer when the round opens', WEEKLY_DB_TEST, async () => {
  await reviewStageCycle(periodId)
  await requestPeerChange(weeklyActor(W.ana), { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'NO_LONGER_WORK_TOGETHER', reason: 'Ben moved to another project' }, at(1), send, APP)
  await loadStandardBank(HR_ACTOR)
  await openRound(HR_ACTOR, periodId, at(1, 2), send, APP)
  assert.equal((await rowsOf('WEEKLY_LIST_DECISION', W.ana.id)).length, 1)
  assert.equal((await rowsOf('WEEKLY_LIST_DECISION', W.ben.id)).length, 1)
})

test('HR changing lists mid-round rings both people', WEEKLY_DB_TEST, async () => {
  await reviewStageCycle(periodId)
  await changeRoundMapping(HR_ACTOR, (await prisma.weeklyCycle.findFirstOrThrow({ where: { periodId } })).id, { userId: W.ana.id, otherId: W.cara.id, relation: 'PEER', action: 'ADD', reason: 'Same client' }, at(1), send, APP)
  const rows = await rowsOf('WEEKLY_LIST_CHANGED')
  assert.deepEqual(rows.map((r) => r.userId).sort(), [W.ana.id, W.cara.id].sort())
  for (const row of rows) assert.match(row.title, /^HR (added|removed) /)
})
