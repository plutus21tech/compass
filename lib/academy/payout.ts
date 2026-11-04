import { z } from 'zod'
import type { PayoutMethod } from '@prisma/client'
import { canReadPayoutDetails } from '@/lib/permissions'

export { canReadPayoutDetails }

// encryptSensitiveValue passes through any value carrying its prefix, so a user could store a value
// that later fails to decrypt. Reject the prefix on every encrypted free-text field.
const text = (schema: z.ZodString) => schema.refine((v) => !v.toLowerCase().includes('p21enc:'), 'This value is not allowed')

const holder = text(z.string().trim().min(1).max(200))
const currency = z.string().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code such as USD')
const email = text(z.string().trim().email().max(320))

const walletShape = { accountHolderName: holder, payoutEmail: email, currency }

export const payoutSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('WISE'), ...walletShape }),
  z.object({ method: z.literal('PAYONEER'), ...walletShape }),
  z.object({
    method: z.literal('BANK_TRANSFER'),
    accountHolderName: holder,
    bankName: text(z.string().trim().min(1).max(200)),
    accountNumberOrIban: text(z.string().trim().min(5).max(64)),
    swiftBic: z.string().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/, 'SWIFT/BIC must be 8 or 11 characters'),
    bankCountry: z.string().regex(/^[A-Z]{2}$/, 'Bank country must be a 2-letter code'),
    bankAddress: text(z.string().trim().max(500)).optional(),
    currency,
  }),
  z.object({
    method: z.literal('OTHER'),
    accountHolderName: holder,
    instructions: text(z.string().trim().min(5).max(2000)),
    currency,
  }),
])

/** Pakistan-based employees are paid through payroll; a null contractType may save. */
export function canSavePayout(contractType: string | null | undefined): boolean {
  return contractType !== 'PK_EMPLOYMENT'
}

export type PayoutInput = z.infer<typeof payoutSchema>

export type PayoutView = {
  method: PayoutMethod
  accountHolderName: string
  currency: string
  fields: Record<string, string | null>
  submittedAt: string
}

const MASK = '••••'

function maskAccount(value: string): string {
  return `${MASK}${value.slice(-4)}`
}

function maskEmail(value: string): string {
  const at = value.indexOf('@')
  if (at < 1) return MASK
  return `${value[0]}***${value.slice(at)}`
}

const MASKERS: Record<string, (value: string) => string> = {
  accountNumberOrIban: maskAccount,
  payoutEmail: maskEmail,
  instructions: () => MASK,
  swiftBic: () => MASK,
  bankAddress: () => MASK,
}

/** Returns a new view; accountHolderName, bankName, bankCountry, currency and method stay readable. */
export function maskPayout(view: PayoutView): PayoutView {
  const fields: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(view.fields)) {
    const masker = MASKERS[key]
    fields[key] = value && masker ? masker(value) : value
  }
  return { ...view, fields }
}
