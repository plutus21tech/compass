import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { listBell, markBellRead, recordNotifications, recordNotificationsSafely } from '../lib/notifications/service'
import { WEEKLY_DB_TEST } from './helpers/weekly-test-db'

const ANA = 'ntf-ana'
const BEN = 'ntf-ben'
const NOW = new Date('2026-11-11T00:00:00.000Z')

async function clean() {
  await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'ntf-' } } })
  await prisma.securityNotification.deleteMany({ where: { userId: { startsWith: 'ntf-' } } })
  for (const [id, name] of [[ANA, 'Ana Torvik'], [BEN, 'Ben Okafor']]) {
    await prisma.user.upsert({ where: { id }, update: {}, create: { id, name, email: `${id}@example.test` } })
  }
}

const compassRow = (userId: string, createdAt: Date) =>
  prisma.userNotification.create({ data: { userId, kind: 'LEAVE_APPROVED', title: 'Leave approved', link: '/leave', createdAt } })

beforeEach(async () => {
  if (!WEEKLY_DB_TEST.skip) await clean()
})
after(async () => {
  if (!WEEKLY_DB_TEST.skip) {
    await prisma.userNotification.deleteMany({ where: { userId: { startsWith: 'ntf-' } } })
    await prisma.securityNotification.deleteMany({ where: { userId: { startsWith: 'ntf-' } } })
    await prisma.user.deleteMany({ where: { id: { startsWith: 'ntf-' } } })
  }
  await prisma.$disconnect()
})

test('records once per dedupe key', WEEKLY_DB_TEST, async () => {
  const row = { userId: ANA, kind: 'LEAVE_APPROVED' as const, title: 'Approved', link: '/leave', dedupeKey: 'ntf-k1' }
  assert.equal(await recordNotifications([row]), 1)
  assert.equal(await recordNotifications([row]), 0)
  assert.equal(await prisma.userNotification.count({ where: { userId: ANA } }), 1)
})

test('drops external links and trims long titles', WEEKLY_DB_TEST, async () => {
  const inserted = await recordNotifications([
    { userId: ANA, kind: 'LEAVE_APPROVED', title: 'Bad', link: 'https://x.example' },
    { userId: ANA, kind: 'LEAVE_REJECTED', title: 'x'.repeat(300), link: '/leave' },
  ])
  assert.equal(inserted, 1)
  const rows = await prisma.userNotification.findMany({ where: { userId: ANA } })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title.length, 200)
})

test('recordNotificationsSafely logs and swallows', WEEKLY_DB_TEST, async (t) => {
  const spy = t.mock.method(console, 'error', () => {})
  await recordNotificationsSafely('test', async () => {
    throw new Error('boom')
  })
  assert.equal(spy.mock.callCount(), 1)
})

test('the bell merges security notices newest first and counts unread', WEEKLY_DB_TEST, async () => {
  await compassRow(ANA, new Date('2026-11-10T09:00:00Z'))
  await prisma.securityNotification.createMany({
    data: [
      { userId: ANA, kind: 'NEW_TASK', title: 'New task', body: 'b', taskId: 'st-1', dedupeKey: 'ntf-s1', createdAt: new Date('2026-11-10T10:00:00Z') },
      { userId: ANA, kind: 'REMINDER_MARKER', title: 'hidden', body: 'b', dedupeKey: 'ntf-s2', createdAt: new Date('2026-11-10T11:00:00Z') },
    ],
  })
  const on = await listBell(ANA, { now: NOW, securityChecks: true })
  assert.deepEqual(on.items.map((i) => i.source), ['security', 'compass'])
  assert.equal(on.items[0].href, '/security-checks/st-1')
  assert.equal(on.unread, 2)
  const off = await listBell(ANA, { now: NOW, securityChecks: false })
  assert.equal(off.items.length, 1)
  assert.equal(off.unread, 1)
})

test('rows older than 90 days are not shown or counted', WEEKLY_DB_TEST, async () => {
  await compassRow(ANA, new Date('2026-08-01T00:00:00Z'))
  const bell = await listBell(ANA, { now: NOW, securityChecks: false })
  assert.equal(bell.items.length, 0)
  assert.equal(bell.unread, 0)
})

test("marking read touches only the viewer's rows", WEEKLY_DB_TEST, async () => {
  const ben = await compassRow(BEN, new Date('2026-11-10T09:00:00Z'))
  const ana = await compassRow(ANA, new Date('2026-11-10T09:00:00Z'))
  const sec = await prisma.securityNotification.create({ data: { userId: ANA, kind: 'NEW_TASK', title: 't', body: 'b', taskId: 'st-1', dedupeKey: 'ntf-s3' } })
  assert.equal(await markBellRead(ANA, [{ source: 'compass', id: ben.id }], NOW, { securityChecks: true }), 0)
  assert.equal((await prisma.userNotification.findUniqueOrThrow({ where: { id: ben.id } })).readAt, null)
  const updated = await markBellRead(ANA, [{ source: 'compass', id: ana.id }, { source: 'security', id: sec.id }], NOW, { securityChecks: true })
  assert.equal(updated, 2)
  assert.notEqual((await prisma.userNotification.findUniqueOrThrow({ where: { id: ana.id } })).readAt, null)
  assert.notEqual((await prisma.securityNotification.findUniqueOrThrow({ where: { id: sec.id } })).readAt, null)
})

test('deleting a user deletes their notifications', WEEKLY_DB_TEST, async () => {
  await compassRow(BEN, new Date('2026-11-10T09:00:00Z'))
  await prisma.user.delete({ where: { id: BEN } })
  assert.equal(await prisma.userNotification.count({ where: { userId: BEN } }), 0)
})
