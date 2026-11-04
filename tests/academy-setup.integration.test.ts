import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadSetup, saveSetup } from '../lib/academy/service/setup'
import { leadInputDueAt } from '../lib/academy/setup'
import { ACADEMY_DB_TEST, P, resetAcademyFixtures } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const NEW_HIRE_ID = 'act-newhire'
const ONBOARDING_DATE = new Date('2026-12-01T00:00:00.000Z')
const attributes = {
  officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID',
  contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
}
const setup = (over: Record<string, unknown> = {}) => ({
  preferredName: 'Cara', title: 'Analyst', department: 'Research', companyWing: 'CAPITAL', attributes,
  onboardingDate: '2026-12-01', hrCallAt: '2026-11-25T09:00:00.000Z', teamCallAt: '2026-11-26T09:00:00.000Z',
  teamLeadId: P.lead.id, teamMemberIds: [P.staff.id], buddyId: P.buddy.id, coreHoursStart: '10:00', coreHoursEnd: '18:00',
  ...over,
})

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetAcademyFixtures(prisma)
  for (const person of [P.hr, P.lead, P.buddy, P.staff, P.hire]) {
    await prisma.user.create({ data: { ...person, onboardingCompleted: true } })
  }
  await prisma.position.create({ data: { id: 'act-position', title: 'Analyst' } })
  await prisma.newHire.create({
    data: { id: NEW_HIRE_ID, positionId: 'act-position', name: P.hire.name, title: 'Analyst', email: P.hire.email, onboardingDate: ONBOARDING_DATE },
  })
})
after(async () => {
  if (WEEKLY_DB_READY) await resetAcademyFixtures(prisma)
  await prisma.$disconnect()
})

test('before linking: writes NewHire columns, replaces team members, sets the due date', ACADEMY_DB_TEST, async () => {
  const first = await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  assert.deepEqual(first, { leadRequestNeeded: true })
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, include: { teamLeadForm: true } })
  assert.equal(hire.preferredName, 'Cara')
  assert.equal(hire.workMode, 'HYBRID')
  assert.equal(hire.buddyId, P.buddy.id)
  assert.equal(hire.teamLeadForm?.leadInputDueAt?.toISOString(), leadInputDueAt(new Date('2026-12-01')).toISOString())

  const second = await saveSetup(prisma, NEW_HIRE_ID, setup({ teamMemberIds: [P.buddy.id, P.hr.id] }), P.hr.id)
  assert.deepEqual(second, { leadRequestNeeded: false })
  const members = await prisma.newHireTeamMember.findMany({ where: { newHireId: NEW_HIRE_ID } })
  assert.deepEqual(members.map((m) => m.userId).sort(), [P.buddy.id, P.hr.id].sort())
})

test('a changed team lead asks for lead input again', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  const changed = await saveSetup(prisma, NEW_HIRE_ID, setup({ teamLeadId: P.staff.id }), P.hr.id)
  assert.deepEqual(changed, { leadRequestNeeded: true })
})

test('after linking: attributes go to User, not NewHire', ACADEMY_DB_TEST, async () => {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: P.hire.id } })
  await saveSetup(prisma, NEW_HIRE_ID, setup({ attributes: { ...attributes, workMode: 'REMOTE' } }), P.hr.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: P.hire.id } })
  assert.equal(user.workMode, 'REMOTE')
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  assert.equal(hire.workMode, null)
  assert.equal(hire.title, 'Analyst')
})

test('invalid input writes nothing', ACADEMY_DB_TEST, async () => {
  await assert.rejects(saveSetup(prisma, NEW_HIRE_ID, setup({ buddyId: 'act-missing' }), P.hr.id), /buddy/i)
  await assert.rejects(saveSetup(prisma, NEW_HIRE_ID, setup({ coreHoursEnd: '09:00' }), P.hr.id))
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, include: { teamLeadForm: true } })
  assert.equal(hire.preferredName, null)
  assert.equal(hire.teamLeadForm, null)
})

test('the linked hire cannot be their own buddy', ACADEMY_DB_TEST, async () => {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: P.hire.id } })
  await assert.rejects(saveSetup(prisma, NEW_HIRE_ID, setup({ buddyId: P.hire.id }), P.hr.id))
})

test('loadSetup reports readiness', ACADEMY_DB_TEST, async () => {
  const before = await loadSetup(prisma, NEW_HIRE_ID)
  assert.equal(before.readiness.ready, false)
  assert.ok(before.readiness.missing.some((m) => m.key === 'account'))
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: P.hire.id } })
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  const mid = await loadSetup(prisma, NEW_HIRE_ID)
  assert.deepEqual(mid.readiness.missing.map((m) => m.key), ['leadInput'])
  await prisma.teamLeadForm.update({ where: { newHireId: NEW_HIRE_ID }, data: { submittedAt: new Date() } })
  const done = await loadSetup(prisma, NEW_HIRE_ID)
  assert.deepEqual(done.readiness, { ready: true, missing: [] })
})

const rejects400 = (p: Promise<unknown>) =>
  assert.rejects(p, (e: Error & { status?: number }) => e.name === 'AcademyError' && e.status === 400)

async function assertNothingWritten() {
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, include: { teamLeadForm: true, teamMembers: true } })
  assert.equal(hire.preferredName, null)
  assert.equal(hire.teamLeadForm, null)
  assert.equal(hire.teamMembers.length, 0)
}

test('an ineligible new team lead is rejected, nothing written', ACADEMY_DB_TEST, async () => {
  await prisma.user.update({ where: { id: P.lead.id }, data: { onboardingCompleted: false } })
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id))
  await assertNothingWritten()
})

test('an unchanged ineligible team lead still saves', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  await prisma.user.update({ where: { id: P.lead.id }, data: { onboardingCompleted: false } })
  const result = await saveSetup(prisma, NEW_HIRE_ID, setup({ title: 'Senior Analyst' }), P.hr.id)
  assert.deepEqual(result, { leadRequestNeeded: false })
})

test('an ineligible new buddy is rejected', ACADEMY_DB_TEST, async () => {
  await prisma.user.update({ where: { id: P.buddy.id }, data: { onboardingCompleted: false } })
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id))
  await assertNothingWritten()
})

test('nonexistent lead, buddy and member are rejected, nothing written', ACADEMY_DB_TEST, async () => {
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup({ teamLeadId: 'act-nobody' }), P.hr.id))
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup({ buddyId: 'act-nobody' }), P.hr.id))
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup({ teamMemberIds: ['act-nobody'] }), P.hr.id))
  await assertNothingWritten()
})

test('the linked hire on their own team list is rejected', ACADEMY_DB_TEST, async () => {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: P.hire.id } })
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, setup({ teamMemberIds: [P.hire.id] }), P.hr.id))
})
