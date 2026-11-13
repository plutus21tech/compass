import test from 'node:test'
import assert from 'node:assert/strict'
import { hireTitleFor, parseNewUserOnboarding } from '../lib/academy/new-user-onboarding'

const valid = {
  joiningDate: '2027-01-18',
  officeLocation: 'KARACHI',
  workMode: 'HYBRID',
  contractType: 'PK_EMPLOYMENT',
  employmentStatus: 'PERMANENT',
}

test('a joining date and the four attributes are enough', () => {
  const r = parseNewUserOnboarding(valid)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.data.joiningDate.toISOString(), '2027-01-18T00:00:00.000Z')
  assert.deepEqual(r.data.attributes, {
    officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID',
    contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
  })
})

test('a remote hire needs a country, which is kept', () => {
  const missing = parseNewUserOnboarding({ ...valid, officeLocation: 'REMOTE' })
  assert.deepEqual(missing, { ok: false, error: 'To start onboarding, fill in: Remote country.' })
  const r = parseNewUserOnboarding({ ...valid, officeLocation: 'REMOTE', remoteCountry: 'EC' })
  assert.equal(r.ok && r.data.attributes.remoteCountry, 'EC')
})

test('missing fields are named together, in form order', () => {
  const r = parseNewUserOnboarding({ officeLocation: 'KARACHI' })
  assert.deepEqual(r, {
    ok: false,
    error: 'To start onboarding, fill in: Joining date, Work mode, Contract type, Employment status.',
  })
})

test('a joining date that is not a date is refused', () => {
  assert.deepEqual(parseNewUserOnboarding({ ...valid, joiningDate: 'next week' }), {
    ok: false,
    error: 'The joining date is not a valid date.',
  })
})

test('an unknown attribute value is refused', () => {
  const r = parseNewUserOnboarding({ ...valid, workMode: 'MOON' })
  assert.equal(r.ok, false)
})

test('the hire title falls back when the user has no position', () => {
  assert.equal(hireTitleFor('  Analyst '), 'Analyst')
  assert.equal(hireTitleFor(''), 'New hire')
  assert.equal(hireTitleFor(null), 'New hire')
})
