import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getSetupReadiness,
  leadInputDueAt,
  leadInputSchema,
  setupAccessGate,
  setupSchema,
  shouldApplyLeadInput,
  buildLeadSubmitData,
  isLeadInputSubmitted,
  withoutSetupOwnedFields,
  type SetupSnapshot,
} from '../lib/academy/setup'
import { describeSetupIssues } from '../lib/academy/labels'
import { z } from 'zod'

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

import { buildLeadDraftData } from '../lib/academy/setup'

const setupWithBlanks = {
  title: 'Analyst', onboardingDate: '2026-11-16',
  preferredName: '', department: '', companyWing: '', clientAccount: '', hrCallAt: '', teamCallAt: '',
  teamLeadId: '', teamMemberIds: [], buddyId: '', coreHoursStart: '', coreHoursEnd: '',
  attributes: { officeLocation: null, remoteCountry: null, workMode: null, contractType: null, employmentStatus: null },
}

test('setupSchema accepts blanks and turns them into null', () => {
  const r = setupSchema.parse(setupWithBlanks)
  assert.equal(r.preferredName, null)
  assert.equal(r.hrCallAt, null)
  assert.equal(r.companyWing, null)
  assert.equal(r.teamLeadId, null)
  assert.equal(r.buddyId, null)
  assert.equal(r.coreHoursStart, null)
  assert.deepEqual(r.teamMemberIds, [])
})

test('setupSchema accepts absent keys and a blank attribute set', () => {
  for (const attributes of [undefined, null, {}, { officeLocation: '', workMode: '' }]) {
    const r = setupSchema.safeParse({ title: 'Analyst', onboardingDate: '2026-11-16', attributes })
    assert.equal(r.success, true, JSON.stringify(attributes))
    if (r.success) assert.equal(r.data.attributes.officeLocation, null)
  }
})

test('setupSchema still requires title and joining date', () => {
  for (const over of [{ title: '' }, { title: '   ' }, { onboardingDate: '' }, { onboardingDate: null }, { title: undefined }]) {
    assert.equal(setupSchema.safeParse({ ...setupWithBlanks, ...over }).success, false, JSON.stringify(over))
  }
})

test('setupSchema validates values that are present', () => {
  const bad = [
    { hrCallAt: 'not a date' }, { coreHoursStart: '25:00' }, { companyWing: 'NOPE' },
    { coreHoursStart: '18:00', coreHoursEnd: '09:00' },
    { attributes: { ...setupWithBlanks.attributes, workMode: 'NOPE' } },
    { attributes: { ...setupWithBlanks.attributes, officeLocation: 'REMOTE' } },
    { buddyId: 'hire', hireUserId: 'hire' },
  ]
  for (const over of bad) assert.equal(setupSchema.safeParse({ ...setupWithBlanks, ...over }).success, false, JSON.stringify(over))
})

test('setupSchema allows one half of the core hours pair for now', () => {
  assert.equal(setupSchema.safeParse({ ...setupWithBlanks, coreHoursStart: '09:00' }).success, true)
})

const humanError = (input: unknown) => {
  const r = setupSchema.safeParse(input)
  assert.equal(r.success, false)
  return r.success ? '' : describeSetupIssues(r.error)
}

test('setup errors use readiness labels and clear sentences', () => {
  assert.equal(humanError({ ...setupWithBlanks, title: '' }), 'Job title is required.')
  assert.equal(humanError({ ...setupWithBlanks, onboardingDate: '' }), 'Joining date is required.')
  assert.equal(humanError({ ...setupWithBlanks, hrCallAt: 'nope' }), 'HR call must be a date and time.')
  assert.equal(humanError({ ...setupWithBlanks, coreHoursStart: '25:00' }), 'Core hours start must be a time like 09:30.')
  assert.equal(humanError({ ...setupWithBlanks, coreHoursStart: '18:00', coreHoursEnd: '09:00' }), 'Core hours must end after they start.')
  assert.equal(
    humanError({ ...setupWithBlanks, attributes: { ...setupWithBlanks.attributes, officeLocation: 'REMOTE' } }),
    'Remote country is required when the office location is Remote.',
  )
  assert.equal(
    humanError({ ...setupWithBlanks, attributes: { ...setupWithBlanks.attributes, officeLocation: 'REMOTE', remoteCountry: 'id' } }),
    'Remote country must be a two-letter code, like ID.',
  )
  assert.equal(humanError({ ...setupWithBlanks, companyWing: 'NOPE' }), 'Company wing is not valid.')
  assert.equal(humanError({ ...setupWithBlanks, title: '', onboardingDate: '' }), 'Job title is required. Joining date is required.')
})

