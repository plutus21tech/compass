import test from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  OFFICE_LOCATIONS,
  WORK_MODES,
  personAttributesSchema,
  type PersonAttributes,
} from '../lib/academy/attributes'
import { attributeValueLabel } from '../lib/academy/labels'
import {
  ATTRIBUTE_KEYS,
  adminAttributeGate,
  applyPrefill,
  contactFieldError,
  formatZodIssues,
  selfAttributeGate,
  hasAttributeKeys,
  mergeAttributePatch,
  selfContactExtrasShape,
} from '../lib/academy/profile-input'
import { z } from 'zod'

const current: PersonAttributes = {
  officeLocation: 'KARACHI', remoteCountry: null, workMode: 'OFFICE', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
}

test('ATTRIBUTE_KEYS are the five PersonAttributes keys', () => {
  assert.deepEqual([...ATTRIBUTE_KEYS].sort(), ['contractType', 'employmentStatus', 'officeLocation', 'remoteCountry', 'workMode'])
})

test('hasAttributeKeys detects any attribute key and ignores the rest', () => {
  assert.equal(hasAttributeKeys({ name: 'x', workMode: 'OFFICE' }), true)
  assert.equal(hasAttributeKeys({ remoteCountry: null }), true)
  assert.equal(hasAttributeKeys({ name: 'x', discordUsername: 'a' }), false)
  assert.equal(hasAttributeKeys(null), false)
  assert.equal(hasAttributeKeys('text'), false)
})

test('mergeAttributePatch overlays only the keys sent, without mutating', () => {
  const merged = mergeAttributePatch(current, { workMode: 'HYBRID', name: 'ignored' })
  assert.deepEqual(merged, { ...current, workMode: 'HYBRID' })
  assert.equal(current.workMode, 'OFFICE')
})

test('a merged patch that makes REMOTE without a country fails validation; with a country it passes', () => {
  assert.throws(() => personAttributesSchema.parse(mergeAttributePatch(current, { officeLocation: 'REMOTE' })), ZodError)
  const ok = personAttributesSchema.parse(mergeAttributePatch(current, { officeLocation: 'REMOTE', remoteCountry: 'ID' }))
  assert.equal(ok.remoteCountry, 'ID')
})

const extras = z.object(selfContactExtrasShape).strict()

test('linkedinUrl must be an https linkedin.com address; empty clears', () => {
  assert.equal(extras.parse({ linkedinUrl: 'https://www.linkedin.com/in/ana-torvik' }).linkedinUrl, 'https://www.linkedin.com/in/ana-torvik')
  assert.equal(extras.parse({ linkedinUrl: 'https://linkedin.com/in/ana' }).linkedinUrl, 'https://linkedin.com/in/ana')
  assert.equal(extras.parse({ linkedinUrl: '' }).linkedinUrl, null)
  for (const bad of ['http://linkedin.com/in/a', 'https://evil.com/linkedin.com/in/a', 'https://linkedin.com.evil.com/in/a', 'https://notlinkedin.com/in/a', 'linkedin.com/in/a', 'javascript:alert(1)']) {
    assert.throws(() => extras.parse({ linkedinUrl: bad }), ZodError, bad)
  }
})

test('a bad LinkedIn link gives a message a person can act on', () => {
  const bad = extras.safeParse({ linkedinUrl: 'http://linkedin.com/in/a' })
  assert.equal(bad.success, false)
  if (!bad.success) assert.match(contactFieldError(bad.error) ?? '', /^LinkedIn must be a full https link/)
  const other = z.object({ email: z.string() }).safeParse({})
  assert.equal(other.success, false)
  if (!other.success) assert.equal(contactFieldError(other.error), null)
})

test('attribute values have proper labels', () => {
  assert.equal(attributeValueLabel('PK_EMPLOYMENT'), 'Pakistan employment contract')
  assert.equal(attributeValueLabel('FIXED_TERM'), 'Fixed term')
  assert.equal(attributeValueLabel(null), 'Not set')
  assert.equal(attributeValueLabel('SOMETHING_NEW'), 'SOMETHING_NEW')
  for (const options of [OFFICE_LOCATIONS, WORK_MODES, CONTRACT_TYPES, EMPLOYMENT_STATUSES]) {
    for (const value of options) assert.notEqual(attributeValueLabel(value), value)
  }
})

test('discordUsername is trimmed, tag-stripped and empty clears', () => {
  assert.equal(extras.parse({ discordUsername: '  ana_t  ' }).discordUsername, 'ana_t')
  assert.equal(extras.parse({ discordUsername: '   ' }).discordUsername, null)
  assert.throws(() => extras.parse({ discordUsername: 'x'.repeat(101) }), ZodError)
})

test('adminAttributeGate: no keys ignored; HR allowed; others forbidden', () => {
  const body = { name: 'x', workMode: 'OFFICE' }
  assert.equal(adminAttributeGate('HR', { name: 'x' }), 'ignore')
  assert.equal(adminAttributeGate('HR', body), 'allow')
  for (const role of ['OA', 'EMPLOYEE', 'SECURITY', 'EXECUTION']) assert.equal(adminAttributeGate(role, body), 'forbidden', role)
})

test('selfAttributeGate: 403 on any attribute key', () => {
  for (const key of ATTRIBUTE_KEYS) {
    assert.equal(selfAttributeGate({ [key]: null }), 'forbidden', key)
  }
  assert.equal(selfAttributeGate({ discordUsername: 'a', linkedinUrl: null }), 'ignore')
})

test('formatZodIssues joins path and message', () => {
  const result = personAttributesSchema.safeParse(mergeAttributePatch(current, { officeLocation: 'REMOTE' }))
  assert.ok(!result.success)
  assert.equal(formatZodIssues(result.error), 'remoteCountry: Remote country is required when the office location is Remote.')
})

test('applyPrefill fills empty fields only and never overwrites', () => {
  const empty: PersonAttributes = { officeLocation: null, remoteCountry: null, workMode: null, contractType: null, employmentStatus: null }
  assert.deepEqual(applyPrefill(empty, { officeLocation: 'REMOTE', remoteCountry: 'ID', contractType: 'INDEPENDENT_CONTRACTOR' }), {
    ...empty, officeLocation: 'REMOTE', remoteCountry: 'ID', contractType: 'INDEPENDENT_CONTRACTOR',
  })
  assert.deepEqual(applyPrefill(current, { officeLocation: 'REMOTE', remoteCountry: 'ID', contractType: 'INDEPENDENT_CONTRACTOR' }), current)
  assert.equal(applyPrefill({ ...empty, officeLocation: 'KARACHI' }, { officeLocation: 'REMOTE', remoteCountry: 'ID' }).remoteCountry, null)
  assert.equal(empty.officeLocation, null)
})
