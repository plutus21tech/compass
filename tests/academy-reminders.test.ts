import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPASS_URL } from '../lib/compass-url'
import {
  isLocalHour,
  isReminderWindow,
  localDateKey,
  oldestOverdue,
  onboardingCronGate,
  overdueDayCount,
} from '../lib/academy/reminders'
import { academyNotices } from '../lib/email'

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')
const at = (iso: string) => new Date(iso)

test('isLocalHour finds 10:00 in each office zone, December offsets', () => {
  assert.equal(isLocalHour(at('2026-12-02T05:00:00.000Z'), 'Asia/Karachi', 10), true)
  assert.equal(isLocalHour(at('2026-12-02T09:00:00.000Z'), 'Africa/Casablanca', 10), true)
  assert.equal(isLocalHour(at('2026-12-02T15:00:00.000Z'), 'America/Bogota', 10), true)
  assert.equal(isLocalHour(at('2026-12-02T16:00:00.000Z'), 'America/Chicago', 10), true)
  assert.equal(isLocalHour(at('2026-12-02T15:00:00.000Z'), 'America/Chicago', 10), false)
})

test('isLocalHour follows daylight saving, reads midnight as 0, and a null zone is Karachi', () => {
  assert.equal(isLocalHour(at('2026-07-01T15:00:00.000Z'), 'America/Chicago', 10), true)
  assert.equal(isLocalHour(at('2026-12-02T19:00:00.000Z'), 'Asia/Karachi', 0), true)
  assert.equal(isLocalHour(at('2026-12-02T05:00:00.000Z'), null, 10), true)
  assert.equal(isLocalHour(at('2026-12-02T06:00:00.000Z'), null, 10), false)
})

test('the reminder window opens at local 10:00 and shuts at 18:00, so a failed send gets later runs the same day', () => {
  assert.equal(isReminderWindow(at('2026-12-02T04:59:00.000Z'), 'Asia/Karachi'), false)
  assert.equal(isReminderWindow(at('2026-12-02T05:00:00.000Z'), 'Asia/Karachi'), true)
  assert.equal(isReminderWindow(at('2026-12-02T12:59:00.000Z'), 'Asia/Karachi'), true)
  assert.equal(isReminderWindow(at('2026-12-02T13:00:00.000Z'), 'Asia/Karachi'), false)
})

test('localDateKey is the date in the zone, not in UTC', () => {
  assert.equal(localDateKey(at('2026-12-02T20:00:00.000Z'), 'Asia/Karachi'), '2026-12-03')
  assert.equal(localDateKey(at('2026-12-02T02:00:00.000Z'), 'America/Chicago'), '2026-12-01')
  assert.equal(localDateKey(at('2026-12-02T20:00:00.000Z'), null), '2026-12-03')
})

test('overdueDayCount is 1 on the first local day past the due date, then counts up', () => {
  const dueAt = at('2026-12-01T18:59:59.999Z') // the end of 1 December in Karachi
  assert.equal(overdueDayCount(dueAt, at('2026-12-01T18:00:00.000Z'), 'Asia/Karachi'), 0)
  assert.equal(overdueDayCount(dueAt, dueAt, 'Asia/Karachi'), 0)
  assert.equal(overdueDayCount(dueAt, at('2026-12-02T05:00:00.000Z'), 'Asia/Karachi'), 1)
  assert.equal(overdueDayCount(dueAt, at('2026-12-02T18:59:00.000Z'), 'Asia/Karachi'), 1)
  assert.equal(overdueDayCount(dueAt, at('2026-12-03T05:00:00.000Z'), 'Asia/Karachi'), 2)
  assert.equal(overdueDayCount(dueAt, at('2026-12-10T05:00:00.000Z'), 'Asia/Karachi'), 9)
})

test('overdueDayCount never skips or repeats a day when the due date was worked out in UTC', () => {
  // A hire with no known zone has a due date at the end of the UTC day, which is already the next day in Karachi.
  const dueAt = at('2026-12-01T23:59:59.999Z')
  assert.equal(overdueDayCount(dueAt, at('2026-12-02T05:00:00.000Z'), null), 1)
  assert.equal(overdueDayCount(dueAt, at('2026-12-03T05:00:00.000Z'), null), 2)
})

test('oldestOverdue uses the same rule as the module cards', () => {
  const now = at('2026-12-05T00:00:00.000Z')
  const row = (over: object) => ({ status: 'IN_PROGRESS' as const, startedAt: null, dueAt: at('2026-12-01T00:00:00.000Z'), ...over })
  assert.equal(oldestOverdue([], now), null)
  assert.equal(oldestOverdue([row({ status: 'COMPLETED' })], now), null)
  assert.equal(oldestOverdue([row({ dueAt: null })], now), null)
  assert.equal(oldestOverdue([row({ dueAt: at('2026-12-06T00:00:00.000Z') })], now), null)
  assert.deepEqual(oldestOverdue([row({}), row({ status: 'LOCKED', dueAt: at('2026-11-30T00:00:00.000Z') })], now), {
    count: 2,
    oldestDueAt: at('2026-11-30T00:00:00.000Z'),
  })
})

