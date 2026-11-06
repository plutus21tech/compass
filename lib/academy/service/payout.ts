import type { OnboardingPaymentDetails, OnboardingPaymentMethod, Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { decryptField, encryptField } from '../field-encryption'
import { BANK_LOCKED_MESSAGE } from '../bank'
import { canSavePayout, maskPayout, payoutSchema, type PayoutView } from '../payout'
import { COURSE_TX_OPTIONS, assertCollectsData, lockPaymentRow, paymentUnavailable } from './progress'
import { lockUserRow } from './quiz'

const ENCRYPTED_FIELDS = [
  'accountHolderName', 'accountTitle', 'payoutEmail', 'bankName', 'branch', 'iban',
  'accountNumberOrIban', 'swiftBic', 'bankAddress', 'instructions',
] as const
type EncryptedField = (typeof ENCRYPTED_FIELDS)[number]

const label = (field: EncryptedField) => `onboardingPayment.${field}`

function encryptedOrNull(input: Record<string, unknown>, field: EncryptedField): string | null {
  const value = input[field]
  return typeof value === 'string' ? encryptField(label(field), value) : null
}

function plainOrNull(input: Record<string, unknown>, field: string): string | null {
  const value = input[field]
  return typeof value === 'string' ? value : null
}

/** Every column is written (null when unused), so a change of method clears the old method's data. */
export function paymentColumns(method: OnboardingPaymentMethod, source: Record<string, unknown>) {
  const encrypted = Object.fromEntries(ENCRYPTED_FIELDS.map((field) => [field, encryptedOrNull(source, field)]))
  return {
    method,
    currency: plainOrNull(source, 'currency'),
    bankCountry: plainOrNull(source, 'bankCountry'),
    ...(encrypted as Record<EncryptedField, string | null>),
  }
}

export function decryptPaymentField(field: EncryptedField, value: string | null): string | null {
  return decryptField(label(field), value)
}

/** Writes the row and its log line together: the log holds who, when and the method, never a value. */
export async function writePaymentRow(
  tx: Prisma.TransactionClient,
  userId: string,
  data: ReturnType<typeof paymentColumns>,
  isFirstSave: boolean,
): Promise<void> {
  await tx.onboardingPaymentDetails.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  await tx.onboardingPaymentChangeLog.create({ data: { userId, actorId: userId, method: data.method, isFirstSave } })
}

/** Only through a person's own course, from when Module 11 opens: a contractor may update after finishing it (§5.9). */
async function assertPayoutOpen(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const { row } = await lockPaymentRow(tx, userId)
  assertCollectsData(row)
  if (row.status === 'LOCKED' && !row.unlockedEarlyById) throw paymentUnavailable()
}

export async function savePayout(db: PrismaClient, userId: string, input: unknown): Promise<{ isUpdate: boolean }> {
  const parsed = payoutSchema.parse(input)
  const user = await db.user.findUnique({ where: { id: userId }, select: { contractType: true } })
  if (!user) throw new AcademyError('User not found', 404)
  if (!canSavePayout(user.contractType)) {
    throw new AcademyError('Payout details are for contractors. Pakistan-based employees add bank details instead.', 400)
  }
  const data = paymentColumns(parsed.method, parsed)
  return db.$transaction(async (tx) => {
    // Two saves at once must not both count as the first.
    await lockUserRow(tx, userId)
    await assertPayoutOpen(tx, userId)
    const existing = await tx.onboardingPaymentDetails.findUnique({ where: { userId }, select: { method: true } })
    // A null contract type may save a payout, but HR blanking the type must not open a way round the bank lock.
    if (existing?.method === 'PK_BANK' && user.contractType === null) throw new AcademyError(BANK_LOCKED_MESSAGE, 409)
    await writePaymentRow(tx, userId, data, existing === null)
    return { isUpdate: existing !== null }
  }, COURSE_TX_OPTIONS)
}

function toView(row: OnboardingPaymentDetails): PayoutView {
  const fields: Record<string, string | null> = {}
  for (const field of ENCRYPTED_FIELDS) {
    if (field === 'accountHolderName') continue
    fields[field] = decryptPaymentField(field, row[field])
  }
  fields.bankCountry = row.bankCountry
  return {
    method: row.method,
    accountHolderName: decryptPaymentField('accountHolderName', row.accountHolderName),
    currency: row.currency,
    fields,
    submittedAt: row.submittedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Admin read. Reveal writes the log in the same transaction; if logging fails nothing is returned. */
export async function readPayout(
  db: PrismaClient,
  userId: string,
  opts: { reveal: boolean; viewerId: string },
): Promise<PayoutView | null> {
  if (!opts.reveal) {
    const row = await db.onboardingPaymentDetails.findUnique({ where: { userId } })
    return row ? maskPayout(toView(row)) : null
  }
  return db.$transaction(async (tx) => {
    const row = await tx.onboardingPaymentDetails.findUnique({ where: { userId } })
    if (!row) return null
    await tx.onboardingPaymentRevealLog.create({ data: { paymentUserId: userId, viewerId: opts.viewerId } })
    return toView(row)
  })
}
