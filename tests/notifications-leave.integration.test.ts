import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { isWeeklyTestDatabase } from './helpers/weekly-test-db'
import { notifyLeave, notifyLeaveFor, notifyWfh, scopeDedupeKey } from '../lib/notifications/leave'
import { recordNotifications } from '../lib/notifications/service'

// Local test database only (compass_weekly_test); the cleanup deletes nlv- rows.
const READY = process.env.WEEKLY_DB_TEST === 'true' && isWeeklyTestDatabase(process.env.DATABASE_URL)
const DB_TEST = { skip: READY ? false : 'Set WEEKLY_DB_TEST=true and DATABASE_URL to the local compass_weekly_test database' }

const EMP = 'nlv-emp'
const OTHER = 'nlv-other'
const START = new Date('2026-11-19T00:00:00Z')
const END = new Date('2026-11-23T00:00:00Z')

async function cleanup() {
  await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'nlv-' } } })
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { startsWith: 'nlv-' } } })
  await prisma.wfhRequest.deleteMany({ where: { employeeId: { startsWith: 'nlv-' } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: 'nlv-' } } })
}

async function makeLeave() {
  return prisma.leaveRequest.create({
    data: { employeeId: EMP, leaveType: 'ANNUAL', startDate: START, endDate: END, reason: 'Family trip', transitionPlan: '' },
  })
}

before(async () => {
  if (!READY) return
  await cleanup()
  await prisma.user.create({ data: { id: EMP, name: 'Nia Vellore', department: 'Notice Test' } })
  await prisma.user.create({ data: { id: OTHER, name: 'Rafe Oakhurst', department: 'Notice Test' } })
})
after(async () => {
  if (READY) await cleanup()
  await prisma.$disconnect()
})

test('a decision writes one row for the employee with a deep link', DB_TEST, async () => {
  const leave = await makeLeave()
  await notifyLeave(leave.id, 'LEAVE_APPROVED')
  const rows = await prisma.userNotification.findMany({ where: { userId: EMP, kind: 'LEAVE_APPROVED' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].link, `/leave?requestId=${leave.id}`)
})

test('the same cron key writes once', DB_TEST, async () => {
  const leave = await makeLeave()
  await notifyLeave(leave.id, 'PLAN_REMINDER', { dedupeKey: 'plan-reminder:x:2026-11-11' })
  await notifyLeave(leave.id, 'PLAN_REMINDER', { dedupeKey: 'plan-reminder:x:2026-11-11' })
  const rows = await prisma.userNotification.findMany({ where: { userId: EMP, kind: 'PLAN_REMINDER' } })
  assert.equal(rows.length, 1)
})

test('a missing request writes nothing and does not throw', DB_TEST, async () => {
  const before = await prisma.userNotification.count({ where: { userId: EMP } })
  await notifyLeave('nlv-no-such-request', 'LEAVE_REJECTED')
  await notifyWfh('nlv-no-such-request', 'WFH_REJECTED')
  assert.equal(await prisma.userNotification.count({ where: { userId: EMP } }), before)
})

test('HR cancellation of a deleted request links to /leave', DB_TEST, async () => {
  const leave = await makeLeave()
  await prisma.leaveRequest.delete({ where: { id: leave.id } })
  await notifyLeaveFor(leave, 'LEAVE_CANCELLED', { link: '/leave' })
  const rows = await prisma.userNotification.findMany({ where: { userId: EMP, kind: 'LEAVE_CANCELLED' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].link, '/leave')
})

test('WFH decisions link to /leave', DB_TEST, async () => {
  const wfh = await prisma.wfhRequest.create({ data: { employeeId: EMP, startDate: START, endDate: END, reason: 'Plumber visit' } })
  await notifyWfh(wfh.id, 'WFH_APPROVED')
  const rows = await prisma.userNotification.findMany({ where: { userId: EMP, kind: 'WFH_APPROVED' } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].link, '/leave')
})

test('two recipients of the same event both get rows', DB_TEST, async () => {
  const base = 'plan-notice:shared-request'
  const rows = [EMP, OTHER].map((userId) => ({
    userId,
    kind: 'PLAN_DEADLINE_NOTICE' as const,
    title: 'Add a transition plan',
    link: '/leave',
    dedupeKey: scopeDedupeKey(base, userId),
  }))
  assert.equal(await recordNotifications(rows), 2)
  const stored = await prisma.userNotification.findMany({ where: { dedupeKey: { startsWith: base } } })
  assert.equal(stored.length, 2)
})
