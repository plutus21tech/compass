import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import { prisma } from '../lib/db'
import { mergeAttributePatch } from '../lib/academy/profile-input'
import { copySetupToUser, finishNewHireLink, getPersonAttributes, setPersonAttributes } from '../lib/academy/service/attributes'
import { ACADEMY_DB_TEST, P, resetAcademyFixtures } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const NEW_HIRE_ID = 'act-newhire'
const ONBOARDING_DATE = new Date('2026-12-01T00:00:00.000Z')

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetAcademyFixtures(prisma)
  for (const person of [P.hr, P.hire]) await prisma.user.create({ data: { ...person, onboardingCompleted: true } })
  await prisma.position.create({ data: { id: 'act-position', title: 'Analyst' } })
  await prisma.newHire.create({
    data: {
      id: NEW_HIRE_ID, positionId: 'act-position', name: P.hire.name, title: 'Analyst', email: P.hire.email,
      onboardingDate: ONBOARDING_DATE, officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE',
      contractType: 'INDEPENDENT_CONTRACTOR', employmentStatus: 'FIXED_TERM',
    },
  })
})
after(async () => {
  if (WEEKLY_DB_READY) await resetAcademyFixtures(prisma)
  await prisma.$disconnect()
})

test('setPersonAttributes saves valid input and reads it back', ACADEMY_DB_TEST, async () => {
  const saved = await setPersonAttributes(prisma, P.hr.id, {
    officeLocation: 'KARACHI', workMode: 'HYBRID', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
  })
  assert.deepEqual(saved, {
    officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
  })
  assert.deepEqual(await getPersonAttributes(prisma, P.hr.id), saved)
})

test('setPersonAttributes throws a ZodError for REMOTE without a country, and saves nothing', ACADEMY_DB_TEST, async () => {
  await assert.rejects(
    setPersonAttributes(prisma, P.hr.id, { officeLocation: 'REMOTE', workMode: 'REMOTE', contractType: null, employmentStatus: null }),
    (error: unknown) => error instanceof ZodError,
  )
  assert.equal((await getPersonAttributes(prisma, P.hr.id)).officeLocation, null)
})

test('copySetupToUser copies attributes and leaves payroll alone', ACADEMY_DB_TEST, async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: P.hire.id } })
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
  assert.deepEqual(await getPersonAttributes(prisma, P.hire.id), {
    officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE', contractType: 'INDEPENDENT_CONTRACTOR', employmentStatus: 'FIXED_TERM',
  })
  const profile = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: P.hire.id } })
  assert.equal(profile.joiningDate, null)
})

// The real order: the account is created and linked first, the payroll write comes after.
async function linkHire(contractType: 'PK_EMPLOYMENT' | 'INDEPENDENT_CONTRACTOR' | 'OTHER_EMPLOYMENT') {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: P.hire.id, contractType } })
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
}
const createProfile = (joiningDate: Date | null = null) => async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: P.hire.id, joiningDate } })
}
const finish = (writePayrollProfile: (() => Promise<void>) | null) =>
  finishNewHireLink(prisma, { newHireId: NEW_HIRE_ID, userId: P.hire.id, writePayrollProfile })
const profileOf = () => prisma.payrollEmployeeProfile.findUnique({ where: { userId: P.hire.id } })

test('Pakistan employee: a profile written after the link gets the joining date', ACADEMY_DB_TEST, async () => {
  await linkHire('PK_EMPLOYMENT')
  assert.equal(await profileOf(), null)
  await finish(createProfile())
  assert.equal((await profileOf())?.joiningDate?.toISOString(), ONBOARDING_DATE.toISOString())
})

test('Pakistan employee: a joining date HR entered is kept', ACADEMY_DB_TEST, async () => {
  const entered = new Date('2026-06-01T00:00:00.000Z')
  await linkHire('PK_EMPLOYMENT')
  await finish(createProfile(entered))
  assert.equal((await profileOf())?.joiningDate?.toISOString(), entered.toISOString())
})

test('Pakistan employee with no payroll write: no profile is created', ACADEMY_DB_TEST, async () => {
  await linkHire('PK_EMPLOYMENT')
  await finish(null)
  assert.equal(await profileOf(), null)
})

test('contractor: the payroll write is skipped, so no profile exists', ACADEMY_DB_TEST, async () => {
  await linkHire('INDEPENDENT_CONTRACTOR')
  await finish(createProfile())
  assert.equal(await profileOf(), null)
})

test('other employment: the profile is written but the joining date stays empty', ACADEMY_DB_TEST, async () => {
  await linkHire('OTHER_EMPLOYMENT')
  await finish(createProfile())
  assert.equal((await profileOf())?.joiningDate, null)
})

test('copySetupToUser never creates a payroll profile', ACADEMY_DB_TEST, async () => {
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: P.hire.id } }), 0)
  assert.equal((await getPersonAttributes(prisma, P.hire.id)).workMode, 'REMOTE')
})

test('a partial patch merged over stored attributes keeps the rest; an invalid merge saves nothing', ACADEMY_DB_TEST, async () => {
  await setPersonAttributes(prisma, P.hr.id, { officeLocation: 'KARACHI', workMode: 'OFFICE', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT' })
  const current = await getPersonAttributes(prisma, P.hr.id)
  const saved = await setPersonAttributes(prisma, P.hr.id, mergeAttributePatch(current, { workMode: 'HYBRID' }))
  assert.deepEqual(saved, { ...current, workMode: 'HYBRID' })
  await assert.rejects(
    setPersonAttributes(prisma, P.hr.id, mergeAttributePatch(saved, { officeLocation: 'REMOTE' })),
    (error: unknown) => error instanceof ZodError,
  )
  assert.deepEqual(await getPersonAttributes(prisma, P.hr.id), saved)
})
