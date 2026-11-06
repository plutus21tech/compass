import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/db'
import { notifyFirstPaymentSave, notifyPaymentSetupDone } from '../lib/academy/service/notify-oa'
import { notifyCourseReleased, notifyLinkedinSubmitted, sendOnce } from '../lib/academy/service/notify'
import { runOnboardingJob, type ReminderSenders } from '../lib/academy/service/reminders'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import { cleanCourse, createReadyHire, createReleasedHire, HIRE_ID, NEW_HIRE_ID, SLUGS } from './helpers/academy-course-fixtures'

const SUCCESS = { success: true }
const JOINING_DAY_10AM = new Date('2026-12-01T05:00:00.000Z')
const DAY_1 = new Date('2026-12-02T05:00:00.000Z')
const DAY_2 = new Date('2026-12-03T05:00:00.000Z')
const hoursAfter = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000)
const BOGOTA = { officeLocation: 'BOGOTA', remoteCountry: null, workMode: 'HYBRID', contractType: 'INDEPENDENT_CONTRACTOR', employmentStatus: 'PERMANENT' }

type Call = { kind: string; to: string | readonly string[]; cc?: string | null; [key: string]: unknown }

function recorder(fails: (call: Call) => boolean = () => false): { calls: Call[]; senders: ReminderSenders } {
  const calls: Call[] = []
  const record = (kind: string) => async (input: Omit<Call, 'kind'>) => {
    const call = { kind, ...input } as Call
    calls.push(call)
    return { success: !fails(call) }
  }
  return {
    calls,
    senders: {
      leadInputOverdue: record('lead'),
      buddy: record('buddy'),
      moduleOverdue: record('overdue'),
      checklistItem: record('check'),
    },
  }
}

const ofKind = (calls: readonly Call[], kind: string) => calls.filter((call) => call.kind === kind)
const titled = (calls: readonly Call[], title: string) => ofKind(calls, 'check').filter((call) => call.title === title)
const logKeys = async (prefix: string) =>
  (await prisma.onboardingNotificationLog.findMany({ where: { key: { startsWith: prefix } } })).map((row) => row.key)

async function quietly<T>(run: () => Promise<T>): Promise<{ result: T; logged: unknown[][] }> {
  const logged: unknown[][] = []
  const { error, warn } = console
  console.error = (...args: unknown[]) => { logged.push(args) }
  console.warn = (...args: unknown[]) => { logged.push(args) }
  try {
    return { result: await run(), logged }
  } finally {
    console.error = error
    console.warn = warn
  }
}

const job = (now: Date, senders: ReminderSenders) => quietly(() => runOnboardingJob(prisma, now, senders))

async function clearLog(): Promise<void> {
  await prisma.onboardingNotificationLog.deleteMany({})
}

async function secondHire(id: string): Promise<void> {
  await prisma.position.create({ data: { id: `${id}-position`, title: 'Analyst' } })
  await prisma.newHire.create({
    data: {
      id, positionId: `${id}-position`, name: 'Dev Marlow', title: 'Analyst', email: `${id}@example.test`,
      onboardingDate: new Date('2026-12-01T00:00:00.000Z'), buddyId: P.staff.id,
    },
  })
}

/** The real client, except that one checklist call fails. */
function withBrokenSync(): PrismaClient {
  const items = new Proxy(prisma.onboardingChecklistItem, {
    get: (target, property) =>
      property === 'groupBy' ? async () => { throw new Error('boom') } : Reflect.get(target, property),
  })
  return new Proxy(prisma, {
    get: (target, property) => (property === 'onboardingChecklistItem' ? items : Reflect.get(target, property)),
  })
}

beforeEach(async () => {
  if (WEEKLY_DB_READY) {
    await cleanCourse()
    await clearLog()
  }
})
after(async () => {
  if (WEEKLY_DB_READY) {
    await cleanCourse()
    await clearLog()
  }
  await prisma.$disconnect()
})

test('sendOnce: two concurrent calls send once', ACADEMY_DB_TEST, async () => {
  let sends = 0
  const send = async () => { sends += 1; return SUCCESS }
  const results = await Promise.all([sendOnce(prisma, 'act-key', send), sendOnce(prisma, 'act-key', send)])
  assert.equal(sends, 1)
  assert.deepEqual([...results].sort(), [false, true])
})

test('sendOnce: a failed send removes the row and a second run sends', ACADEMY_DB_TEST, async () => {
  const { result } = await quietly(() => sendOnce(prisma, 'act-key', async () => ({ success: false })))
  assert.equal(result, false)
  assert.deepEqual(await logKeys('act-key'), [])
  assert.equal(await sendOnce(prisma, 'act-key', async () => SUCCESS), true)
  assert.deepEqual(await logKeys('act-key'), ['act-key'])
})

