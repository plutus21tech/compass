import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decryptPayrollField,
  decryptSensitiveValue,
  decryptSensitivePayrollProfileFields,
  encryptPayrollField,
  encryptSensitiveValue,
  encryptSensitivePayrollProfileFields,
  isEncryptedPayrollField,
} from '../lib/payroll/sensitive-fields'
import { canDeletePayrollPeriodStatus } from '../lib/payroll/period-status'

const TEST_KEY = '0123456789abcdef0123456789abcdef'
const HEX_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
// Produced by the pre-refactor encryptPayrollField('accountNumber', 'legacy-001122') under TEST_KEY.
const LEGACY_ACCOUNT_NUMBER_CIPHERTEXT =
  'p21enc:v1:jYHJk3l0YTJsd_PU:UcZ7q8S9BKvrNAfwAddQ-Q:Zo1KrJxeA3rOluBsGw'
const PAYOUT_LABEL = 'contractorPayout.accountNumberOrIban'

function withEncryptionKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env.PAYROLL_FIELD_ENCRYPTION_KEY
  if (key === undefined) {
    delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY
  } else {
    process.env.PAYROLL_FIELD_ENCRYPTION_KEY = key
  }

  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env.PAYROLL_FIELD_ENCRYPTION_KEY
    } else {
      process.env.PAYROLL_FIELD_ENCRYPTION_KEY = previous
    }
  }
}

test('payroll sensitive fields encrypt and decrypt with AES-GCM envelope format', () => {
  withEncryptionKey(TEST_KEY, () => {
    const encrypted = encryptPayrollField('accountNumber', 'PK-123456')

    assert.equal(isEncryptedPayrollField(encrypted), true)
    assert.notEqual(encrypted, 'PK-123456')
    assert.equal(decryptPayrollField('accountNumber', encrypted), 'PK-123456')
  })
})

test('payroll sensitive profile helper encrypts only sensitive values', () => {
  withEncryptionKey(TEST_KEY, () => {
    const encrypted = encryptSensitivePayrollProfileFields({
      cnicNumber: '12345-1234567-1',
      bankName: 'Bank',
      accountTitle: 'Employee',
      accountNumber: '001122',
    })

    assert.equal(isEncryptedPayrollField(encrypted.cnicNumber), true)
    assert.equal(isEncryptedPayrollField(encrypted.accountNumber), true)
    assert.deepEqual(decryptSensitivePayrollProfileFields(encrypted), {
      cnicNumber: '12345-1234567-1',
      bankName: 'Bank',
      accountTitle: 'Employee',
      accountNumber: '001122',
    })
  })
})

test('payroll sensitive field decrypt keeps legacy plaintext readable', () => {
  withEncryptionKey(undefined, () => {
    assert.equal(decryptPayrollField('bankName', 'Legacy Bank'), 'Legacy Bank')
  })
})

test('payroll sensitive field save fails closed without encryption key', () => {
  withEncryptionKey(undefined, () => {
    assert.throws(
      () => encryptPayrollField('accountNumber', '001122'),
      /PAYROLL_FIELD_ENCRYPTION_KEY is required/
    )
  })
})

test('label-based encryption round trips', () => {
  withEncryptionKey(HEX_KEY, () => {
    const encrypted = encryptSensitiveValue(PAYOUT_LABEL, 'GB33BUKB20201555555555')
    assert.equal(isEncryptedPayrollField(encrypted), true)
    assert.equal(decryptSensitiveValue(PAYOUT_LABEL, encrypted), 'GB33BUKB20201555555555')
  })
})

test('label-based decryption is bound to the label', () => {
  withEncryptionKey(HEX_KEY, () => {
    const encrypted = encryptSensitiveValue(PAYOUT_LABEL, 'GB33BUKB20201555555555')
    assert.throws(() => decryptSensitiveValue('contractorPayout.other', encrypted))
  })
})

test('label-based functions stay compatible with payroll ciphertext', () => {
  withEncryptionKey(TEST_KEY, () => {
    const fresh = encryptPayrollField('accountNumber', 'x')
    assert.equal(decryptSensitiveValue('accountNumber', fresh), 'x')
    // Pinned ciphertext from the old code path: format and AAD must not drift.
    assert.equal(decryptSensitiveValue('accountNumber', LEGACY_ACCOUNT_NUMBER_CIPHERTEXT), 'legacy-001122')
    assert.equal(decryptPayrollField('accountNumber', LEGACY_ACCOUNT_NUMBER_CIPHERTEXT), 'legacy-001122')
    assert.throws(() => decryptPayrollField('bankName', LEGACY_ACCOUNT_NUMBER_CIPHERTEXT))
  })
})

test('iban and branch are encrypted as sensitive payroll fields', () => {
  withEncryptionKey(HEX_KEY, () => {
    const encrypted = encryptSensitivePayrollProfileFields({
      iban: 'PK36SCBL0000001123456702',
      branch: 'Main Branch',
    })
    assert.ok(encrypted.iban?.startsWith('p21enc:v1:'))
    assert.ok(encrypted.branch?.startsWith('p21enc:v1:'))
    const decrypted = decryptSensitivePayrollProfileFields(encrypted)
    assert.equal(decrypted.iban, 'PK36SCBL0000001123456702')
    assert.equal(decrypted.branch, 'Main Branch')
  })
})

test('omitted iban and branch are not written as null', () => {
  withEncryptionKey(HEX_KEY, () => {
    const encrypted = encryptSensitivePayrollProfileFields({ bankName: 'Bank' })
    assert.equal('iban' in encrypted, false)
    assert.equal('branch' in encrypted, false)
  })
})

test('payroll period deletion is blocked for finalized statuses', () => {
  assert.equal(canDeletePayrollPeriodStatus('DRAFT'), true)
  assert.equal(canDeletePayrollPeriodStatus('CALCULATED'), true)
  assert.equal(canDeletePayrollPeriodStatus('FAILED'), true)
  assert.equal(canDeletePayrollPeriodStatus('APPROVED'), false)
  assert.equal(canDeletePayrollPeriodStatus('SENDING'), false)
  assert.equal(canDeletePayrollPeriodStatus('SENT'), false)
  assert.equal(canDeletePayrollPeriodStatus('LOCKED'), false)
})
