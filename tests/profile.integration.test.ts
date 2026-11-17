import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadPersonProfile, saveProfileDetails } from '../lib/people/profile'
import { loadProfileCompensation } from '../lib/people/profile-compensation'
import { WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

/** Fictional people only. */
const PEOPLE = [
  { id: 'prf-ana', name: 'Asta Novak', position: 'Analyst', department: 'Product', role: 'EMPLOYEE' },
  { id: 'prf-ben', name: 'Bram Olsen', position: 'Designer', department: 'Design', role: 'EMPLOYEE' },
  { id: 'prf-3e', name: 'Cleo Ibarra', position: 'Agent', department: ' 3E ', role: 'EMPLOYEE' },
  { id: 'prf-gone', name: 'Dov Marek', position: 'Analyst', department: 'Product', role: 'EMPLOYEE' },
  { id: 'prf-hr', name: 'Edda Quist', position: 'HR Executive', department: 'Human Resources', role: 'HR' },
] as const

const NOW = new Date('2026-11-17T10:00:00Z')
const day = (key: string) => new Date(`${key}T00:00:00Z`)
const viewer = (id: (typeof PEOPLE)[number]['id']) => {
  const person = PEOPLE.find((p) => p.id === id)!
  return { id: person.id, role: person.role, department: person.department }
}

async function cleanUp() {
  const ours = { startsWith: 'prf-' }
  await prisma.payrollReceipt.deleteMany({ where: { periodId: ours } })
  await prisma.payrollPeriod.deleteMany({ where: { id: ours } })
  await prisma.project.deleteMany({ where: { id: ours } })
  await prisma.leaveRequest.deleteMany({ where: { employeeId: ours } })
  await prisma.payrollEmployeeProfile.deleteMany({ where: { userId: ours } })
  await prisma.user.deleteMany({ where: { id: ours } })
}

async function addLeave(id: string, start: string, end: string, status: 'APPROVED' | 'PENDING') {
  await prisma.leaveRequest.create({
    data: {
      id,
      employeeId: 'prf-ana',
      leaveType: 'CASUAL',
      startDate: day(start),
      endDate: day(end),
      reason: 'Test leave',
      transitionPlan: '',
      status,
    },
  })
}

async function addReceipt(periodId: string, start: string, periodStatus: 'LOCKED' | 'DRAFT', basicSalary: number) {
  await prisma.payrollPeriod.create({
    data: { id: periodId, label: periodId, periodStart: day(start), periodEnd: day(start), status: periodStatus, currency: 'PKR' },
  })
  await prisma.payrollReceipt.create({
    data: { periodId, userId: 'prf-ana', payrollName: 'Asta Novak', status: 'SENT', receiptJson: { earnings: { basicSalary } } },
  })
}

before(async () => {
  if (!WEEKLY_DB_READY) return
  await cleanUp()
  for (const person of PEOPLE) {
    await prisma.user.create({
      data: { ...person, email: `${person.id}@example.test`, discordUsername: `${person.id}#0001`, onboardingCompleted: true },
    })
  }
  await prisma.payrollEmployeeProfile.create({ data: { userId: 'prf-gone', isPayrollActive: false } })
  await addLeave('prf-l-past', '2026-11-02', '2026-11-03', 'APPROVED')
  await addLeave('prf-l-now', '2026-11-16', '2026-11-18', 'APPROVED')
  await addLeave('prf-l-next', '2026-12-01', '2026-12-02', 'APPROVED')
  await addLeave('prf-l-wait', '2026-12-10', '2026-12-11', 'PENDING')
  await prisma.project.create({ data: { id: 'prf-p-own', name: 'Prf Atlas', ownerId: 'prf-ana', status: 'ACTIVE' } })
  await prisma.project.create({
    data: { id: 'prf-p-mem', name: 'Prf Beacon', ownerId: 'prf-ben', status: 'ACTIVE', members: { create: { userId: 'prf-ana', role: 'LEAD' } } },
  })
  await prisma.project.create({ data: { id: 'prf-p-done', name: 'Prf Closed', ownerId: 'prf-ana', status: 'COMPLETED' } })
  await addReceipt('prf-pay-1', '2026-08-01', 'LOCKED', 100000)
  await addReceipt('prf-pay-2', '2026-09-01', 'LOCKED', 100000)
  await addReceipt('prf-pay-3', '2026-10-01', 'LOCKED', 120000)
  await addReceipt('prf-pay-draft', '2026-11-01', 'DRAFT', 999999)
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanUp()
  await prisma.$disconnect()
})

test('a colleague sees basics, current and coming leave, and active projects', WEEKLY_DB_TEST, async () => {
  const profile = await loadPersonProfile(viewer('prf-ben'), 'prf-ana', prisma, NOW)
  assert.ok(profile)
  assert.deepEqual(
    [profile.name, profile.position, profile.department, profile.email, profile.discordUsername],
    ['Asta Novak', 'Analyst', 'Product', 'prf-ana@example.test', 'prf-ana#0001']
  )
  assert.deepEqual(profile.leave.map((l) => [l.id, l.ongoing]), [['prf-l-now', true], ['prf-l-next', false]])
  assert.deepEqual(profile.projects, [
    { id: 'prf-p-own', name: 'Prf Atlas', role: 'OWNER' },
    { id: 'prf-p-mem', name: 'Prf Beacon', role: 'LEAD' },
  ])
  assert.equal(profile.isSelf, false)
  assert.equal(profile.canSeeCompensation, false)
  assert.equal(JSON.stringify(profile).includes('100000'), false)
})

test('3E and Plutus21 staff cannot open each other; HR can open both', WEEKLY_DB_TEST, async () => {
  assert.equal(await loadPersonProfile(viewer('prf-ben'), 'prf-3e', prisma, NOW), null)
  assert.equal(await loadPersonProfile(viewer('prf-3e'), 'prf-ana', prisma, NOW), null)
  const asHr = await loadPersonProfile(viewer('prf-hr'), 'prf-3e', prisma, NOW)
  assert.equal(asHr?.name, 'Cleo Ibarra')
  assert.equal(asHr?.canSeeCompensation, true)
})

test('someone who has left, or an unknown id, is not found; your own profile always is', WEEKLY_DB_TEST, async () => {
  assert.equal(await loadPersonProfile(viewer('prf-ben'), 'prf-gone', prisma, NOW), null)
  assert.equal(await loadPersonProfile(viewer('prf-ben'), 'prf-nobody', prisma, NOW), null)
  const self = await loadPersonProfile(viewer('prf-gone'), 'prf-gone', prisma, NOW)
  assert.equal(self?.isSelf, true)
})

test('about-me answers save and show, and saving again replaces them', WEEKLY_DB_TEST, async () => {
  await saveProfileDetails('prf-ben', { bio: 'Draws things.', hobbies: 'Chess', funFact: null, askMeAbout: null })
  const saved = await saveProfileDetails('prf-ben', { bio: 'Draws things.', hobbies: null, funFact: 'Left-handed', askMeAbout: null })
  assert.deepEqual(saved, { bio: 'Draws things.', hobbies: null, funFact: 'Left-handed', askMeAbout: null })
  const profile = await loadPersonProfile(viewer('prf-ana'), 'prf-ben', prisma, NOW)
  assert.deepEqual(profile?.details, saved)
})

test('pay history comes from finalized payroll only, as step changes', WEEKLY_DB_TEST, async () => {
  const pay = await loadProfileCompensation('prf-ana')
  assert.equal(pay.currency, 'PKR')
  assert.equal(pay.currentBasic, 120000)
  assert.equal(pay.changeEvents.length, 1)
  assert.equal(pay.changeEvents[0].previousAmount, 100000)
  assert.equal(pay.history.some((point) => point.amount === 999999), false)
  assert.deepEqual((await loadProfileCompensation('prf-ben')).history, [])
})