test('sendOnce: a send that throws is a failed send and goes no further', ACADEMY_DB_TEST, async () => {
  const { result, logged } = await quietly(() =>
    sendOnce(prisma, 'act-key', async () => { throw new Error('smtp said act-hire@example.test') }),
  )
  assert.equal(result, false)
  assert.deepEqual(await logKeys('act-key'), [])
  assert.equal(JSON.stringify(logged).includes('example.test'), false)
})

test('an overdue hire gets one notice at local 10:00, none the next hour, and the lead is copied from day 2', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  assert.equal((await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })).status, 'PENDING')
  const { calls, senders } = recorder()

  await job(DAY_1, senders)
  assert.deepEqual(ofKind(calls, 'overdue').map(({ to, cc }) => ({ to, cc })), [{ to: P.hire.email, cc: null }])
  await job(hoursAfter(DAY_1, 1), senders)
  assert.equal(ofKind(calls, 'overdue').length, 1)

  await job(DAY_2, senders)
  assert.equal(ofKind(calls, 'overdue').length, 2)
  assert.equal(ofKind(calls, 'overdue')[1].cc, P.lead.email)
  assert.deepEqual((await logKeys('overdue:')).sort(), [`overdue:${HIRE_ID}:2026-12-02`, `overdue:${HIRE_ID}:2026-12-03`])
})

test('overlapping runs send one notice', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const { calls, senders } = recorder()
  await quietly(() => Promise.all([runOnboardingJob(prisma, DAY_1, senders), runOnboardingJob(prisma, DAY_1, senders)]))
  assert.equal(ofKind(calls, 'overdue').length, 1)
})

test('before 10:00 and after the working day, nothing is sent', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(hoursAfter(DAY_1, -1), senders)
  await job(hoursAfter(DAY_1, 8), senders)
  assert.deepEqual(calls, [])
})

test('a hire in another zone is reminded at their own 10:00, under their own date', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: BOGOTA })
  await clearLog()
  const { calls, senders } = recorder()
  await job(new Date('2026-12-02T14:00:00.000Z'), senders)
  assert.equal(ofKind(calls, 'overdue').length, 0)
  await job(new Date('2026-12-02T15:00:00.000Z'), senders)
  assert.deepEqual(await logKeys('overdue:'), [`overdue:${HIRE_ID}:2026-12-02`])
})

test('nothing overdue, nothing sent', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(JOINING_DAY_10AM, senders)
  assert.equal(ofKind(calls, 'overdue').length, 0)
})

test('a completed module is not counted', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(DAY_1, senders)
  const before = ofKind(calls, 'overdue')[0].moduleCount as number
  assert.ok(before >= 2)

  await clearLog()
  const first = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, module: { slug: SLUGS[0] } } })
  await prisma.onboardingProgress.update({ where: { id: first.id }, data: { status: 'COMPLETED', completedAt: DAY_1 } })
  await job(DAY_1, senders)
  assert.equal(ofKind(calls, 'overdue')[1].moduleCount, before - 1)

  await clearLog()
  await prisma.onboardingProgress.updateMany({
    where: { userId: HIRE_ID, status: { not: 'COMPLETED' }, module: { phase: 'DAY_1' } },
    data: { status: 'COMPLETED', completedAt: DAY_1 },
  })
  await job(DAY_1, senders)
  assert.equal(ofKind(calls, 'overdue').length, 2)
})

test('a LOCKED overdue row counts, as the course shows it overdue', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const first = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, module: { slug: SLUGS[0] } } })
  await prisma.onboardingProgress.update({ where: { id: first.id }, data: { status: 'COMPLETED', completedAt: DAY_1 } })
  const open = await prisma.onboardingProgress.findMany({
    where: { userId: HIRE_ID, module: { phase: 'DAY_1' }, status: { not: 'COMPLETED' } },
  })
  assert.ok(open.length > 0 && open.every((row) => row.status === 'LOCKED'))
  const { calls, senders } = recorder()
  await job(DAY_1, senders)
  assert.equal(ofKind(calls, 'overdue').length, 1)
})

test('assignment and re-read rows do not count', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { source: 'SINGLE_ASSIGNMENT' } })
  const { calls, senders } = recorder()
  await job(DAY_1, senders)
  assert.equal(ofKind(calls, 'overdue').length, 0)
})

test('a hire who has not been released, or has finished, gets no overdue notice', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const { calls, senders } = recorder()
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { academyReleasedAt: null } })
  await job(DAY_1, senders)
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { academyReleasedAt: DAY_1, status: 'COMPLETED' } })
  await job(DAY_1, senders)
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { status: 'ONBOARDING' } })
  await prisma.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  await job(DAY_1, senders)
  assert.equal(ofKind(calls, 'overdue').length, 0)
})

