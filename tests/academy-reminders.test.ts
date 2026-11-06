import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPASS_URL } from '../lib/compass-url'
import {
  isOwnerChasable,
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

test('isLocalHour follows Casablanca out of its usual offset during Ramadan', () => {
  // tz database 2025b: UTC+1 on 10 February 2026, UTC+0 on 1 March 2026.
  assert.equal(isLocalHour(at('2026-02-10T09:00:00.000Z'), 'Africa/Casablanca', 10), true)
  assert.equal(isLocalHour(at('2026-03-01T10:00:00.000Z'), 'Africa/Casablanca', 10), true)
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
    academyNotices.checklistDigest({ hireName: name, newHireId: 'hire-1', ownerRole: 'HR', items: [{ title: name, dueDate: '2026-12-01', overdue: true }] }),
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
  const digest = academyNotices.checklistDigest({
    hireName: 'Cara', newHireId: 'hire-1', ownerRole: 'SECURITY',
    items: [{ title: 'Laptop', dueDate: '2026-12-01', overdue: false }, { title: 'Phone', dueDate: '2026-11-28', overdue: true }],
  })
  assert.match(digest.html, /You have 2 open onboarding tasks for Cara/)
  assert.match(digest.html, /<li>Laptop: due today<\/li>/)
  assert.match(digest.html, /<li>Phone: was due 28 Nov 2026<\/li>/)
  assert.doesNotMatch(digest.html, /2026-11-28/)
  const single = academyNotices.checklistDigest({ hireName: 'Cara', newHireId: 'hire-1', ownerRole: 'HR', items: [{ title: 'Laptop', dueDate: '2026-12-01', overdue: false }] })
  assert.match(single.html, /You have 1 open onboarding task for Cara/)
})

test('each owner is linked to the page where they can clear their tasks', () => {
  const link = (ownerRole: 'HR' | 'SECURITY' | 'OA' | 'TEAM_LEAD') =>
    academyNotices.checklistDigest({ hireName: 'Cara', newHireId: 'hire/1', ownerRole, items: [{ title: 'Laptop', dueDate: '2026-12-01', overdue: false }] }).html
  assert.ok(link('HR').includes(`href="${COMPASS_URL}/admin/onboarding/tracker"`))
  assert.ok(link('OA').includes(`href="${COMPASS_URL}/oa/payment-details"`))
  assert.ok(link('SECURITY').includes(`href="${COMPASS_URL}/security/onboarding/hire%2F1"`))
  assert.ok(link('TEAM_LEAD').includes(`href="${COMPASS_URL}/team-lead-form/hire%2F1"`))
})

test('owners are chased only for what they can clear', () => {
  const item = (key: string, autoTickEvent: string | null = null) => ({ key, autoTickEvent })
  assert.equal(isOwnerChasable(item('contract-signed'), false), true)
  assert.equal(isOwnerChasable(item('setup-complete', 'SETUP_READY'), false), true)
  assert.equal(isOwnerChasable(item('lead-input', 'LEAD_INPUT_SUBMITTED'), true), false)
  for (const event of ['SECURITY_ACK_SIGNED', 'PAYMENT_SETUP_DONE', 'DISCORD_USERNAME_SAVED', 'COURSE_COMPLETED']) {
    assert.equal(isOwnerChasable(item('any', event), true), false, event)
  }
  assert.equal(isOwnerChasable(item('linkedin-update', 'LINKEDIN_VERIFIED'), false), false)
  assert.equal(isOwnerChasable(item('linkedin-update', 'LINKEDIN_VERIFIED'), true), true)
})

test('the owner panels show only with the flag on', () => {
  for (const page of ['app/(evaluator)/team-lead-form/[newHireId]/page.tsx', 'app/(security)/security/onboarding/[newHireId]/page.tsx']) {
    assert.match(read(page), /academyEnabled && newHireId && <MyChecklist newHireId=\{newHireId\} \/>/, page)
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

test('a first-save notice is retried by later saves: its key is what stops a repeat', () => {
  for (const file of ['app/api/onboarding/academy/bank/route.ts', 'app/api/onboarding/payout/route.ts']) {
    assert.match(read(file), /\n    after\(\(\) => notifyFirstPaymentSave\(/, file)
  }
})
