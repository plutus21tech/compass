import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { decryptField } from '../lib/academy/field-encryption'
import { loadModule } from '../lib/academy/service/course'
import { completeModule, paymentFacts, recordEvent } from '../lib/academy/service/progress'
import { readPayout, savePayout } from '../lib/academy/service/payout'
import {
  readOwnBankStatus, saveBankDetails, saveDiscordUsername, saveLinkedinUrl, signAcknowledgement,
} from '../lib/academy/service/fields'
import { setPersonAttributes } from '../lib/academy/service/attributes'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { CONTRACTOR_ATTRIBUTES, HIRE_ID, cleanCourse, createReleasedHire, progressRow } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

// Fictional test key, not a real secret.
process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

// Fictional IBAN.
const IBAN = 'PK36SCBL0000001123456702'
const BANK = { accountTitle: 'Cara Lindqvist', bankName: 'Example Bank', branch: 'Main Branch', iban: 'pk36 scbl 0000 0011 2345 6702' }
const WISE = { method: 'WISE', accountHolderName: 'Cara', payoutEmail: 'c@example.test', currency: 'USD' }

const fails = (status: number, message?: RegExp) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  if (message) assert.match(error.message, message)
  return true
}

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

const openEverything = () =>
  prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, status: 'LOCKED' }, data: { status: 'IN_PROGRESS' } })

/** The whole stored row, updatedAt included, so any write at all shows up. */
const profileBytes = async (): Promise<string> =>
  JSON.stringify(await prisma.$queryRaw`SELECT row_to_json(p) AS row FROM "PayrollEmployeeProfile" p WHERE "userId" = ${HIRE_ID}`)

const storedRow = () => prisma.onboardingPaymentDetails.findUniqueOrThrow({ where: { userId: HIRE_ID } })

test('a PK hire with a payroll profile: Module 11 leaves that profile byte-identical', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.payrollEmployeeProfile.create({
    data: { userId: HIRE_ID, accountNumber: 'keep-me', bankName: 'Payroll Bank', accountTitle: 'Payroll Title', designation: 'Analyst' },
  })
  const before = await profileBytes()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Other Bank' })
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  assert.equal(await profileBytes(), before)
  assert.equal((await progressRow('getting-paid')).status, 'COMPLETED')
})

test('a PK hire: details are encrypted in the onboarding store and no payroll profile appears', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: HIRE_ID } }), 0)
  const row = await storedRow()
  assert.equal(row.method, 'PK_BANK')
  for (const f of ['accountTitle', 'bankName', 'branch', 'iban'] as const) {
    assert.ok(row[f]?.startsWith('p21enc:v1:'), f)
    assert.ok(!row[f]?.includes('Example'), f)
  }
  assert.equal(decryptField('onboardingPayment.iban', row.iban), IBAN)
  assert.equal(decryptField('onboardingPayment.branch', row.branch), 'Main Branch')
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: true })
  // Saving again replaces the row.
  await saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Other Bank' })
  assert.equal(await prisma.onboardingPaymentDetails.count({ where: { userId: HIRE_ID } }), 1)
  assert.equal(decryptField('onboardingPayment.bankName', (await storedRow()).bankName), 'Other Bank')
})

test('bank status exposes only whether details are saved and a masked IBAN', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: false, ibanMasked: null })
  await saveBankDetails(prisma, HIRE_ID, BANK)
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: true, ibanMasked: '••••6702' })
})

test('HR and OA read PK_BANK masked; a reveal is unmasked and logged', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await prisma.onboardingPaymentRevealLog.deleteMany({ where: { paymentUserId: HIRE_ID } })

  const masked = await readPayout(prisma, HIRE_ID, { reveal: false, viewerId: P.hr.id })
  assert.equal(masked?.method, 'PK_BANK')
  assert.equal(masked?.fields.iban, '••••6702')
  assert.equal(masked?.fields.branch, '••••')
  assert.equal(masked?.fields.accountTitle, 'Cara Lindqvist')
  assert.equal(masked?.fields.bankName, 'Example Bank')
  assert.equal(await prisma.onboardingPaymentRevealLog.count({ where: { paymentUserId: HIRE_ID } }), 0)

  const revealed = await readPayout(prisma, HIRE_ID, { reveal: true, viewerId: P.oa.id })
  assert.equal(revealed?.fields.iban, IBAN)
  assert.equal(revealed?.fields.branch, 'Main Branch')
  const logs = await prisma.onboardingPaymentRevealLog.findMany({ where: { paymentUserId: HIRE_ID } })
  assert.deepEqual(logs.map((log) => log.viewerId), [P.oa.id])
  await prisma.onboardingPaymentRevealLog.deleteMany({ where: { paymentUserId: HIRE_ID } })
})

