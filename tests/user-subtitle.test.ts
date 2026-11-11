import test from 'node:test'
import assert from 'node:assert/strict'
import { userSubtitle } from '../components/layout/top-bar/user-subtitle'

test('position wins', () => {
  assert.equal(userSubtitle({ role: 'EMPLOYEE', position: 'Designer', department: 'Creative' }), 'Designer')
})
test('blank position falls back to department, then role', () => {
  assert.equal(userSubtitle({ role: 'EMPLOYEE', position: '  ', department: 'Creative' }), 'Creative')
  assert.equal(userSubtitle({ role: 'EMPLOYEE', position: null, department: '' }), 'EMPLOYEE')
})