test('the buddy gets one notice, on the joining date only', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(hoursAfter(JOINING_DAY_10AM, -24), senders)
  assert.equal(ofKind(calls, 'buddy').length, 0)
  await job(JOINING_DAY_10AM, senders)
  await job(hoursAfter(JOINING_DAY_10AM, 1), senders)
  await job(DAY_1, senders)
  assert.deepEqual(ofKind(calls, 'buddy').map(({ to, buddyName, hireName }) => ({ to, buddyName, hireName })), [
    { to: P.buddy.email, buddyName: P.buddy.name, hireName: 'Cara' },
  ])
  assert.deepEqual(await logKeys('buddy:'), [`buddy:${NEW_HIRE_ID}`])
})

test('the joining date is the stored date in a zone behind UTC too', ACADEMY_DB_TEST, async () => {
  await createReadyHire({ attributes: BOGOTA })
  await clearLog()
  const { calls, senders } = recorder()
  await job(new Date('2026-11-30T15:00:00.000Z'), senders)
  assert.equal(ofKind(calls, 'buddy').length, 0)
  await job(new Date('2026-12-01T15:00:00.000Z'), senders)
  assert.equal(ofKind(calls, 'buddy').length, 1)
})

test('a failed buddy notice is retried by the next run, so it is not lost', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const failing = recorder((call) => call.kind === 'buddy')
  const { result } = await job(JOINING_DAY_10AM, failing.senders)
  assert.equal(result.failed, 1)
  const { calls, senders } = recorder()
  await job(hoursAfter(JOINING_DAY_10AM, 1), senders)
  assert.equal(ofKind(calls, 'buddy').length, 1)
})

test("a checklist item due today mails its owner once, and TEAM_LEAD goes to the hire's lead", ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(JOINING_DAY_10AM, senders)
  await job(hoursAfter(JOINING_DAY_10AM, 1), senders)

  const hrCall = titled(calls, 'HR onboarding call held')
  assert.equal(hrCall.length, 1)
  assert.ok(hrCall[0].to.includes(P.hr.email)) // every HR user: the shared test database may hold others
  assert.deepEqual([hrCall[0].overdue, hrCall[0].ownerRole], [false, 'HR'])
  assert.deepEqual(titled(calls, 'Team onboarding call held').map(({ to }) => to), [[P.lead.email]])
  const item = await prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId: NEW_HIRE_ID, templateItem: { key: 'hr-call' } } })
  assert.deepEqual(await logKeys(`check:${item.id}`), [`check:${item.id}:2026-12-01`])
})

test('an overdue item mails daily, a done or later item does not, and sync runs before the notices', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const { calls, senders } = recorder()
  await job(JOINING_DAY_10AM, senders)
  const contract = 'Signed contract on file'
  assert.equal(titled(calls, contract)[0].overdue, true)
  assert.equal(titled(calls, 'LinkedIn Profile Update').length, 0) // not due yet
  assert.equal(titled(calls, 'Setup fields complete (team, buddy, calls, core hours)').length, 0) // ticked by the sync

  await job(DAY_1, senders)
  assert.equal(titled(calls, contract).length, 2)
  await prisma.onboardingChecklistItem.updateMany({
    where: { newHireId: NEW_HIRE_ID, templateItem: { key: 'contract-signed' } },
    data: { doneAt: DAY_1 },
  })
  await job(DAY_2, senders)
  assert.equal(titled(calls, contract).length, 2)
})

test('an item with nobody to send to keeps its key, so a later owner still hears', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const { calls, senders } = recorder()
  const { result } = await job(JOINING_DAY_10AM, senders)
  assert.ok(result.noRecipient > 0) // the fixtures have no SECURITY user
  const title = 'Security onboarding call held'
  assert.equal(titled(calls, title).length, 0)
  await prisma.user.create({ data: { ...P.oa, id: 'act-security', email: 'act-security@example.test', role: 'SECURITY' } })
  await job(hoursAfter(JOINING_DAY_10AM, 1), senders)
  assert.deepEqual(titled(calls, title).map(({ to }) => to), [['act-security@example.test']])
})