test('an unknown field never shows its raw key', () => {
  const r = z.object({ somethingInternal: z.string() }).safeParse({})
  assert.equal(r.success, false)
  if (!r.success) assert.equal(describeSetupIssues(r.error).includes('somethingInternal'), false)
})

const storedLead = { ...validLead, day1Goal: null, submittedAt: new Date('2026-11-01') }

test('isLeadInputSubmitted needs submittedAt and a row that passes the schema', () => {
  assert.equal(isLeadInputSubmitted(storedLead), true)
  assert.equal(isLeadInputSubmitted({ ...storedLead, submittedAt: null }), false)
  assert.equal(isLeadInputSubmitted(null), false)
  assert.equal(isLeadInputSubmitted(undefined), false)
  assert.equal(isLeadInputSubmitted({ ...storedLead, week1Goal: null }), false)
  assert.equal(isLeadInputSubmitted({ ...storedLead, month3Goal: '  ' }), false)
  assert.equal(isLeadInputSubmitted({ ...storedLead, tutorials: [{ title: 'x', url: 'http://a.test' }] }), false)
  assert.equal(
    isLeadInputSubmitted({ submittedAt: '2026-11-01T00:00:00.000Z', roleExpectations: null, week1Goal: null, month1Goal: null, month3Goal: null, tutorials: null, teamTools: null }),
    false,
  )
})

test('lead submit: a blank key is blank, an absent key falls back to stored', () => {
  const blank = buildLeadSubmitData(storedLead, { week1Goal: '  ' })
  assert.equal(blank.ok, false)
  if (!blank.ok) assert.equal(blank.error, 'Week 1 goal is required.')

  const fallback = buildLeadSubmitData(storedLead, { month1Goal: 'New draft' })
  assert.ok(fallback.ok)
  if (fallback.ok) {
    assert.equal(fallback.data.month1Goal, 'New draft')
    assert.equal(fallback.data.week1Goal, 'Shadow')
  }
})

test('lead submit: Day 1 goal can be cleared', () => {
  const r = buildLeadSubmitData({ ...storedLead, day1Goal: 'Meet the team' }, { day1Goal: '' })
  assert.ok(r.ok)
  if (r.ok) assert.equal(r.data.day1Goal, null)
})

test('lead submit errors are readable for lists too', () => {
  const r = buildLeadSubmitData(storedLead, { tutorials: [{ title: 'Guide', url: 'http://a.test' }, { url: 'https://a.test' }] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'Tutorial 1 link must be an https link. Tutorial 2 title is required.')
  const tools = buildLeadSubmitData(storedLead, { teamTools: [{ name: 'Tracker' }] })
  assert.equal(tools.ok, false)
  if (!tools.ok) assert.equal(tools.error, 'Team tool 1 purpose is required.')
})

test('lead draft errors are readable', () => {
  const r = buildLeadDraftData(true, { tutorials: [{ title: 'x', url: 'http://a.test' }] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error, 'Tutorial 1 link must be an https link.')
})

test('the top form never sends the fields the setup section owns', () => {
  const sent = withoutSetupOwnedFields({
    name: 'Cara', title: 'Analyst', company: 'Acme', department: 'Research', teamLeadId: 'l', buddyId: 'b',
    email: 'c@example.test', onboardingDate: '2026-11-16', status: 'PENDING',
  })
  assert.deepEqual(sent, { name: 'Cara', company: 'Acme', email: 'c@example.test', status: 'PENDING' })
})

test('setupSchema rejects the hire on their own team list', () => {
  assert.equal(setupSchema.safeParse({ ...validSetup, teamMemberIds: ['m1', 'hire'], hireUserId: 'hire' }).success, false)
})

test('lead draft: absent key preserved, blank key cleared, flag off gives nothing', () => {
  const r = buildLeadDraftData(true, { week1Goal: 'Shadow', month1Goal: '  ', tutorials: [] })
  assert.ok(r.ok)
  if (r.ok) {
    assert.equal(r.data.week1Goal, 'Shadow')
    assert.equal(r.data.month1Goal, null)
    assert.deepEqual(r.data.tutorials, [])
    assert.equal('roleExpectations' in r.data, false)
    assert.equal('month3Goal' in r.data, false)
    assert.equal('teamTools' in r.data, false)
  }
  assert.deepEqual(buildLeadDraftData(false, { week1Goal: 'x' }), { ok: true, data: {} })
  assert.equal(buildLeadDraftData(true, { tutorials: [{ title: 'x', url: 'http://a.test' }] }).ok, false)
})
