import type { PrismaClient } from '@prisma/client'
import {
  decryptSensitiveValue,
  encryptPayrollField,
  encryptSensitiveValue,
} from '@/lib/payroll/sensitive-fields'
import { bankDetailsSchema, discordUsernameSchema, linkedinUrlSchema, maskIban } from '../bank'
import { AcademyError } from '../errors'
import { parseProgressState } from '../progress'
import { renderBlocks } from '../view'
import { buildAcademyContext } from './context'
import {
  COURSE_TX_OPTIONS,
  assertModuleOpen,
  findCourseModule,
  listCourseModules,
  lockProgressRow,
  moduleBlocks,
  versionIdFor,
} from './progress'

const LINKEDIN_MODULE_SLUG = 'linkedin'
const NAME_MESSAGE = 'Type your full name as it appears at the top of this page.'
const BANK_FIELDS = ['accountTitle', 'bankName', 'branch', 'iban'] as const
type BankField = (typeof BANK_FIELDS)[number]

const pendingLabel = (field: BankField) => `pendingBank.${field}`

/** Stored values are never empty (the schema requires them), so a null here is a bug, not input. */
function sealed(encrypted: string | null): string {
  if (encrypted === null) throw new Error('Bank detail could not be encrypted')
  return encrypted
}

export async function saveDiscordUsername(db: PrismaClient, userId: string, value: unknown): Promise<void> {
  const discordUsername = discordUsernameSchema.parse(value)
  await db.user.update({ where: { id: userId }, data: { discordUsername } })
}

/**
 * Writes `state.linkedinUrl` on the Module 8 row under the same row lock as every other write to
 * `state`. `User.linkedinUrl` is written by HR's Verify later. A finished module is a finished record.
 */
export async function saveLinkedinUrl(db: PrismaClient, userId: string, value: unknown): Promise<void> {
  const linkedinUrl = linkedinUrlSchema.parse(value)
  await db.$transaction(async (tx) => {
    const { module, index } = findCourseModule(await listCourseModules(tx), LINKEDIN_MODULE_SLUG)
    const row = await lockProgressRow(tx, userId, module.id)
    assertModuleOpen(row, index)
    if (row.status === 'COMPLETED') return
    const state = { ...parseProgressState(row.state), linkedinUrl }
    await tx.onboardingProgress.update({ where: { id: row.id }, data: { state } })
  }, COURSE_TX_OPTIONS)
}

/**
 * PK hires only. With a payroll profile the four fields go straight onto it (and nothing else on it
 * changes); without one they are held, encrypted, until HR creates the profile. Never creates a profile.
 */
export async function saveBankDetails(db: PrismaClient, userId: string, input: unknown): Promise<{ held: boolean }> {
  const details = bankDetailsSchema.parse(input)
  const user = await db.user.findUnique({ where: { id: userId }, select: { contractType: true } })
  if (!user) throw new AcademyError('User not found', 404)
  if (user.contractType !== 'PK_EMPLOYMENT') {
    throw new AcademyError('Bank details are for Pakistan-based employees. Contractors add payout details instead.', 400)
  }

  const onProfile = Object.fromEntries(BANK_FIELDS.map((f) => [f, sealed(encryptPayrollField(f, details[f]))]))
  const { count } = await db.payrollEmployeeProfile.updateMany({ where: { userId }, data: onProfile })
  if (count > 0) return { held: false }

  const held = Object.fromEntries(BANK_FIELDS.map((f) => [f, sealed(encryptSensitiveValue(pendingLabel(f), details[f]))])) as Record<BankField, string>
  await db.onboardingPendingBankDetails.upsert({ where: { userId }, create: { userId, ...held }, update: held })
  // HR may have created the profile while this ran; if so the held row moves straight across.
  return { held: !(await applyPendingBankDetails(db, userId)) }
}

/**
 * Copies held details onto the payroll profile and deletes the row, in one transaction. False when
 * there is nothing to move or no profile yet (the row stays).
 */