test('a saved row only counts for the form the contract type chooses; the other form replaces it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID } })
  const attrs = {
    officeLocation: user.officeLocation, remoteCountry: user.remoteCountry, workMode: user.workMode,
    contractType: user.contractType, employmentStatus: user.employmentStatus,
  }
  await setPersonAttributes(prisma, HIRE_ID, { ...attrs, ...CONTRACTOR_ATTRIBUTES })
  // A saved row is simply saved: moving contract keeps it, and it does not answer the contractor form.
  assert.equal(await prisma.onboardingPaymentDetails.count({ where: { userId: HIRE_ID } }), 1)
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'OTHER', payoutSaved: false })

  await savePayout(prisma, HIRE_ID, WISE)
  const row = await storedRow()
  assert.equal(row.method, 'WISE')
  for (const f of ['accountTitle', 'bankName', 'branch', 'iban'] as const) assert.equal(row[f], null, f)
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'OTHER', payoutSaved: true })

  await setPersonAttributes(prisma, HIRE_ID, attrs)
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: false })
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: false, ibanMasked: null })
})

test('saveBankDetails reports a first save and an update', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, BANK), { isUpdate: false })
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, BANK), { isUpdate: true })
})

test('a contractor moved to PK replacing a payout row counts as an update and leaves none of it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openEverything()
  await savePayout(prisma, HIRE_ID, WISE)
  await prisma.user.update({ where: { id: HIRE_ID }, data: { contractType: 'PK_EMPLOYMENT' } })
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, BANK), { isUpdate: true })
  const row = await storedRow()
  assert.equal(row.method, 'PK_BANK')
  for (const f of ['accountHolderName', 'payoutEmail', 'currency'] as const) assert.equal(row[f], null, f)
})

test('with the contract type blanked, a locked PK_BANK row cannot be replaced', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  await prisma.user.update({ where: { id: HIRE_ID }, data: { contractType: null } })
  await assert.rejects(savePayout(prisma, HIRE_ID, WISE), fails(409, /email acct@plutus21\.com/))
  const row = await storedRow()
  assert.equal(row.method, 'PK_BANK')
  assert.equal(decryptField('onboardingPayment.iban', row.iban), IBAN)
})

test('with the contract type blanked, a payout row can still be changed', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openEverything()
  await savePayout(prisma, HIRE_ID, WISE)
  await prisma.user.update({ where: { id: HIRE_ID }, data: { contractType: null } })
  assert.deepEqual(await savePayout(prisma, HIRE_ID, { ...WISE, currency: 'EUR' }), { isUpdate: true })
})

test('a stored IBAN that cannot be read still says saved, without the value', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingPaymentDetails.create({ data: { userId: HIRE_ID, method: 'PK_BANK', iban: 'PK36-NOT-ENCRYPTED' } })
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: true, ibanMasked: null })
  } finally {
    console.error = original
  }
  assert.equal(logged.length, 1)
  assert.deepEqual(logged[0][1], { userId: HIRE_ID, error: 'Onboarding field is not encrypted' })
  assert.doesNotMatch(JSON.stringify(logged), /PK36/)
})

test('two saves at once leave one row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await Promise.all([saveBankDetails(prisma, HIRE_ID, BANK), saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Other Bank' })])
  assert.equal(await prisma.onboardingPaymentDetails.count({ where: { userId: HIRE_ID } }), 1)
})

test('a contractor cannot save bank details and nothing is written; a PK hire cannot save a payout', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(400))
  assert.equal(await prisma.onboardingPaymentDetails.count(), 0)
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: HIRE_ID } }), 0)

  await createReleasedHire()
  await assert.rejects(savePayout(prisma, HIRE_ID, WISE), fails(400))
})

test('an invalid IBAN is refused by the service and writes nothing', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, { ...BANK, iban: 'GB33BUKB20201555555555' }))
  assert.equal(await prisma.onboardingPaymentDetails.count(), 0)
})

test('module 11 for a PK hire with saved details completes; a contractor needs payout plus the tick', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await assert.rejects(completeModule(prisma, HIRE_ID, 'getting-paid'), fails(409))
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  const view = await loadModule(prisma, HIRE_ID, 'getting-paid')
  assert.equal(view.bankSaved, true)
  assert.ok(!JSON.stringify(view).includes(IBAN))

  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openEverything()
  await recordEvent(prisma, HIRE_ID, 'getting-paid', { type: 'CHECK', key: 'invoice-template', checked: true })
  await assert.rejects(completeModule(prisma, HIRE_ID, 'getting-paid'), fails(409))
  await savePayout(prisma, HIRE_ID, WISE)
  await completeModule(prisma, HIRE_ID, 'getting-paid')
})

