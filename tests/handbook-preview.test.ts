import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePreviewTeam } from '../lib/handbook/preview'
import { ALL_TEAMS } from './helpers/team-catalog'

const hr = { role: 'HR', teamTag: 'PAKISTAN' as const }
const employee = { role: 'EMPLOYEE', teamTag: 'PAKISTAN' as const }
const untaggedHr = { role: 'HR', teamTag: null }

test('no override resolves to the user own tag', () => {
  assert.equal(resolvePreviewTeam(null, hr, ALL_TEAMS), 'PAKISTAN')
  assert.equal(resolvePreviewTeam(null, employee, ALL_TEAMS), 'PAKISTAN')
  assert.equal(resolvePreviewTeam(null, untaggedHr, ALL_TEAMS), null)
})

test('HR may preview any team', () => {
  assert.equal(resolvePreviewTeam('MOROCCO', hr, ALL_TEAMS), 'MOROCCO')
  assert.equal(resolvePreviewTeam('THREE_E_MOROCCO', hr, ALL_TEAMS), 'THREE_E_MOROCCO')
  assert.equal(resolvePreviewTeam('NOBLE', hr, ALL_TEAMS), 'NOBLE')
})

test('HR may preview the untagged view', () => {
  assert.equal(resolvePreviewTeam('UNTAGGED', hr, ALL_TEAMS), null)
})

// The whole point of the feature's privilege boundary.
test('PRIVILEGE: a non-HR user cannot preview another team', () => {
  for (const role of ['EMPLOYEE', 'SECURITY', 'OA', 'EXECUTION']) {
    const user = { role, teamTag: 'PAKISTAN' as const }
    assert.equal(
      resolvePreviewTeam('MOROCCO', user, ALL_TEAMS),
      'PAKISTAN',
      `${role} must fall back to their own tag, not MOROCCO`
    )
    assert.equal(
      resolvePreviewTeam('UNTAGGED', user, ALL_TEAMS),
      'PAKISTAN',
      `${role} must not be able to force the untagged view`
    )
  }
})

test('PRIVILEGE: the override cannot widen an untagged non-HR user', () => {
  const user = { role: 'EMPLOYEE', teamTag: null }
  assert.equal(resolvePreviewTeam('PAKISTAN', user, ALL_TEAMS), null)
})

test('an unrecognised team falls back to the user own tag', () => {
  assert.equal(resolvePreviewTeam('ATLANTIS', hr, ALL_TEAMS), 'PAKISTAN')
  assert.equal(resolvePreviewTeam('', hr, ALL_TEAMS), 'PAKISTAN')
  assert.equal(resolvePreviewTeam('pakistan', hr, ALL_TEAMS), 'PAKISTAN') // case-sensitive by design
})
