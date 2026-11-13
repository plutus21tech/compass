import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countryOf,
  missingAttributes,
  personAttributesSchema,
  prefillFromTeamTag,
  type PersonAttributes,
} from '../lib/academy/attributes'

const full: PersonAttributes = {
  officeLocation: 'KARACHI',
  remoteCountry: null,
  workMode: 'OFFICE',
  contractType: 'PK_EMPLOYMENT',
  employmentStatus: 'PERMANENT',
}
const empty: PersonAttributes = {
  officeLocation: null,
  remoteCountry: null,
  workMode: null,
  contractType: null,
  employmentStatus: null,
}

test('countryOf maps offices and remote country', () => {
  assert.equal(countryOf({ officeLocation: 'KARACHI', remoteCountry: null }), 'PK')
  assert.equal(countryOf({ officeLocation: 'CASABLANCA', remoteCountry: null }), 'MA')
  assert.equal(countryOf({ officeLocation: 'BOGOTA', remoteCountry: null }), 'CO')
  assert.equal(countryOf({ officeLocation: 'DALLAS', remoteCountry: null }), 'US')
  assert.equal(countryOf({ officeLocation: 'REMOTE', remoteCountry: 'ID' }), 'ID')
  assert.equal(countryOf({ officeLocation: 'REMOTE', remoteCountry: null }), null)
  assert.equal(countryOf({ officeLocation: null, remoteCountry: null }), null)
})

test('missingAttributes', () => {
  assert.deepEqual(missingAttributes(full), [])
  assert.ok(missingAttributes({ ...full, officeLocation: 'REMOTE' }).includes('remoteCountry'))
  assert.deepEqual(missingAttributes(empty), [
    'officeLocation',
    'workMode',
    'contractType',
    'employmentStatus',
  ])
})

test('personAttributesSchema', () => {
  assert.equal(personAttributesSchema.safeParse({ ...full, officeLocation: 'REMOTE' }).success, false)
  assert.equal(
    personAttributesSchema.safeParse({ ...full, officeLocation: 'REMOTE', remoteCountry: 'pak' }).success,
    false,
  )
  const ok = personAttributesSchema.safeParse({ ...full, officeLocation: 'REMOTE', remoteCountry: 'ID' })
  assert.equal(ok.success, true)
  const stripped = personAttributesSchema.parse({ ...full, remoteCountry: 'ID' })
  assert.equal(stripped.remoteCountry, null)
})

test('prefillFromTeamTag locations', () => {
  assert.deepEqual(prefillFromTeamTag('PAKISTAN'), { officeLocation: 'KARACHI' })
  assert.deepEqual(prefillFromTeamTag('MOROCCO'), { officeLocation: 'CASABLANCA' })
  assert.deepEqual(prefillFromTeamTag('COLOMBIA'), { officeLocation: 'BOGOTA' })
  assert.deepEqual(prefillFromTeamTag('INDONESIA'), { officeLocation: 'REMOTE', remoteCountry: 'ID' })
  assert.deepEqual(prefillFromTeamTag('ECUADOR'), { officeLocation: 'REMOTE', remoteCountry: 'EC' })
  assert.deepEqual(prefillFromTeamTag('NOBLE'), {})
  assert.deepEqual(prefillFromTeamTag('THREE_E_PAKISTAN'), {})
  assert.deepEqual(prefillFromTeamTag('THREE_E_MOROCCO'), {})
  assert.deepEqual(prefillFromTeamTag(null), {})
})

