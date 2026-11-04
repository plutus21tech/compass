import test from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import { personAttributesSchema, type PersonAttributes } from '../lib/academy/attributes'
import {
  ATTRIBUTE_KEYS,
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

test('discordUsername is trimmed, tag-stripped and empty clears', () => {
  assert.equal(extras.parse({ discordUsername: '  ana_t  ' }).discordUsername, 'ana_t')
  assert.equal(extras.parse({ discordUsername: '   ' }).discordUsername, null)
  assert.throws(() => extras.parse({ discordUsername: 'x'.repeat(101) }), ZodError)
})
