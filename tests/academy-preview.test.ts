import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PREVIEW_FACTS,
  previewConditions,
  previewRequestSchema,
} from '../lib/academy/preview'
import { mutationLimitFor, rateLimitMessage } from '../lib/academy/rate-limits'

test('preview facts default to Karachi, office, PK employment, permanent, Partners, no client account', () => {
  assert.deepEqual(DEFAULT_PREVIEW_FACTS, {
    officeLocation: 'KARACHI',
    remoteCountry: null,
    workMode: 'OFFICE',
    contractType: 'PK_EMPLOYMENT',
    employmentStatus: 'PERMANENT',
    companyWing: 'PARTNERS',
    clientAccount: false,
  })
  assert.deepEqual(previewRequestSchema.parse({ source: 'live' }).facts, DEFAULT_PREVIEW_FACTS)
})

test('a preview request needs a source and refuses anything it does not know', () => {
  assert.equal(previewRequestSchema.safeParse({}).success, false)
  assert.equal(previewRequestSchema.safeParse({ source: 'other' }).success, false)
  assert.equal(previewRequestSchema.safeParse({ source: 'draft', userId: 'act-hire' }).success, false)
  assert.equal(previewRequestSchema.safeParse({ source: 'draft', facts: { officeLocation: 'MARS' } }).success, false)
  assert.equal(previewRequestSchema.safeParse({ source: 'draft', facts: { remoteCountry: 'Indonesia' } }).success, false)
})

test('a remote preview may leave the country out, and a country only counts for remote', () => {
  const remote = previewRequestSchema.parse({ source: 'draft', facts: { officeLocation: 'REMOTE' } }).facts
  assert.equal(previewConditions(remote).attributes.remoteCountry, null)
  const office = previewRequestSchema.parse({ source: 'draft', facts: { officeLocation: 'KARACHI', remoteCountry: 'ID' } }).facts
  assert.equal(previewConditions(office).attributes.remoteCountry, null)
  const withCountry = previewRequestSchema.parse({ source: 'draft', facts: { officeLocation: 'REMOTE', remoteCountry: 'ID' } }).facts
  assert.equal(previewConditions(withCountry).attributes.remoteCountry, 'ID')
})

test('a client account is a yes or no: the preview never carries a real account name', () => {
  const facts = previewRequestSchema.parse({ source: 'live', facts: { clientAccount: true } }).facts
  assert.equal(typeof previewConditions(facts).clientAccount, 'string')
  assert.ok(previewConditions(facts).clientAccount?.trim())
  assert.equal(previewConditions(DEFAULT_PREVIEW_FACTS).clientAccount, null)
  assert.equal(previewRequestSchema.safeParse({ source: 'live', facts: { clientAccount: 'Acme' } }).success, false)
})

test('previews have their own rate-limit bucket, so trying facts never uses up HR\'s saves', () => {
  assert.deepEqual(mutationLimitFor('u1', 'preview'), { key: 'academy-preview:u1', max: 120 })
  assert.deepEqual(mutationLimitFor('u1', 'default'), { key: 'academy:u1', max: 120 })
})

test('the preview limit has its own message; other writes keep theirs', () => {
  assert.equal(rateLimitMessage('preview'), 'Too many previews in a short time. Wait a moment and try again.')
  assert.equal(rateLimitMessage('default'), 'Too many changes in a short time. Wait a few minutes and try again.')
  assert.equal(rateLimitMessage('video'), 'Too many changes in a short time. Wait a few minutes and try again.')
})
