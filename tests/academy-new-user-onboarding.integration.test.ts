import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { COURSE_MODULE_COUNT } from '../lib/academy/service/course'
import { createHireForUser, startOnboarding } from '../lib/academy/service/new-user-onboarding'
import type { NewUserOnboarding } from '../lib/academy/new-user-onboarding'
import { seedAcademy } from '../prisma/seed-academy'
import { cleanCourse } from './helpers/academy-course-fixtures'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

// Fictional person; the id keeps the 'act-' prefix so the shared reset removes the user.
const NEW_USER = { id: 'act-newuser', name: 'Dara Quill', email: 'act-newuser@example.test', role: 'EMPLOYEE' as const }

const onboarding: NewUserOnboarding = {
  joiningDate: new Date('2027-01-18T00:00:00.000Z'),
  attributes: {
    officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID',
    contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
  },
}

/** Auto-created hires and positions get generated ids, so they are removed by the user they belong to. */
async function removeCreatedHires(): Promise<void> {
  const hires = await prisma.newHire.findMany({ where: { email: NEW_USER.email }, select: { id: true, positionId: true } })
  await prisma.newHire.deleteMany({ where: { id: { in: hires.map((h) => h.id) } } })
  await prisma.position.deleteMany({ where: { id: { in: hires.map((h) => h.positionId) } } })
}

async function createUserWithHire(): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { ...NEW_USER, onboardingCompleted: false } })
    return createHireForUser(tx, {
      userId: NEW_USER.id, name: NEW_USER.name, email: NEW_USER.email,
      title: 'Analyst', department: 'Research', onboarding,
    })
  })
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await removeCreatedHires()
  await cleanCourse()
  await prisma.user.create({ data: { ...P.hr, onboardingCompleted: true } })
})
after(async () => {
  if (WEEKLY_DB_READY) {
    await removeCreatedHires()
    await cleanCourse()
  }
  await prisma.$disconnect()
})

test('a ticked user gets a hire record, a checklist and a released course', ACADEMY_DB_TEST, async () => {
  await seedAcademy(prisma)
  const hireId = await createUserWithHire()
  const result = await startOnboarding(prisma, hireId, P.hr.id, { title: 'Analyst', department: 'Research', onboarding })
  assert.equal(result.released, true)

  const hire = await prisma.newHire.findUniqueOrThrow({
    where: { id: hireId },
    include: { position: true, teamLeadForm: true, checklistItems: true },
  })
  assert.equal(hire.userId, NEW_USER.id)
  assert.equal(hire.status, 'ONBOARDING')
  assert.equal(hire.title, 'Analyst')
  assert.equal(hire.onboardingDate.toISOString(), '2027-01-18T00:00:00.000Z')
  assert.equal(hire.position.status, 'CLOSED')
  assert.ok(hire.academyReleasedAt)
  assert.equal(hire.academyReleasedById, P.hr.id)
  assert.ok(hire.teamLeadForm?.leadInputDueAt, 'the team lead form exists, so the checklist is made')
  assert.ok(hire.checklistItems.length > 0, 'the tracker shows a checklist')

  const user = await prisma.user.findUniqueOrThrow({ where: { id: NEW_USER.id } })
  assert.equal(user.onboardingCompleted, false)
  assert.equal(user.workMode, 'HYBRID')
  assert.equal(user.contractType, 'PK_EMPLOYMENT')

  const rows = await prisma.onboardingProgress.findMany({
    where: { userId: NEW_USER.id },
    include: { module: { select: { orderIndex: true } } },
    orderBy: { module: { orderIndex: 'asc' } },
  })
  assert.equal(rows.length, COURSE_MODULE_COUNT)
  assert.equal(rows[0].status, 'IN_PROGRESS')
  assert.ok(rows.slice(1).every((row) => row.status === 'LOCKED'))
})

test('without the course content the user still exists and the reason is reported', ACADEMY_DB_TEST, async () => {
  const hireId = await createUserWithHire()
  const result = await startOnboarding(prisma, hireId, P.hr.id, { title: 'Analyst', department: null, onboarding })
  assert.deepEqual(result, { released: false, reason: "The Academy content hasn't been loaded yet." })
  assert.ok(await prisma.user.findUnique({ where: { id: NEW_USER.id } }))
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: hireId } })
  assert.equal(hire.academyReleasedAt, null)
})

test('a linked record still missing a required field is not released, and says why', ACADEMY_DB_TEST, async () => {
  await seedAcademy(prisma)
  const hireId = await prisma.$transaction(async (tx) => {
    await tx.user.create({ data: { ...NEW_USER, onboardingCompleted: false } })
    const position = await tx.position.create({ data: { title: 'Analyst', status: 'CLOSED' }, select: { id: true } })
    const hire = await tx.newHire.create({
      data: {
        positionId: position.id, name: NEW_USER.name, title: 'Analyst', email: NEW_USER.email,
        onboardingDate: onboarding.joiningDate, userId: NEW_USER.id, status: 'ONBOARDING',
      },
      select: { id: true },
    })
    return hire.id
  })
  const result = await startOnboarding(prisma, hireId, P.hr.id, null)
  assert.equal(result.released, false)
  if (!result.released) assert.match(result.reason, /Still missing: Office location, Work mode, Contract type, Employment status/)
  const progress = await prisma.onboardingProgress.count({ where: { userId: NEW_USER.id } })
  assert.equal(progress, 0)
})
