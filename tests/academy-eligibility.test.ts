import test from 'node:test'
import assert from 'node:assert/strict'
import type { PersonAttributes } from '../lib/academy/attributes'
import { isCardEligible, type EligibilityRules } from '../lib/academy/eligibility'

const none: EligibilityRules = { countries: [], workModes: [], contractTypes: [], employmentStatuses: [] }
const person: PersonAttributes = {
  officeLocation: 'KARACHI',
  remoteCountry: null,
  workMode: 'OFFICE',
  contractType: 'PK_EMPLOYMENT',
  employmentStatus: 'PERMANENT',
}
const blank: PersonAttributes = {
  officeLocation: null,
  remoteCountry: null,
  workMode: null,
  contractType: null,
  employmentStatus: null,
}

test('empty rules are eligible for anyone', () => {
  assert.equal(isCardEligible(none, blank), true)
  assert.equal(isCardEligible(none, person), true)
})

test('country and work mode rules', () => {
  const r: EligibilityRules = { ...none, countries: ['PK'], workModes: ['OFFICE', 'HYBRID'] }
  assert.equal(isCardEligible(r, person), true)
  assert.equal(isCardEligible(r, { ...person, workMode: 'REMOTE' }), false)
  assert.equal(isCardEligible(r, { ...person, officeLocation: 'CASABLANCA' }), false)
})

test('employment status rule', () => {
  const r: EligibilityRules = { ...none, employmentStatuses: ['PERMANENT'] }
  assert.equal(isCardEligible(r, { ...person, employmentStatus: 'INTERN' }), false)
})

test('contract type rule', () => {
  const r: EligibilityRules = { ...none, contractTypes: ['INDEPENDENT_CONTRACTOR'] }
  assert.equal(isCardEligible(r, person), false)
})

test('non-empty rule is not eligible when attribute missing', () => {
  assert.equal(isCardEligible({ ...none, countries: ['PK'] }, blank), false)
  assert.equal(isCardEligible({ ...none, workModes: ['OFFICE'] }, { ...person, workMode: null }), false)
  assert.equal(
    isCardEligible({ ...none, contractTypes: ['PK_EMPLOYMENT'] }, { ...person, contractType: null }),
    false,
  )
  assert.equal(
    isCardEligible({ ...none, employmentStatuses: ['PERMANENT'] }, { ...person, employmentStatus: null }),
    false,
  )
  const remoteNoCountry: PersonAttributes = { ...person, officeLocation: 'REMOTE', remoteCountry: null }
  assert.equal(isCardEligible({ ...none, workModes: ['OFFICE'] }, remoteNoCountry), false)
  assert.equal(isCardEligible({ ...none, countries: ['ID'] }, remoteNoCountry), false)
})
