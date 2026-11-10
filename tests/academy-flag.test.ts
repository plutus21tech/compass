import test from 'node:test'
import assert from 'node:assert/strict'
import { isAcademyEnabled } from '../lib/academy/flag'

test('isAcademyEnabled is true only for the string "true"', () => {
  assert.equal(isAcademyEnabled({ ONBOARDING_ACADEMY_ENABLED: 'true' }), true)
  assert.equal(isAcademyEnabled({ ONBOARDING_ACADEMY_ENABLED: 'false' }), false)
  assert.equal(isAcademyEnabled({ ONBOARDING_ACADEMY_ENABLED: '1' }), false)
  assert.equal(isAcademyEnabled({}), false)
})