test('the lead is reminded daily once the due day is over, until the input is in', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.teamLeadForm.update({ where: { newHireId: NEW_HIRE_ID }, data: { submittedAt: null } })
  await clearLog()
  const { calls, senders } = recorder()
  const dueDay = new Date('2026-11-24T05:00:00.000Z')
  await job(dueDay, senders)
  assert.equal(ofKind(calls, 'lead').length, 0)
  await job(hoursAfter(dueDay, 24), senders)
  await job(hoursAfter(dueDay, 25), senders)
  await job(hoursAfter(dueDay, 48), senders)
  assert.deepEqual(ofKind(calls, 'lead').map(({ to, hireName }) => ({ to, hireName })), [
    { to: P.lead.email, hireName: 'Cara' },
    { to: P.lead.email, hireName: 'Cara' },
  ])
  assert.deepEqual((await logKeys('lead-input:')).sort(), [`lead-input:${NEW_HIRE_ID}:2026-11-25`, `lead-input:${NEW_HIRE_ID}:2026-11-26`])

  await prisma.teamLeadForm.update({ where: { newHireId: NEW_HIRE_ID }, data: { submittedAt: DAY_1 } })
  await job(hoursAfter(dueDay, 72), senders)
  assert.equal(ofKind(calls, 'lead').length, 2)
})

test('a failing send for one person does not stop the others, and only ids are logged', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await secondHire('act-newhire-2')
  await clearLog()
  const { calls, senders } = recorder((call) => {
    if (call.to === P.buddy.email) throw new Error(`smtp refused ${P.buddy.email}`)
    return false
  })
  const { result, logged } = await job(JOINING_DAY_10AM, senders)
  assert.deepEqual(ofKind(calls, 'buddy').map((call) => call.to), [P.buddy.email, P.staff.email])
  assert.equal(result.failed, 1)
  assert.equal(result.hires, 2)
  assert.ok(result.sent > 0)
  const text = JSON.stringify(logged)
  assert.equal(text.includes('example.test'), false)
  assert.equal(text.includes(P.hire.name), false)
})

test("a checklist that will not sync is counted, and that hire's other notices still go", ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await clearLog()
  const { calls, senders } = recorder()
  const { result } = await quietly(() => runOnboardingJob(withBrokenSync(), JOINING_DAY_10AM, senders))
  assert.equal(result.failed, 1)
  assert.equal(ofKind(calls, 'buddy').length, 1)
  assert.equal(ofKind(calls, 'check').length, 0)
})

test('a recently finished hire stays on the job for their checklist alone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { status: 'COMPLETED' } })
  await prisma.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: 's', typedName: 'Cara', signedAt: JOINING_DAY_10AM },
  })
  await clearLog()
  const { calls, senders } = recorder()
  await job(new Date('2026-12-15T05:00:00.000Z'), senders)
  assert.deepEqual([...new Set(calls.map((call) => call.kind))], ['check'])
  assert.equal(titled(calls, "Completion of Manager's Onboarding Checklist").length, 1)
})

test('route notices go once, however often the action is repeated', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  const sent: string[] = []
  const send = (label: string) => async (...args: unknown[]) => {
    sent.push(`${label}:${String(args[0])}`)
    return SUCCESS
  }
  for (let run = 0; run < 2; run += 1) {
    await notifyCourseReleased(prisma, NEW_HIRE_ID, send('released'))
    await notifyFirstPaymentSave(prisma, HIRE_ID, 'Cara', send('first-save'))
    await notifyPaymentSetupDone(prisma, HIRE_ID, 'Cara', send('payment-done'))
    await notifyLinkedinSubmitted(prisma, HIRE_ID, 'Cara', send('linkedin'))
  }
  assert.deepEqual(sent, [`released:${P.hire.email}`, 'first-save:Cara', 'payment-done:Cara', 'linkedin:Cara'])
  assert.deepEqual((await prisma.onboardingNotificationLog.findMany()).map((row) => row.key).sort(), [
    `first-save:${HIRE_ID}`, `linkedin:${HIRE_ID}`, `payment-done:${HIRE_ID}`, `released:${NEW_HIRE_ID}`,
  ])
})

test('a route notice that fails never throws, and repeating the action retries it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await clearLog()
  await quietly(() => notifyCourseReleased(prisma, NEW_HIRE_ID, async () => { throw new Error('smtp down') }))
  await quietly(() => notifyFirstPaymentSave(prisma, HIRE_ID, 'Cara', async () => ({ success: false })))
  assert.equal(await prisma.onboardingNotificationLog.count(), 0)
  let sends = 0
  await notifyCourseReleased(prisma, NEW_HIRE_ID, async () => { sends += 1; return SUCCESS })
  assert.equal(sends, 1)
})

test('a route notice survives the database being down', ACADEMY_DB_TEST, async () => {
  const down = { onboardingNotificationLog: { createMany: async () => { throw new Error('db down') } } }
  const { logged } = await quietly(() => notifyLinkedinSubmitted(down as never, HIRE_ID, 'Cara', async () => SUCCESS))
  assert.equal(logged.length, 1)
})
