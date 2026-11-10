import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadSetup, saveSetup } from '../lib/academy/service/setup'
import { buildLeadDraftData, leadInputDueAt } from '../lib/academy/setup'
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

const completeLeadInput = {
  roleExpectations: 'Own the weekly research note.', week1Goal: 'Shadow', month1Goal: 'Draft', month3Goal: 'Lead',
}

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
  await prisma.teamLeadForm.update({
    where: { newHireId: NEW_HIRE_ID },
    data: { ...completeLeadInput, submittedAt: new Date() },
  })
  const done = await loadSetup(prisma, NEW_HIRE_ID)
  assert.deepEqual(done.readiness, { ready: true, missing: [] })
})

test('a form submitted before the Academy, with null lead fields, is not ready', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  await prisma.teamLeadForm.update({ where: { newHireId: NEW_HIRE_ID }, data: { submittedAt: new Date() } })
  const { setup: snapshot, readiness } = await loadSetup(prisma, NEW_HIRE_ID)
  assert.equal(snapshot.leadInputSubmitted, false)
  assert.ok(readiness.missing.some((m) => m.key === 'leadInput'))
})

test('a draft that blanks a required goal after submit is not ready', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  await prisma.teamLeadForm.update({
    where: { newHireId: NEW_HIRE_ID },
    data: { ...completeLeadInput, submittedAt: new Date() },
  })
  assert.equal((await loadSetup(prisma, NEW_HIRE_ID)).setup.leadInputSubmitted, true)
  const draft = buildLeadDraftData(true, { week1Goal: '' })
  assert.ok(draft.ok)
  if (draft.ok) await prisma.teamLeadForm.update({ where: { newHireId: NEW_HIRE_ID }, data: draft.data })
  assert.equal((await loadSetup(prisma, NEW_HIRE_ID)).setup.leadInputSubmitted, false)
})

const blanks = {
  preferredName: '', department: '', companyWing: '', clientAccount: '', hrCallAt: '', teamCallAt: '',
  teamLeadId: '', teamMemberIds: [], buddyId: '', coreHoursStart: '', coreHoursEnd: '',
  attributes: { officeLocation: null, remoteCountry: null, workMode: null, contractType: null, employmentStatus: null },
}
const blankSetup = (over: Record<string, unknown> = {}) => ({ title: 'Analyst', onboardingDate: '2026-12-01', ...blanks, ...over })

test('a mostly blank setup saves, readiness lists what is missing, and no lead is asked', ACADEMY_DB_TEST, async () => {
  const result = await saveSetup(prisma, NEW_HIRE_ID, blankSetup(), P.hr.id)
  assert.deepEqual(result, { leadRequestNeeded: false })
  const { setup: snapshot, readiness, leadInputDueAt: dueAt } = await loadSetup(prisma, NEW_HIRE_ID)
  assert.equal(snapshot.teamLeadId, null)
  assert.equal(snapshot.hrCallAt, null)
  assert.equal(snapshot.companyWing, null)
  assert.deepEqual(snapshot.teamMemberIds, [])
  assert.ok(dueAt)
  for (const key of ['preferredName', 'department', 'hrCallAt', 'teamLeadId', 'buddyId', 'workMode', 'teamMemberIds']) {
    assert.ok(readiness.missing.some((m) => m.key === key), key)
  }
})

test('blank saves can clear what an earlier save set', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  await saveSetup(prisma, NEW_HIRE_ID, blankSetup(), P.hr.id)
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, include: { teamMembers: true } })
  assert.equal(hire.teamLeadId, null)
  assert.equal(hire.buddyId, null)
  assert.equal(hire.hrCallAt, null)
  assert.equal(hire.teamMembers.length, 0)
})

test('a lead added on a later save is asked; re-saving does not ask again', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, blankSetup(), P.hr.id)
  assert.deepEqual(await saveSetup(prisma, NEW_HIRE_ID, blankSetup({ teamLeadId: P.lead.id }), P.hr.id), { leadRequestNeeded: true })
  assert.deepEqual(await saveSetup(prisma, NEW_HIRE_ID, blankSetup({ teamLeadId: P.lead.id }), P.hr.id), { leadRequestNeeded: false })
})

test('a lead already on the record is asked on the first setup save', ACADEMY_DB_TEST, async () => {
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { teamLeadId: P.lead.id } })
  assert.deepEqual(await saveSetup(prisma, NEW_HIRE_ID, blankSetup({ teamLeadId: P.lead.id }), P.hr.id), { leadRequestNeeded: true })
})

test('removing the lead asks nobody', ACADEMY_DB_TEST, async () => {
  await saveSetup(prisma, NEW_HIRE_ID, setup(), P.hr.id)
  assert.deepEqual(await saveSetup(prisma, NEW_HIRE_ID, setup({ teamLeadId: '' }), P.hr.id), { leadRequestNeeded: false })
})

test('a value that is present is still validated', ACADEMY_DB_TEST, async () => {
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, blankSetup({ buddyId: 'act-nobody' }), P.hr.id))
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, blankSetup({ coreHoursStart: '18:00', coreHoursEnd: '09:00' }), P.hr.id))
  await rejects400(saveSetup(prisma, NEW_HIRE_ID, blankSetup({ attributes: { ...blanks.attributes, officeLocation: 'REMOTE' } }), P.hr.id))
  await assertNothingWritten()
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
