import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { toItemState } from '../lib/academy/checklist'
import { createChecklist, syncChecklist, tickItem } from '../lib/academy/service/checklist'
import { saveSetup } from '../lib/academy/service/setup'
import { ACADEMY_CHECKLIST } from '../prisma/seed-academy-data'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import { cleanCourse, createReadyHire, NEW_HIRE_ID, setupBody } from './helpers/academy-course-fixtures'

const itemFor = (key: string) =>
  prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId: NEW_HIRE_ID, templateItem: { key } } })
const isAcademyError = (status: number, message?: string) => (e: unknown) =>
  e instanceof AcademyError && e.status === status && (message === undefined || e.message === message)

beforeEach(async () => {
  if (WEEKLY_DB_READY) await createReadyHire()
})
after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

test('saveSetup creates 17 rows from the template, and createChecklist is idempotent', ACADEMY_DB_TEST, async () => {
  assert.equal(ACADEMY_CHECKLIST.length, 17)
  assert.equal(await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } }), 17)
  assert.equal(await createChecklist(prisma, NEW_HIRE_ID), 0)
  assert.equal((await itemFor('contract-signed')).dueAt.toISOString(), '2026-11-17T00:00:00.000Z')
})

test('an inactive template item is skipped', ACADEMY_DB_TEST, async () => {
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
  await prisma.onboardingChecklistTemplateItem.update({ where: { key: 'hr-call' }, data: { isActive: false } })
  assert.equal(await createChecklist(prisma, NEW_HIRE_ID), 16)
})

test('editing a template item does not change rows already created', ACADEMY_DB_TEST, async () => {
  const before = await itemFor('contract-signed')
  await prisma.onboardingChecklistTemplateItem.update({ where: { key: 'contract-signed' }, data: { dueOffsetDays: -30, title: 'Changed' } })
  assert.equal(await createChecklist(prisma, NEW_HIRE_ID), 0)
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal((await itemFor('contract-signed')).dueAt.toISOString(), before.dueAt.toISOString())
})

test('syncChecklist backfills a hire set up earlier', ACADEMY_DB_TEST, async () => {
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal(await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } }), 17)
})

test('syncChecklist ticks SETUP_READY, marks autoTicked, and never unticks', ACADEMY_DB_TEST, async () => {
  const now = new Date('2026-11-10T10:00:00.000Z')
  assert.equal(await syncChecklist(prisma, NEW_HIRE_ID, now) > 0, true)
  const ticked = await itemFor('setup-complete')
  assert.equal(ticked.autoTicked, true)
  assert.equal(ticked.doneAt?.toISOString(), now.toISOString())
  assert.ok((await itemFor('lead-input')).doneAt)
  assert.ok((await itemFor('accounts-created')).doneAt)
  assert.equal((await itemFor('course-released')).doneAt, null)
  assert.equal((await itemFor('contract-signed')).doneAt, null)

  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { buddyId: null } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.ok((await itemFor('setup-complete')).doneAt)
})

test('syncChecklist ticks the user-fact events', ACADEMY_DB_TEST, async () => {
  await prisma.user.update({
    where: { id: P.hire.id },
    data: { discordUsername: 'cara#1', linkedinUrl: 'https://example.test/in/cara', onboardingCompleted: true },
  })
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { academyReleasedAt: new Date(), linkedinVerifiedAt: new Date() } })
  await prisma.onboardingAcknowledgement.create({ data: { userId: P.hire.id, kind: 'SECURITY_SOPS', statementText: 's', typedName: 'Cara' } })
  await prisma.onboardingPaymentDetails.create({ data: { userId: P.hire.id, method: 'WISE' } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  for (const key of ['course-released', 'discord-account', 'linkedin-update', 'security-ack', 'payment-setup', 'academy-complete']) {
    assert.ok((await itemFor(key)).doneAt, key)
  }
})

test('a moved joining date changes open due dates, not done ones', ACADEMY_DB_TEST, async () => {
  await syncChecklist(prisma, NEW_HIRE_ID)
  const done = await itemFor('setup-complete')
  await saveSetup(prisma, NEW_HIRE_ID, setupBody({ onboardingDate: '2026-12-08' }), P.hr.id)
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal((await itemFor('contract-signed')).dueAt.toISOString(), '2026-11-24T00:00:00.000Z')
  assert.equal((await itemFor('setup-complete')).dueAt.toISOString(), done.dueAt.toISOString())
})

test('tickItem: overdue needs a reason; with one it saves', ACADEMY_DB_TEST, async () => {
  const item = await itemFor('contract-signed')
  const late = new Date('2026-11-20T10:00:00.000Z')
  await assert.rejects(tickItem(prisma, item.id, P.hr.id, { done: true }, late), isAcademyError(400, 'Add a reason for missing this date.'))
  const view = await tickItem(prisma, item.id, P.hr.id, { done: true, missReason: 'Waiting on the signed copy' }, late)
  assert.equal(view.state, 'DONE_LATE')
  assert.equal(view.doneById, P.hr.id)
  assert.equal(view.autoTicked, false)
  assert.equal(typeof view.dueAt, 'string')
})

