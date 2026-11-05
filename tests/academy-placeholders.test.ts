import test from 'node:test'
import assert from 'node:assert/strict'
import { PLACEHOLDER_KEYS, findUnknownPlaceholders, renderPlaceholders } from '../lib/academy/placeholders'

test('renderPlaceholders fills known keys and blanks unknown ones', () => {
  assert.equal(renderPlaceholders('Hi {preferred name}, {nonsense}.', { 'preferred name': 'Cara' }), 'Hi Cara, .')
})

test('renderPlaceholders renders an empty-valued key as empty', () => {
  assert.equal(renderPlaceholders('Call {lead first name}!', { 'lead first name': '' }), 'Call !')
})

test('renderPlaceholders leaves text without placeholders alone', () => {
  assert.equal(renderPlaceholders('No braces here', {}), 'No braces here')
})

test('findUnknownPlaceholders lists only unknown names, once each', () => {
  assert.deepEqual(findUnknownPlaceholders('{title} {nonsense} {nonsense}'), ['nonsense'])
  assert.deepEqual(findUnknownPlaceholders('{title} {core hours}'), [])
})

test('PLACEHOLDER_KEYS has the 14 agreed keys', () => {
  assert.equal(PLACEHOLDER_KEYS.length, 14)
  assert.ok(!(PLACEHOLDER_KEYS as readonly string[]).includes('bank name'))
  assert.ok(PLACEHOLDER_KEYS.includes('month 3 goal'))
})
