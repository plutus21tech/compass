import test from 'node:test'
import assert from 'node:assert/strict'
import { decryptField, encryptField } from '../lib/academy/field-encryption'

const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const OTHER_KEY = 'ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'
const KEY_NAMES = ['ONBOARDING_FIELD_ENCRYPTION_KEY', 'PAYROLL_FIELD_ENCRYPTION_KEY'] as const

function withKey(onboarding: string | undefined, run: () => void): void {
  const before = KEY_NAMES.map((name) => process.env[name])
  delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY
  if (onboarding === undefined) delete process.env.ONBOARDING_FIELD_ENCRYPTION_KEY
  else process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = onboarding
  try {
    run()
  } finally {
    KEY_NAMES.forEach((name, index) => {
      const value = before[index]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    })
  }
}

test('a value round-trips and is sealed in the AES-GCM format', () => {
  withKey(KEY, () => {
    const sealed = encryptField('payment.iban', 'PK36SCBL0000001123456702')
    assert.match(sealed ?? '', /^p21enc:v1:[\w-]+:[\w-]+:[\w-]+$/)
    assert.equal(sealed?.includes('PK36'), false)
    assert.equal(decryptField('payment.iban', sealed), 'PK36SCBL0000001123456702')
  })
})

test('a value sealed under one label does not open under another', () => {
  withKey(KEY, () => {
    const sealed = encryptField('payment.iban', 'secret')
    assert.throws(() => decryptField('payment.branch', sealed))
  })
})

test('a value sealed with another key does not open', () => {
  let sealed: string | null = null
  withKey(KEY, () => { sealed = encryptField('payment.iban', 'secret') })
  withKey(OTHER_KEY, () => assert.throws(() => decryptField('payment.iban', sealed)))
})

test('a value without the prefix is refused, and the error does not quote it', () => {
  withKey(KEY, () => {
    assert.throws(() => decryptField('payment.iban', 'PK36SCBL0000001123456702'), (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message.includes('PK36'), false)
      return true
    })
    assert.throws(() => decryptField('payment.iban', ''))
  })
})

test('a value that already looks encrypted is sealed like any other, not passed through', () => {
  withKey(KEY, () => {
    const lookalike = 'p21enc:v1:aaaa:bbbb:cccc'
    const sealed = encryptField('payment.iban', lookalike)
    assert.notEqual(sealed, lookalike)
    assert.equal(decryptField('payment.iban', sealed), lookalike)
  })
})

test('blank values stay empty and need no key', () => {
  withKey(undefined, () => {
    assert.equal(encryptField('payment.iban', '   '), null)
    assert.equal(encryptField('payment.iban', null), null)
    assert.equal(decryptField('payment.iban', null), null)
  })
})

test('the onboarding key is required: the payroll key is never a stand-in', () => {
  withKey(undefined, () => {
    process.env.PAYROLL_FIELD_ENCRYPTION_KEY = KEY
    assert.throws(() => encryptField('payment.iban', 'secret'), /ONBOARDING_FIELD_ENCRYPTION_KEY/)
  })
})

test('a malformed key is refused', () => {
  withKey('too-short', () => {
    assert.throws(() => encryptField('payment.iban', 'secret'), /ONBOARDING_FIELD_ENCRYPTION_KEY/)
  })
})
