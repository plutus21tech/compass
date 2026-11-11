import test from 'node:test'
import assert from 'node:assert/strict'
import { DEEP_LINK_UNAVAILABLE, deepLinkTarget, parseTimeOffParams } from '../lib/time-off/page-params'

const params = (query: string) => new URLSearchParams(query)

test('request=1 and request=true open the request dialog; request=0 does not', () => {
  assert.equal(parseTimeOffParams(params('request=1')).openRequest, true)
  assert.equal(parseTimeOffParams(params('request=true')).openRequest, true)
  assert.equal(parseTimeOffParams(params('request=0')).openRequest, false)
  assert.equal(parseTimeOffParams(params('')).openRequest, false)
})

test('requestId is trimmed', () => {
  assert.equal(parseTimeOffParams(params('requestId=%20abc%20')).requestId, 'abc')
  assert.equal(parseTimeOffParams(params('')).requestId, '')
})

test('approval queue wins over own list; unknown is unavailable', () => {
  assert.equal(deepLinkTarget('a', [{ id: 'a' }], [{ id: 'a' }]), 'approval')
  assert.equal(deepLinkTarget('a', [], [{ id: 'a' }]), 'own')
  assert.equal(deepLinkTarget('z', [{ id: 'a' }], [{ id: 'b' }]), 'unavailable')
  assert.match(DEEP_LINK_UNAVAILABLE, /no longer waiting for your action/)
})
