import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { readOwnPayout, readPayout, savePayout } from '../lib/academy/service/payout'
import { ACADEMY_DB_TEST, P, resetAcademyFixtures } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

// Fictional test key, not a real secret.
process.env.PAYROLL_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

const bank = {
  method: 'BANK_TRANSFER', accountHolderName: 'Cara Lindqvist', bankName: 'Example Bank',
  accountNumberOrIban: 'GB33BUKB20201555555555', swiftBic: 'BUKBGB22', bankCountry: 'GB',
  bankAddress: '1 Example Street', currency: 'GBP',
}
const wise = { method: 'WISE', accountHolderName: 'Cara Lindqvist', payoutEmail: 'cara@example.test', currency: 'USD' }

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetAcademyFixtures(prisma)
  await prisma.user.create({ data: { ...P.hr, onboardingCompleted: true } })
  await prisma.user.create({ data: { ...P.hire, onboardingCompleted: true, contractType: 'INDEPENDENT_CONTRACTOR' } })
  await prisma.user.create({ data: { ...P.staff, onboardingCompleted: true, contractType: 'PK_EMPLOYMENT' } })
})
after(async () => {
  if (WEEKLY_DB_READY) await resetAcademyFixtures(prisma)
  await prisma.$disconnect()
})

test('sensitive fields are encrypted at rest; plain fields stay plain; no payroll profile is created', ACADEMY_DB_TEST, async () => {
  await savePayout(prisma, P.hire.id, bank)
  const row = await prisma.contractorPayoutDetails.findUniqueOrThrow({ where: { userId: P.hire.id } })
  for (const f of ['accountHolderName', 'bankName', 'accountNumberOrIban', 'swiftBic', 'bankAddress'] as const) {
    assert.ok(row[f]?.startsWith('p21enc:v1:'), `${f} should be encrypted`)
  }
  assert.equal(row.method, 'BANK_TRANSFER')
  assert.equal(row.bankCountry, 'GB')
  assert.equal(row.currency, 'GBP')
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: P.hire.id } }), 0)
})

test('owner read is decrypted and writes no log', ACADEMY_DB_TEST, async () => {
  await savePayout(prisma, P.hire.id, bank)
  const own = await readOwnPayout(prisma, P.hire.id)
  assert.equal(own?.fields.accountNumberOrIban, 'GB33BUKB20201555555555')
  assert.equal(own?.accountHolderName, 'Cara Lindqvist')
  assert.equal(await prisma.contractorPayoutRevealLog.count(), 0)
  assert.equal(await readOwnPayout(prisma, P.staff.id), null)
})

test('masked read hides values and writes no log', ACADEMY_DB_TEST, async () => {
  await savePayout(prisma, P.hire.id, bank)
  const view = await readPayout(prisma, P.hire.id, { reveal: false, viewerId: P.hr.id })
  assert.equal(view?.fields.accountNumberOrIban, '••••5555')
  assert.equal(view?.fields.swiftBic, '••••')
  assert.equal(view?.fields.bankName, 'Example Bank')
  assert.equal(await prisma.contractorPayoutRevealLog.count(), 0)
})

test('revealed read is unmasked and writes exactly one log row', ACADEMY_DB_TEST, async () => {
  await savePayout(prisma, P.hire.id, bank)
  const view = await readPayout(prisma, P.hire.id, { reveal: true, viewerId: P.hr.id })
  assert.equal(view?.fields.accountNumberOrIban, 'GB33BUKB20201555555555')
  const logs = await prisma.contractorPayoutRevealLog.findMany()
  assert.equal(logs.length, 1)
  assert.equal(logs[0].payoutUserId, P.hire.id)
  assert.equal(logs[0].viewerId, P.hr.id)
})

test('reveal returns nothing and writes no log when the log write fails', ACADEMY_DB_TEST, async () => {
  await savePayout(prisma, P.hire.id, bank)
  await assert.rejects(readPayout(prisma, P.hire.id, { reveal: true, viewerId: 'act-missing-viewer' }))
  assert.equal(await prisma.contractorPayoutRevealLog.count(), 0)
})

test('reveal of a user with no payout returns null and logs nothing', ACADEMY_DB_TEST, async () => {
  assert.equal(await readPayout(prisma, P.hire.id, { reveal: true, viewerId: P.hr.id }), null)
  assert.equal(await prisma.contractorPayoutRevealLog.count(), 0)
})

test('PK employment is refused with 400', ACADEMY_DB_TEST, async () => {
  await assert.rejects(savePayout(prisma, P.staff.id, bank), (e: unknown) => e instanceof AcademyError && e.status === 400)
  assert.equal(await prisma.contractorPayoutDetails.count({ where: { userId: P.staff.id } }), 0)
})

test('a null contractType may save', ACADEMY_DB_TEST, async () => {
  await prisma.user.update({ where: { id: P.hire.id }, data: { contractType: null } })
  await savePayout(prisma, P.hire.id, wise)
  assert.equal(await prisma.contractorPayoutDetails.count({ where: { userId: P.hire.id } }), 1)
})

test('changing method clears the previous method fields; reports first vs update', ACADEMY_DB_TEST, async () => {
  assert.deepEqual(await savePayout(prisma, P.hire.id, bank), { isUpdate: false })
  assert.deepEqual(await savePayout(prisma, P.hire.id, wise), { isUpdate: true })
  const row = await prisma.contractorPayoutDetails.findUniqueOrThrow({ where: { userId: P.hire.id } })
  assert.equal(row.method, 'WISE')
  assert.ok(row.payoutEmail?.startsWith('p21enc:v1:'))
  for (const f of ['bankName', 'accountNumberOrIban', 'swiftBic', 'bankCountry', 'bankAddress', 'instructions'] as const) {
    assert.equal(row[f], null, `${f} should be cleared`)
  }
})
