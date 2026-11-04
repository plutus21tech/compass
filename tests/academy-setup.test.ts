import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSetupReadiness,
  leadInputDueAt,
  leadInputSchema,
  setupAccessGate,
  setupSchema,
  shouldApplyLeadInput,
  type SetupSnapshot,
} from '../lib/academy/setup'

const attributes = {
  officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID',
  contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
} as const

const fullSnapshot: SetupSnapshot = {
  preferredName: 'Cara', title: 'Analyst', department: 'Research', companyWing: 'CAPITAL', clientAccount: null,
  attributes, onboardingDate: new Date('2026-11-16'), hrCallAt: new Date('2026-11-10T09:00:00Z'),
  teamCallAt: new Date('2026-11-11T09:00:00Z'), teamLeadId: 'lead', teamMemberIds: ['m1'], buddyId: 'buddy',
  coreHoursStart: '10:00', coreHoursEnd: '18:00', userLinked: true, leadInputSubmitted: true,
}

const validSetup = {
  preferredName: 'Cara', title: 'Analyst', department: 'Research', companyWing: 'CAPITAL',
  attributes, onboardingDate: '2026-11-16', hrCallAt: '2026-11-10T09:00:00.000Z', teamCallAt: '2026-11-11T09:00:00.000Z',
  teamLeadId: 'lead', teamMemberIds: ['m1'], buddyId: 'buddy', coreHoursStart: '10:00', coreHoursEnd: '18:00',
}

test('leadInputDueAt is seven calendar days before joining', () => {
  assert.equal(leadInputDueAt(new Date('2026-11-16')).toISOString(), new Date('2026-11-09').toISOString())
})

test('a full snapshot is ready', () => {
  assert.deepEqual(getSetupReadiness(fullSnapshot), { ready: true, missing: [] })
})

test('missing fields carry human labels', () => {
  const r = getSetupReadiness({ ...fullSnapshot, buddyId: null, teamMemberIds: [] })
  assert.equal(r.ready, false)
  assert.deepEqual(r.missing, [
    { key: 'teamMemberIds', label: 'Team members' },
    { key: 'buddyId', label: 'Onboarding buddy' },
  ])
})

test('unlinked account and missing lead input are reported', () => {
  const r = getSetupReadiness({ ...fullSnapshot, userLinked: false, leadInputSubmitted: false })
  assert.deepEqual(r.missing, [
    { key: 'account', label: 'No Compass account linked' },
    { key: 'leadInput', label: 'Team lead input (role expectations, goals)' },
  ])
})

test('missing attributes are reported', () => {
  const r = getSetupReadiness({ ...fullSnapshot, attributes: { ...attributes, workMode: null } })
  assert.deepEqual(r.missing, [{ key: 'workMode', label: 'Work mode' }])
})

test('setupSchema accepts a valid setup', () => {
  assert.equal(setupSchema.safeParse(validSetup).success, true)
})

test('setupSchema rejects core hours that end before they start', () => {
  const r = setupSchema.safeParse({ ...validSetup, coreHoursStart: '18:00', coreHoursEnd: '09:00' })
  assert.equal(r.success, false)
})

test('setupSchema rejects the hire being their own buddy', () => {
  assert.equal(setupSchema.safeParse({ ...validSetup, buddyId: 'hire', hireUserId: 'hire' }).success, false)
  assert.equal(setupSchema.safeParse({ ...validSetup, buddyId: 'buddy', hireUserId: 'hire' }).success, true)
})

test('setupSchema does not pass hireUserId through', () => {
  const r = setupSchema.parse({ ...validSetup, hireUserId: 'hire' })
  assert.equal('hireUserId' in r, false)
})

const validLead = {
  roleExpectations: 'Own the weekly research note.', week1Goal: 'Shadow', month1Goal: 'Draft', month3Goal: 'Lead',
  tutorials: [{ title: 'Guide', url: 'https://example.test/guide' }],
  teamTools: [{ name: 'Tracker', purpose: 'Tasks' }],
}

test('leadInputSchema accepts valid input', () => {
  assert.equal(leadInputSchema.safeParse(validLead).success, true)
})

test('leadInputSchema rejects a non-https tutorial URL', () => {
  const r = leadInputSchema.safeParse({ ...validLead, tutorials: [{ title: 'x', url: 'javascript:alert(1)' }] })
  assert.equal(r.success, false)
})

test('setup access and lead-input gates', () => {
  assert.equal(setupAccessGate('HR'), 'allow')
  assert.equal(setupAccessGate('OA'), 'forbidden')
  assert.equal(shouldApplyLeadInput(true), true)
  assert.equal(shouldApplyLeadInput(false), false)
})
