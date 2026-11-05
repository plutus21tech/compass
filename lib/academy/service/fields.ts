import type { OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import { BANK_LOCKED_MESSAGE, bankDetailsSchema, discordUsernameSchema, linkedinUrlSchema } from '../bank'
import { AcademyError } from '../errors'
import { maskAccount } from '../payout'
import { parseProgressState } from '../progress'
import { renderBlocks } from '../view'
import { buildAcademyContext } from './context'
import { decryptPaymentField, paymentColumns, writePaymentRow } from './payout'
import {
  COURSE_TX_OPTIONS,
  assertModuleOpen,
  findCourseModule,
  listCourseModules,
  lockProgressRow,
  moduleBlocks,
  versionIdFor,
} from './progress'

export const LINKEDIN_MODULE_SLUG = 'linkedin'
export const NAME_MESSAGE = 'Type your full name as it appears at the top of this page.'

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

/** PK hires only. Saved to the onboarding store, where HR and OA read them; OA enters them into payroll by hand. */
export async function saveBankDetails(db: PrismaClient, userId: string, input: unknown): Promise<{ isUpdate: boolean }> {
  const details = bankDetailsSchema.parse(input)
  const user = await db.user.findUnique({ where: { id: userId }, select: { contractType: true } })
  if (!user) throw new AcademyError('User not found', 404)
  if (user.contractType !== 'PK_EMPLOYMENT') {
    throw new AcademyError('Bank details are for Pakistan-based employees. Contractors add payout details instead.', 400)
  }

  const data = paymentColumns('PK_BANK', details)
  const isUpdate = await db.$transaction(async (tx) => {
    await assertBankEditable(tx, userId)
    const existing = await tx.onboardingPaymentDetails.findUnique({ where: { userId }, select: { id: true } })
    await writePaymentRow(tx, userId, data, existing === null)
    return existing !== null
  }, COURSE_TX_OPTIONS)
  console.info('[academy] bank details saved', { userId })
  return { isUpdate }
}

const BANK_MODULE_SLUG = 'getting-paid'
const BANK_UNAVAILABLE_MESSAGE = "This isn't available yet."

/** Bank details change only while Module 11 is open and not completed. Locks that row for the transaction. */
async function assertBankEditable(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  let row: OnboardingProgress
  let index: number
  try {
    const found = findCourseModule(await listCourseModules(tx), BANK_MODULE_SLUG)
    index = found.index
    row = await lockProgressRow(tx, userId, found.module.id)
  } catch (error) {
    // No Module 11 row means this hire's course was never released: nothing is locked, it just isn't there.
    if (error instanceof AcademyError && error.status === 404) throw new AcademyError(BANK_UNAVAILABLE_MESSAGE, 404)
    throw error
  }
  assertModuleOpen(row, index)
  if (row.status === 'COMPLETED') throw new AcademyError(BANK_LOCKED_MESSAGE, 409)
}

export interface BankStatus { saved: boolean; ibanMasked: string | null }

/** What the hire may see of their own bank details: whether they are saved, and the IBAN's last 4. */
export async function readOwnBankStatus(db: PrismaClient, userId: string): Promise<BankStatus> {
  const row = await db.onboardingPaymentDetails.findUnique({ where: { userId }, select: { method: true, iban: true } })
  if (row?.method !== 'PK_BANK') return { saved: false, ibanMasked: null }
  try {
    const plain = decryptPaymentField('iban', row.iban)
    return { saved: true, ibanMasked: plain ? maskAccount(plain) : null }
  } catch (error) {
    // Decryption errors never quote the stored value.
    console.error('[academy] stored IBAN could not be read', { userId, error: error instanceof Error ? error.message : 'unknown' })
    return { saved: true, ibanMasked: null }
  }
}

const squash = (name: string) => name.replace(/\s+/g, '').toLowerCase()

/** Spaces and case don't matter. Shared by every acknowledgement, so they all ask the same thing. */
export function isTypedNameValid(typedName: string, name: string): boolean {
  const typed = squash(typedName)
  return typed.length > 0 && typed === squash(name)
}

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
  if (!isTypedNameValid(input.typedName, user.name)) throw new AcademyError(NAME_MESSAGE, 400)

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