test('the cron gate refuses a missing or wrong secret with 401, before anything else', () => {
  const env = { CRON_SECRET: 'fictional-secret', ONBOARDING_ACADEMY_ENABLED: 'true' }
  assert.deepEqual(onboardingCronGate(null, env), { action: 'refuse', status: 401 })
  assert.deepEqual(onboardingCronGate('Bearer wrong', env), { action: 'refuse', status: 401 })
  assert.deepEqual(onboardingCronGate('Bearer fictional-secret', { ...env, CRON_SECRET: undefined }), { action: 'refuse', status: 401 })
  assert.deepEqual(onboardingCronGate(null, { ...env, ONBOARDING_ACADEMY_ENABLED: 'false' }), { action: 'refuse', status: 401 })
})

test('the cron gate skips with the flag off and runs with it on', () => {
  const env = { CRON_SECRET: 'fictional-secret', ONBOARDING_ACADEMY_ENABLED: 'false' }
  assert.deepEqual(onboardingCronGate('Bearer fictional-secret', env), { action: 'skip' })
  assert.deepEqual(onboardingCronGate('Bearer fictional-secret', { ...env, ONBOARDING_ACADEMY_ENABLED: 'true' }), { action: 'run' })
})

test('each notice names a person, escapes them, and links to Compass', () => {
  const name = '<b>Cara</b>'
  const notices = [
    academyNotices.courseReleased(name),
    academyNotices.leadInputOverdue({ leadName: name, hireName: name, newHireId: 'hire-1' }),
    academyNotices.buddy({ buddyName: name, hireName: name }),
    academyNotices.moduleOverdue({ hireName: name, moduleCount: 2 }),
    academyNotices.firstPaymentSave(name),
    academyNotices.paymentSetupDone(name),
    academyNotices.linkedinSubmitted(name),
    academyNotices.checklistItem({ title: name, hireName: name, ownerRole: 'HR', dueDate: '2026-12-01', overdue: true }),
  ]
  for (const notice of notices) {
    assert.ok(notice.subject.length > 0)
    assert.equal(notice.html.includes('<b>Cara'), false)
    assert.match(notice.html, /&lt;b&gt;Cara/)
    assert.ok(notice.html.includes(`href="${COMPASS_URL}`))
  }
})

test('notice wording follows the count and the date', () => {
  assert.match(academyNotices.moduleOverdue({ hireName: 'Cara', moduleCount: 1 }).subject, /1 onboarding module /)
  assert.match(academyNotices.moduleOverdue({ hireName: 'Cara', moduleCount: 3 }).subject, /3 onboarding modules /)
  const item = { title: 'Laptop', hireName: 'Cara', ownerRole: 'SECURITY' as const, dueDate: '2026-12-01' }
  assert.match(academyNotices.checklistItem({ ...item, overdue: false }).html, /due today/)
  assert.match(academyNotices.checklistItem({ ...item, overdue: true }).html, /was due on 2026-12-01/)
})

test('the tracker link only goes to HR, who are the ones who can open it', () => {
  const item = { title: 'Laptop', hireName: 'Cara', dueDate: '2026-12-01', overdue: false }
  assert.match(academyNotices.checklistItem({ ...item, ownerRole: 'HR' }).html, /\/admin\/onboarding\/tracker/)
  for (const ownerRole of ['SECURITY', 'OA', 'TEAM_LEAD'] as const) {
    assert.doesNotMatch(academyNotices.checklistItem({ ...item, ownerRole }).html, /\/admin\/onboarding/)
  }
})

test('vercel runs the job hourly', () => {
  const { crons } = JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }
  assert.deepEqual(crons.find((cron) => cron.path === '/api/cron/onboarding'), { path: '/api/cron/onboarding', schedule: '0 * * * *' })
})

test('the cron route uses the gate and the long timeout', () => {
  const route = read('app/api/cron/onboarding/route.ts')
  assert.match(route, /onboardingCronGate\(/)
  assert.match(route, /maxDuration = 300/)
  assert.match(route, /dynamic = 'force-dynamic'/)
})

test('route notices run after the response', () => {
  const wiring: Array<[string, RegExp]> = [
    ['app/api/admin/onboarding/new-hires/[id]/release/route.ts', /after\(\(\) => notifyCourseReleased\(prisma, id\)\)/],
    ['app/api/onboarding/academy/modules/[slug]/complete/route.ts', /after\(\(\) => notifyPaymentSetupDone\(prisma, user\.id, user\.name\)\)/],
    ['app/api/onboarding/academy/linkedin/route.ts', /after\(\(\) => notifyLinkedinSubmitted\(prisma, user\.id, user\.name\)\)/],
    ['app/api/onboarding/academy/bank/route.ts', /after\(\(\) => notifyFirstPaymentSave\(prisma, user\.id, user\.name\)\)/],
    ['app/api/onboarding/payout/route.ts', /after\(\(\) => notifyFirstPaymentSave\(prisma, user\.id, user\.name\)\)/],
  ]
  for (const [file, pattern] of wiring) assert.match(read(file), pattern, file)
})
