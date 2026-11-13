import test from 'node:test'
import assert from 'node:assert/strict'
import { panelModeKey, panelSwitchAction } from '@/lib/time-off/panel-switch'

test('panelModeKey names create and each edited request', () => {
  assert.equal(panelModeKey({ kind: 'create' }), 'create')
  assert.equal(panelModeKey({ kind: 'edit', request: { id: 'r1' } }), 'edit:r1')
})

test('a closed panel opens straight away', () => {
  assert.equal(panelSwitchAction({ open: false, modeKey: 'create', dirty: true }, 'edit:r1'), 'open')
})

test('asking for the mode already open keeps the form', () => {
  assert.equal(panelSwitchAction({ open: true, modeKey: 'create', dirty: true }, 'create'), 'keep')
  assert.equal(panelSwitchAction({ open: true, modeKey: 'edit:r1', dirty: false }, 'edit:r1'), 'keep')
})

test('switching away from an untouched form switches at once', () => {
  assert.equal(panelSwitchAction({ open: true, modeKey: 'create', dirty: false }, 'edit:r1'), 'open')
  assert.equal(panelSwitchAction({ open: true, modeKey: 'edit:r1', dirty: false }, 'edit:r2'), 'open')
})

test('switching away from a filled form asks first', () => {
  assert.equal(panelSwitchAction({ open: true, modeKey: 'create', dirty: true }, 'edit:r1'), 'confirm')
  assert.equal(panelSwitchAction({ open: true, modeKey: 'edit:r1', dirty: true }, 'create'), 'confirm')
  assert.equal(panelSwitchAction({ open: true, modeKey: 'edit:r1', dirty: true }, 'edit:r2'), 'confirm')
})