export async function applyPendingBankDetails(db: PrismaClient, userId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const pending = await tx.onboardingPendingBankDetails.findUnique({ where: { userId } })
    if (!pending) return false
    const profile = await tx.payrollEmployeeProfile.findUnique({ where: { userId }, select: { id: true } })
    if (!profile) return false
    const data = Object.fromEntries(
      BANK_FIELDS.map((f) => {
        const plain = decryptSensitiveValue(pendingLabel(f), pending[f])
        return [f, sealed(encryptPayrollField(f, plain))]
      }),
    )
    // Only one caller wins the delete, so only one writes.
    const { count } = await tx.onboardingPendingBankDetails.deleteMany({ where: { id: pending.id } })
    if (count === 0) return false
    await tx.payrollEmployeeProfile.update({ where: { id: profile.id }, data })
    return true
  }, COURSE_TX_OPTIONS)
}

/**
 * For HR's save paths: a failure is logged and never fails the save. The log carries the user id only,
 * because an error from the database layer may quote values.
 */
export async function applyPendingBankDetailsSafely(db: PrismaClient, userId: string): Promise<void> {
  try {
    await applyPendingBankDetails(db, userId)
  } catch (error) {
    console.error('[academy] held bank details could not be applied', { userId, error: error instanceof Error ? error.name : 'unknown' })
  }
}

export interface BankStatus { saved: boolean; held: boolean; ibanMasked: string | null }

/** What the hire may see of their own bank details: whether they are saved, and the IBAN's last 4. */
export async function readOwnBankStatus(db: PrismaClient, userId: string): Promise<BankStatus> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { payrollProfile: { select: { iban: true } }, onboardingPendingBank: { select: { iban: true } } },
  })
  const held = user?.onboardingPendingBank != null
  const onProfile = user?.payrollProfile?.iban ?? null
  const stored = onProfile ?? user?.onboardingPendingBank?.iban ?? null
  if (!stored) return { saved: false, held, ibanMasked: null }
  try {
    const plain = decryptSensitiveValue(onProfile ? 'iban' : pendingLabel('iban'), stored)
    return { saved: true, held, ibanMasked: plain ? maskIban(plain) : null }
  } catch {
    console.error('[academy] stored IBAN could not be read', { userId })
    return { saved: true, held, ibanMasked: null }
  }
}

const squash = (name: string) => name.replace(/\s+/g, '').toLowerCase()

export interface AcknowledgementInput { kind: 'SECURITY_SOPS'; typedName: string; moduleSlug: string }

/**
 * The statement and version come from the module as this hire sees it, never from the client. The
 * first signature stands: signing again returns it. The row lock makes a double submit sign once.
 */
export async function signAcknowledgement(
  db: PrismaClient, userId: string, input: AcknowledgementInput,
): Promise<{ signedAt: Date }> {
  if (input.kind !== 'SECURITY_SOPS') throw new AcademyError('That acknowledgement is not available yet.', 400)
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } })
  if (!user) throw new AcademyError('User not found', 404)
  if (!squash(input.typedName) || squash(input.typedName) !== squash(user.name)) throw new AcademyError(NAME_MESSAGE, 400)

  return db.$transaction(async (tx) => {
    const { module, index } = findCourseModule(await listCourseModules(tx), input.moduleSlug)
    const row = await lockProgressRow(tx, userId, module.id)
    assertModuleOpen(row, index)
    const context = await buildAcademyContext(tx, userId)
    if (!context) throw new AcademyError('Module not found', 404)
    const versionId = versionIdFor(row, module)
    const blocks = renderBlocks(await moduleBlocks(tx, versionId, context), context.placeholders)
    const block = blocks.find((b) => b.type === 'acknowledgement' && b.kind === input.kind)
    if (!block || block.type !== 'acknowledgement') throw new AcademyError("That isn't part of this module.", 400)

    const first = await tx.onboardingAcknowledgement.findFirst({
      where: { userId, kind: input.kind }, orderBy: { signedAt: 'asc' }, select: { signedAt: true },
    })
    if (first) return { signedAt: first.signedAt }
    const signed = await tx.onboardingAcknowledgement.create({
      data: { userId, kind: input.kind, statementText: block.statement, moduleVersionId: versionId, typedName: user.name },
      select: { signedAt: true },
    })
    return { signedAt: signed.signedAt }
  }, COURSE_TX_OPTIONS)
}
