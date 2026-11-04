import type { PrismaClient, ContractorPayoutDetails } from '@prisma/client'
import { decryptSensitiveValue, encryptSensitiveValue } from '@/lib/payroll/sensitive-fields'
import { AcademyError } from '../errors'
import { maskPayout, payoutSchema, type PayoutView } from '../payout'

const ENCRYPTED_FIELDS = [
  'accountHolderName', 'payoutEmail', 'bankName', 'accountNumberOrIban', 'swiftBic', 'bankAddress', 'instructions',
] as const
type EncryptedField = (typeof ENCRYPTED_FIELDS)[number]

const label = (field: EncryptedField) => `contractorPayout.${field}`

function encryptedOrNull(input: Record<string, unknown>, field: EncryptedField): string | null {
  const value = input[field]
  return typeof value === 'string' ? encryptSensitiveValue(label(field), value) : null
}

function plainOrNull(input: Record<string, unknown>, field: string): string | null {
  const value = input[field]
  return typeof value === 'string' ? value : null
}

export async function savePayout(db: PrismaClient, userId: string, input: unknown): Promise<{ isUpdate: boolean }> {
  const parsed = payoutSchema.parse(input)
  const user = await db.user.findUnique({ where: { id: userId }, select: { contractType: true } })
  if (!user) throw new AcademyError('User not found', 404)
  if (user.contractType === 'PK_EMPLOYMENT') {
    throw new AcademyError('Payout details are for contractors. Pakistan-based employees are paid through payroll.', 400)
  }
  const source = parsed as Record<string, unknown>
  // Every optional field is written (null when unused) so a method change clears the old method's data.
  const data = {
    method: parsed.method,
    currency: parsed.currency,
    bankCountry: plainOrNull(source, 'bankCountry'),
    accountHolderName: encryptedOrNull(source, 'accountHolderName') as string,
    payoutEmail: encryptedOrNull(source, 'payoutEmail'),
    bankName: encryptedOrNull(source, 'bankName'),
    accountNumberOrIban: encryptedOrNull(source, 'accountNumberOrIban'),
    swiftBic: encryptedOrNull(source, 'swiftBic'),
    bankAddress: encryptedOrNull(source, 'bankAddress'),
    instructions: encryptedOrNull(source, 'instructions'),
  }
  const existing = await db.contractorPayoutDetails.findUnique({ where: { userId }, select: { id: true } })
  await db.contractorPayoutDetails.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  })
  return { isUpdate: existing !== null }
}

function toView(row: ContractorPayoutDetails): PayoutView {
  const fields: Record<string, string | null> = {}
  for (const field of ENCRYPTED_FIELDS) {
    if (field === 'accountHolderName') continue
    fields[field] = decryptSensitiveValue(label(field), row[field])
  }
  fields.bankCountry = row.bankCountry
  return {
    method: row.method,
    accountHolderName: decryptSensitiveValue(label('accountHolderName'), row.accountHolderName) ?? '',
    currency: row.currency,
    fields,
    submittedAt: row.submittedAt.toISOString(),
  }
}

/** Owner's own details, decrypted, no log. Only for GET /api/onboarding/payout. */
export async function readOwnPayout(db: PrismaClient, userId: string): Promise<PayoutView | null> {
  const row = await db.contractorPayoutDetails.findUnique({ where: { userId } })
  return row ? toView(row) : null
}

/** Admin read. Reveal writes the log in the same transaction; if logging fails nothing is returned. */
export async function readPayout(
  db: PrismaClient,
  userId: string,
  opts: { reveal: boolean; viewerId: string },
): Promise<PayoutView | null> {
  if (!opts.reveal) {
    const row = await db.contractorPayoutDetails.findUnique({ where: { userId } })
    return row ? maskPayout(toView(row)) : null
  }
  return db.$transaction(async (tx) => {
    const row = await tx.contractorPayoutDetails.findUnique({ where: { userId } })
    if (!row) return null
    await tx.contractorPayoutRevealLog.create({ data: { payoutUserId: userId, viewerId: opts.viewerId } })
    return toView(row)
  })
}
