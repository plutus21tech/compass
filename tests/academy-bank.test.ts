import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bankDetailsSchema, discordUsernameSchema, linkedinUrlSchema, maskIban, omitBankIdentifiers, withoutBlankBankLabels,
} from '../lib/academy/bank'

// Fictional IBAN, shaped like a Pakistani one.
const IBAN = 'PK36SCBL0000001123456702'
const valid = { accountTitle: ' Cara Lindqvist ', bankName: 'Example Bank', branch: 'Main Branch', iban: IBAN }

test('maskIban keeps the last 4 characters', () => {
  assert.equal(maskIban(IBAN), '••••6702')
  assert.equal(maskIban('ab'), '••••ab')
})

test('bankDetailsSchema trims, strips spaces and upper-cases the IBAN', () => {
  const parsed = bankDetailsSchema.parse({ ...valid, iban: ' pk36 scbl 0000 0011 2345 6702 ' })
  assert.equal(parsed.iban, IBAN)
  assert.equal(parsed.accountTitle, 'Cara Lindqvist')
})

test('bankDetailsSchema rejects a bad IBAN with the friendly message', () => {
  for (const iban of ['GB33BUKB20201555555555', 'PK36SCBL000000112345670', 'PK36SCBL00000011234567022', 'PK3SSCBL0000001123456702', '']) {
    const result = bankDetailsSchema.safeParse({ ...valid, iban })
    assert.equal(result.success, false, iban)
    if (!result.success) {
      assert.equal(result.error.issues[0].message, "That IBAN doesn't look right. It should start with PK and have 24 characters.")
    }
  }
})

test('bankDetailsSchema requires every field non-empty after trimming', () => {
  for (const key of ['accountTitle', 'bankName', 'branch'] as const) {
    assert.equal(bankDetailsSchema.safeParse({ ...valid, [key]: '   ' }).success, false, key)
    assert.equal(bankDetailsSchema.safeParse({ ...valid, [key]: undefined }).success, false, key)
  }
})

test('discordUsernameSchema accepts 2 to 37 of letters, digits, underscore, dot and hash', () => {
  for (const ok of ['ab', ' cara.l_9 ', 'cara#1234']) assert.equal(discordUsernameSchema.safeParse(ok).success, true, ok)
  for (const bad of ['a', 'has space', 'x'.repeat(38), 'caf\u00e9', '']) assert.equal(discordUsernameSchema.safeParse(bad).success, false, bad)
  assert.equal(discordUsernameSchema.parse(' cara '), 'cara')
})

test('linkedinUrlSchema needs https and a linkedin.com host, including www and country subdomains', () => {
  for (const ok of ['https://linkedin.com/in/cara', 'https://www.linkedin.com/in/cara', 'https://pk.linkedin.com/in/cara']) {
    assert.equal(linkedinUrlSchema.safeParse(ok).success, true, ok)
  }
  for (const bad of [
    'http://www.linkedin.com/in/cara', 'https://evil.com/linkedin.com', 'https://linkedin.com.evil.com/in/x',
    'https://notlinkedin.com/in/x', 'https://user@evil.com/', 'javascript:alert(1)', 'www.linkedin.com/in/cara', '',
  ]) {
    assert.equal(linkedinUrlSchema.safeParse(bad).success, false, bad)
  }
})

test('omitBankIdentifiers removes iban and branch and keeps the rest, without mutating', () => {
  const profile = { id: 'p1', bankName: 'Example Bank', accountTitle: 'Cara', accountNumber: '123', iban: IBAN, branch: 'Main' }
  const result = omitBankIdentifiers(profile)
  assert.deepEqual(result, { id: 'p1', bankName: 'Example Bank', accountTitle: 'Cara', accountNumber: '123' })
  assert.equal(profile.iban, IBAN)
  assert.equal(omitBankIdentifiers(null), null)
})

test('withoutBlankBankLabels: with the Academy on, blank or missing labels mean no change', () => {
  const data = { bankName: null, accountTitle: null, accountNumber: 'x' }
  assert.deepEqual(withoutBlankBankLabels(data, { bankName: '', accountTitle: undefined }, true), { accountNumber: 'x' })
  assert.deepEqual(withoutBlankBankLabels(data, { bankName: '  ', accountTitle: null }, true), { accountNumber: 'x' })
  const filled = { bankName: 'enc1', accountTitle: 'enc2', accountNumber: 'x' }
  assert.deepEqual(withoutBlankBankLabels(filled, { bankName: 'A', accountTitle: 'B' }, true), filled)
  assert.deepEqual(withoutBlankBankLabels(filled, { bankName: 'A', accountTitle: '' }, true), { bankName: 'enc1', accountNumber: 'x' })
  assert.deepEqual(Object.keys(data), ['bankName', 'accountTitle', 'accountNumber'])
})

test('withoutBlankBankLabels: with the Academy off, data is returned exactly as today', () => {
  const data = { bankName: null, accountTitle: null, accountNumber: 'x' }
  assert.deepEqual(withoutBlankBankLabels(data, { bankName: '', accountTitle: undefined }, false), data)
})
