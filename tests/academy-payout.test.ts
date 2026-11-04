import test from 'node:test'
import assert from 'node:assert/strict'
import { canSavePayout, payoutSchema, maskPayout, canReadPayoutDetails, type PayoutView } from '../lib/academy/payout'

const bank = {
  method: 'BANK_TRANSFER', accountHolderName: 'Sam Rivers', bankName: 'Example Bank',
  accountNumberOrIban: 'GB33BUKB20201555555555', swiftBic: 'BUKBGB22', bankCountry: 'GB', currency: 'GBP',
}

test('schema: BANK_TRANSFER without swiftBic fails', () => {
  const { swiftBic: _omit, ...rest } = bank
  assert.equal(payoutSchema.safeParse(rest).success, false)
  assert.equal(payoutSchema.safeParse(bank).success, true)
})

test('schema: WISE with an invalid email fails', () => {
  const base = { method: 'WISE', accountHolderName: 'Sam Rivers', currency: 'USD' }
  assert.equal(payoutSchema.safeParse({ ...base, payoutEmail: 'not-an-email' }).success, false)
  assert.equal(payoutSchema.safeParse({ ...base, payoutEmail: 'sam@example.com' }).success, true)
})

test('schema: OTHER needs instructions of 5+ characters', () => {
  const base = { method: 'OTHER', accountHolderName: 'Sam Rivers', currency: 'USD' }
  assert.equal(payoutSchema.safeParse({ ...base, instructions: 'abc' }).success, false)
  assert.equal(payoutSchema.safeParse({ ...base, instructions: 'Pay by cheque' }).success, true)
})

test('maskPayout masks sensitive fields and keeps identifying ones', () => {
  const view: PayoutView = {
    method: 'BANK_TRANSFER', accountHolderName: 'Sam Rivers', currency: 'GBP', submittedAt: '2026-11-01T00:00:00.000Z',
    fields: {
      accountNumberOrIban: 'GB33BUKB20201555555555', payoutEmail: 'sam@example.com', instructions: 'secret text',
      swiftBic: 'BUKBGB22', bankAddress: '1 Example Street', bankName: 'Example Bank', bankCountry: 'GB',
    },
  }
  const masked = maskPayout(view)
  assert.equal(masked.fields.accountNumberOrIban, '••••5555')
  assert.equal(masked.fields.payoutEmail, 's***@example.com')
  assert.equal(masked.fields.instructions, '••••')
  assert.equal(masked.fields.swiftBic, '••••')
  assert.equal(masked.fields.bankAddress, '••••')
  assert.equal(masked.fields.bankName, 'Example Bank')
  assert.equal(masked.fields.bankCountry, 'GB')
  assert.equal(masked.accountHolderName, 'Sam Rivers')
  assert.equal(view.fields.accountNumberOrIban, 'GB33BUKB20201555555555', 'input is not mutated')
})

test('maskPayout leaves null fields null', () => {
  const masked = maskPayout({
    method: 'WISE', accountHolderName: 'A', currency: 'USD', submittedAt: 'x',
    fields: { payoutEmail: null, instructions: null },
  })
  assert.equal(masked.fields.payoutEmail, null)
  assert.equal(masked.fields.instructions, null)
})

test('canReadPayoutDetails: HR and OA only', () => {
  assert.equal(canReadPayoutDetails('HR'), true)
  assert.equal(canReadPayoutDetails('OA'), true)
  for (const r of ['EMPLOYEE', 'SECURITY', 'EXECUTION', null, undefined]) assert.equal(canReadPayoutDetails(r), false)
})

test('canSavePayout refuses only PK_EMPLOYMENT', () => {
  assert.equal(canSavePayout('PK_EMPLOYMENT'), false)
  for (const t of ['INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT', null, undefined]) assert.equal(canSavePayout(t), true)
})

test('schema rejects the ciphertext prefix on every encrypted free-text field', () => {
  const bad = 'p21enc:v1:aaa:bbb:ccc'
  const wallet = { method: 'WISE', accountHolderName: 'Sam Rivers', payoutEmail: 'sam@example.com', currency: 'USD' }
  const bankInput = {
    method: 'BANK_TRANSFER', accountHolderName: 'Sam Rivers', bankName: 'Example Bank',
    accountNumberOrIban: 'GB33BUKB20201555555555', swiftBic: 'BUKBGB22', bankCountry: 'GB', currency: 'GBP',
  }
  assert.equal(payoutSchema.safeParse({ ...wallet, accountHolderName: bad }).success, false)
  assert.equal(payoutSchema.safeParse({ ...wallet, payoutEmail: `${bad}@example.com` }).success, false)
  for (const field of ['bankName', 'accountNumberOrIban', 'bankAddress']) {
    assert.equal(payoutSchema.safeParse({ ...bankInput, [field]: bad }).success, false, field)
  }
  assert.equal(payoutSchema.safeParse({ method: 'OTHER', accountHolderName: 'A', currency: 'USD', instructions: bad }).success, false)
})