test('saveDiscordUsername trims, validates and writes only the user', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await saveDiscordUsername(prisma, HIRE_ID, ' cara.l ')
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID } })).discordUsername, 'cara.l')
  await assert.rejects(saveDiscordUsername(prisma, HIRE_ID, 'has space'))
  await assert.rejects(saveDiscordUsername(prisma, HIRE_ID, 'a'))
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID } })).discordUsername, 'cara.l')
})

test('saveLinkedinUrl writes state on the Module 8 row only, keeps other state, and refuses a LOCKED row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(saveLinkedinUrl(prisma, HIRE_ID, 'https://www.linkedin.com/in/cara'), fails(403))
  assert.equal((await progressRow('linkedin')).state, null)
  await openEverything()
  await recordEvent(prisma, HIRE_ID, 'linkedin', { type: 'SCROLLED_END' })
  await saveLinkedinUrl(prisma, HIRE_ID, 'https://www.linkedin.com/in/cara')
  const state = (await progressRow('linkedin')).state as { linkedinUrl?: string; scrolledToEnd?: boolean }
  assert.equal(state.linkedinUrl, 'https://www.linkedin.com/in/cara')
  assert.equal(state.scrolledToEnd, true)
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID } })).linkedinUrl, null)
  await assert.rejects(saveLinkedinUrl(prisma, HIRE_ID, 'https://evil.example/in/cara'))
  await completeModule(prisma, HIRE_ID, 'linkedin')
})

test('concurrent LinkedIn save and scroll event lose neither write', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await Promise.all([
    saveLinkedinUrl(prisma, HIRE_ID, 'https://www.linkedin.com/in/cara'),
    recordEvent(prisma, HIRE_ID, 'linkedin', { type: 'SCROLLED_END' }),
  ])
  const state = (await progressRow('linkedin')).state as { linkedinUrl?: string; scrolledToEnd?: boolean }
  assert.equal(state.linkedinUrl, 'https://www.linkedin.com/in/cara')
  assert.equal(state.scrolledToEnd, true)
})

test('signAcknowledgement: wrong name fails, right name stores the server statement, twice keeps the first', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const args = { kind: 'SECURITY_SOPS', moduleSlug: 'security' } as const
  await assert.rejects(
    signAcknowledgement(prisma, HIRE_ID, { ...args, typedName: 'Someone Else' }),
    fails(400, /Type your full name as it appears at the top of this page\./),
  )
  // Module 7 is still locked.
  await assert.rejects(signAcknowledgement(prisma, HIRE_ID, { ...args, typedName: P.hire.name }), fails(403))
  await openEverything()
  await assert.rejects(
    signAcknowledgement(prisma, HIRE_ID, { kind: 'VALUES_CODE_OF_CONDUCT' as never, moduleSlug: 'security', typedName: P.hire.name }),
    fails(400),
  )
  await assert.rejects(signAcknowledgement(prisma, HIRE_ID, { ...args, moduleSlug: 'welcome', typedName: P.hire.name }), fails(400))
  assert.equal(await prisma.onboardingAcknowledgement.count(), 0)

  const first = await signAcknowledgement(prisma, HIRE_ID, { ...args, typedName: `  ${P.hire.name.toUpperCase().replace(' ', '   ')} ` })
  const stored = await prisma.onboardingAcknowledgement.findFirstOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(stored.statementText, 'I have read the security and equipment SOPs and I will follow them.')
  assert.ok(stored.moduleVersionId)
  assert.equal(stored.typedName, P.hire.name)
  const second = await signAcknowledgement(prisma, HIRE_ID, { ...args, typedName: P.hire.name })
  assert.equal(second.signedAt.getTime(), first.signedAt.getTime())
  assert.equal(await prisma.onboardingAcknowledgement.count({ where: { userId: HIRE_ID } }), 1)
})

test('concurrent signatures produce one row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const args = { kind: 'SECURITY_SOPS', moduleSlug: 'security', typedName: P.hire.name } as const
  await Promise.all([signAcknowledgement(prisma, HIRE_ID, args), signAcknowledgement(prisma, HIRE_ID, args)])
  assert.equal(await prisma.onboardingAcknowledgement.count({ where: { userId: HIRE_ID } }), 1)
})

test('bank details are refused while Module 11 is locked, and after it is completed', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(403))
  assert.equal(await prisma.onboardingPaymentDetails.count(), 0)
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  await assert.rejects(
    saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Changed Bank' }),
    fails(409, /Your bank details are saved\. To change them, email acct@plutus21\.com\./),
  )
  const row = await prisma.onboardingPaymentDetails.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(decryptField('onboardingPayment.bankName', row.bankName), 'Example Bank')
})

test('a missing Module 11 row is a 404, not a write', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.onboardingProgress.deleteMany({ where: { userId: HIRE_ID, module: { slug: 'getting-paid' } } })
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(404, /This isn't available yet\./))
  assert.equal(await prisma.onboardingPaymentDetails.count(), 0)
})