test('tickItem: an on-time tick needs no reason, and a manual tick can be unticked', ACADEMY_DB_TEST, async () => {
  const item = await itemFor('contract-signed')
  const early = new Date('2026-11-10T10:00:00.000Z')
  assert.equal((await tickItem(prisma, item.id, P.hr.id, { done: true }, early)).state, 'DONE')
  const undone = await tickItem(prisma, item.id, P.hr.id, { done: false }, early)
  assert.equal(undone.doneAt, null)
  assert.equal(undone.state, 'OPEN')
})

test('tickItem: an auto-ticked item cannot be unticked', ACADEMY_DB_TEST, async () => {
  await syncChecklist(prisma, NEW_HIRE_ID)
  const item = await itemFor('setup-complete')
  await assert.rejects(tickItem(prisma, item.id, P.hr.id, { done: false }), isAcademyError(400))
  assert.ok((await itemFor('setup-complete')).doneAt)
})

test('a late auto-tick needs a reason until one is added', ACADEMY_DB_TEST, async () => {
  const now = new Date('2026-12-20T10:00:00.000Z')
  await syncChecklist(prisma, NEW_HIRE_ID, now)
  const row = await itemFor('setup-complete')
  assert.equal(toItemState(row, now), 'DONE_LATE_NEEDS_REASON')
  const view = await tickItem(prisma, row.id, P.hr.id, { done: true, missReason: 'Lead was away' }, now)
  assert.equal(view.state, 'DONE_LATE')
  assert.equal(view.autoTicked, true)
  assert.equal(view.missReason, 'Lead was away')
})

test('tickItem: an unknown item is a 404', ACADEMY_DB_TEST, async () => {
  await assert.rejects(tickItem(prisma, 'act-nope', P.hr.id, { done: true }), isAcademyError(404))
})

test('a profile LinkedIn URL alone does not tick; HR verification does', ACADEMY_DB_TEST, async () => {
  await prisma.user.update({ where: { id: P.hire.id }, data: { linkedinUrl: 'https://example.test/in/cara' } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal((await itemFor('linkedin-update')).doneAt, null)
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { linkedinVerifiedAt: new Date() } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.ok((await itemFor('linkedin-update')).doneAt)
})

test('a manual tick followed by sync stays manual', ACADEMY_DB_TEST, async () => {
  const item = await itemFor('setup-complete')
  await tickItem(prisma, item.id, P.hr.id, { done: true }, new Date('2026-11-10T10:00:00.000Z'))
  assert.equal(await syncChecklist(prisma, NEW_HIRE_ID, new Date('2026-11-11T10:00:00.000Z')) >= 0, true)
  const row = await itemFor('setup-complete')
  assert.equal(row.autoTicked, false)
  assert.equal(row.doneById, P.hr.id)
  assert.equal(row.doneAt?.toISOString(), '2026-11-10T10:00:00.000Z')
})

test('a manual tick landing between sync read and write is not overwritten', ACADEMY_DB_TEST, async () => {
  const item = await itemFor('setup-complete')
  const manualAt = new Date('2026-11-10T10:00:00.000Z')
  const racing = new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop !== 'onboardingChecklistItem') return Reflect.get(target, prop, receiver)
      return new Proxy(target.onboardingChecklistItem, {
        get(model, method) {
          if (method !== 'findMany') return Reflect.get(model, method).bind(model)
          return async (args: Parameters<typeof model.findMany>[0]) => {
            const rows = await model.findMany(args)
            await tickItem(target, item.id, P.hr.id, { done: true }, manualAt)
            return rows
          }
        },
      })
    },
  })
  const ticked = await syncChecklist(racing, NEW_HIRE_ID, new Date('2026-11-11T10:00:00.000Z'))
  const row = await itemFor('setup-complete')
  assert.equal(row.autoTicked, false)
  assert.equal(row.doneById, P.hr.id)
  assert.equal(row.doneAt?.toISOString(), manualAt.toISOString())
  const others = await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID, autoTicked: true } })
  assert.equal(ticked, others)
})

test('a tick is judged against the recomputed due date', ACADEMY_DB_TEST, async () => {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { onboardingDate: new Date('2027-01-12T00:00:00.000Z') } })
  const now = new Date('2026-12-20T10:00:00.000Z')
  await syncChecklist(prisma, NEW_HIRE_ID, now)
  const row = await itemFor('setup-complete')
  assert.equal(row.dueAt.toISOString(), '2027-01-05T00:00:00.000Z')
  assert.equal(toItemState(row, now), 'DONE')
})

test('a row without a stored offset falls back to the template offset', ACADEMY_DB_TEST, async () => {
  const item = await itemFor('contract-signed')
  await prisma.onboardingChecklistItem.update({ where: { id: item.id }, data: { dueOffsetDays: null, dueAt: new Date('2026-01-01T00:00:00.000Z') } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal((await itemFor('contract-signed')).dueAt.toISOString(), '2026-11-17T00:00:00.000Z')
})
