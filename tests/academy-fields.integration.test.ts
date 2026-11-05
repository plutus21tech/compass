import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { decryptSensitiveValue } from '../lib/payroll/sensitive-fields'
import { loadModule } from '../lib/academy/service/course'
import { completeModule, paymentFacts, recordEvent } from '../lib/academy/service/progress'
import { savePayout } from '../lib/academy/service/payout'
import {
  applyPendingBankDetails, readOwnBankStatus, saveBankDetails, saveDiscordUsername, saveLinkedinUrl, signAcknowledgement,
} from '../lib/academy/service/fields'
import { setPersonAttributes } from '../lib/academy/service/attributes'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { CONTRACTOR_ATTRIBUTES, HIRE_ID, cleanCourse, createReleasedHire, progressRow } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

// Fictional test key, not a real secret.
process.env.PAYROLL_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

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

test('a PK hire with a profile: fields encrypted at rest, accountNumber untouched, no pending row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID, accountNumber: 'keep-me', designation: 'Analyst' } })
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, BANK), { held: false })
  const row = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  for (const f of ['accountTitle', 'bankName', 'branch', 'iban'] as const) assert.ok(row[f]?.startsWith('p21enc:v1:'), f)
  assert.equal(decryptSensitiveValue('iban', row.iban), IBAN)
  assert.equal(decryptSensitiveValue('branch', row.branch), 'Main Branch')
  assert.equal(row.accountNumber, 'keep-me')
  assert.equal(row.designation, 'Analyst')
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: true })
})

test('a PK hire without a profile: encrypted pending row, no profile, bankSaved true', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, BANK), { held: true })
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: HIRE_ID } }), 0)
  const row = await prisma.onboardingPendingBankDetails.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  for (const f of ['accountTitle', 'bankName', 'branch', 'iban'] as const) {
    assert.ok(row[f].startsWith('p21enc:v1:'), f)
    assert.ok(!row[f].includes('Example'), f)
  }
  assert.equal(decryptSensitiveValue('pendingBank.iban', row.iban), IBAN)
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: true })
  // Saving again replaces the held row.
  await saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Other Bank' })
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 1)
})

test('a contractor cannot save bank details and nothing is written; a PK hire cannot save a payout', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(400))
  assert.equal(await prisma.onboardingPendingBankDetails.count(), 0)
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: HIRE_ID } }), 0)

  await createReleasedHire()
  await assert.rejects(savePayout(prisma, HIRE_ID, WISE), fails(400))
})

test('an invalid IBAN is refused by the service and writes nothing', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, { ...BANK, iban: 'GB33BUKB20201555555555' }))
  assert.equal(await prisma.onboardingPendingBankDetails.count(), 0)
})

test('applyPendingBankDetails moves the data under payroll labels and deletes the row; no profile keeps it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  assert.equal(await applyPendingBankDetails(prisma, HIRE_ID), false)
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 1)

  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID, accountNumber: 'keep-me' } })
  assert.equal(await applyPendingBankDetails(prisma, HIRE_ID), true)
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
  const row = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(decryptSensitiveValue('iban', row.iban), IBAN)
  assert.equal(decryptSensitiveValue('bankName', row.bankName), 'Example Bank')
  assert.equal(decryptSensitiveValue('accountTitle', row.accountTitle), 'Cara Lindqvist')
  assert.equal(decryptSensitiveValue('branch', row.branch), 'Main Branch')
  assert.equal(row.accountNumber, 'keep-me')
  assert.equal(await applyPendingBankDetails(prisma, HIRE_ID), false)
})

test('bank status exposes only saved, held and a masked IBAN', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: false, held: false, ibanMasked: null })
  await saveBankDetails(prisma, HIRE_ID, BANK)
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: true, held: true, ibanMasked: '••••6702' })
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID } })
  await applyPendingBankDetails(prisma, HIRE_ID)
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: true, held: false, ibanMasked: '••••6702' })
})

test('module 11 for a PK hire with held details completes; a contractor needs payout plus the tick', ACADEMY_DB_TEST, async () => {
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
  assert.equal(await prisma.onboardingPendingBankDetails.count(), 0)
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  await assert.rejects(
    saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Changed Bank' }),
    fails(409, /Your bank details are saved\. To change them, ask HR\./),
  )
  const held = await prisma.onboardingPendingBankDetails.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(decryptSensitiveValue('pendingBank.bankName', held.bankName), 'Example Bank')
})

test('a missing Module 11 row is a 404, not a write', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.onboardingProgress.deleteMany({ where: { userId: HIRE_ID, module: { slug: 'getting-paid' } } })
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(404, /This isn't available yet\./))
  assert.equal(await prisma.onboardingPendingBankDetails.count(), 0)
})

test('held details are dropped, not copied, when the hire is no longer a PK employee', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID } })
  await prisma.user.update({ where: { id: HIRE_ID }, data: { contractType: 'INDEPENDENT_CONTRACTOR' } })
  assert.equal(await applyPendingBankDetails(prisma, HIRE_ID), false)
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
  assert.equal((await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: HIRE_ID } })).iban, null)
})

test('changing contract type away from PK deletes held details; staying PK keeps them', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID } })
  const attrs = {
    officeLocation: user.officeLocation, remoteCountry: user.remoteCountry, workMode: user.workMode,
    contractType: user.contractType, employmentStatus: user.employmentStatus,
  }
  await setPersonAttributes(prisma, HIRE_ID, attrs)
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 1)
  await setPersonAttributes(prisma, HIRE_ID, { ...attrs, ...CONTRACTOR_ATTRIBUTES })
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
})

test('details saved after a profile appears are not overwritten by an older held copy', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID } })
  assert.deepEqual(await saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Newer Bank' }), { held: false })
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
  assert.deepEqual(await readOwnBankStatus(prisma, HIRE_ID), { saved: true, held: false, ibanMasked: '••••6702' })
  assert.equal(await applyPendingBankDetails(prisma, HIRE_ID), false)
  const row = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(decryptSensitiveValue('bankName', row.bankName), 'Newer Bank')
})

test('apply racing a newer save never leaves the older values on the profile', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID } })
  await Promise.all([
    applyPendingBankDetails(prisma, HIRE_ID),
    saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Newer Bank' }),
  ])
  const row = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: HIRE_ID } })
  assert.equal(decryptSensitiveValue('bankName', row.bankName), 'Newer Bank')
  assert.equal(await prisma.onboardingPendingBankDetails.count({ where: { userId: HIRE_ID } }), 0)
})
