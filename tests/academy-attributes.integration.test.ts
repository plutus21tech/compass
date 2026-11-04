import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import { prisma } from '../lib/db'
import { copySetupToUser, getPersonAttributes, setPersonAttributes } from '../lib/academy/service/attributes'
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

test('copySetupToUser copies attributes and fills an existing empty joiningDate', ACADEMY_DB_TEST, async () => {
  await prisma.payrollEmployeeProfile.create({ data: { userId: P.hire.id } })
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
  assert.deepEqual(await getPersonAttributes(prisma, P.hire.id), {
    officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE', contractType: 'INDEPENDENT_CONTRACTOR', employmentStatus: 'FIXED_TERM',
  })
  const profile = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: P.hire.id } })
  assert.equal(profile.joiningDate?.toISOString(), ONBOARDING_DATE.toISOString())
})

test('copySetupToUser keeps an existing joiningDate', ACADEMY_DB_TEST, async () => {
  const existing = new Date('2026-06-01T00:00:00.000Z')
  await prisma.payrollEmployeeProfile.create({ data: { userId: P.hire.id, joiningDate: existing } })
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
  const profile = await prisma.payrollEmployeeProfile.findUniqueOrThrow({ where: { userId: P.hire.id } })
  assert.equal(profile.joiningDate?.toISOString(), existing.toISOString())
})

test('copySetupToUser never creates a payroll profile', ACADEMY_DB_TEST, async () => {
  await prisma.$transaction((tx) => copySetupToUser(tx, NEW_HIRE_ID, P.hire.id))
  assert.equal(await prisma.payrollEmployeeProfile.count({ where: { userId: P.hire.id } }), 0)
  assert.equal((await getPersonAttributes(prisma, P.hire.id)).workMode, 'REMOTE')
})
