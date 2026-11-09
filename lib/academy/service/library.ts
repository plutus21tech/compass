import { z } from 'zod'
import type { LibraryCardKind, OnboardingLibraryCard, Prisma, PrismaClient } from '@prisma/client'
import type { PersonAttributes } from '../attributes'
import { AcademyError } from '../errors'
import { isCardEligible } from '../eligibility'
import {
  BLOCKERS_CALL_PATTERN,
  academyConfigInputSchema,
  httpsUrlSchema,
  libraryCardSchema,
  sanitizeStoredLinks,
  type AcademyConfigView,
} from '../links'
import { VIDEO_KEYS, readVideo, type VideoConfigs } from '../video'

type Db = PrismaClient | Prisma.TransactionClient

const CONFIG_ID = 'singleton'
const DEFAULTS = { blockersCallCt: 'WED 07:00', retakeCooldownMinutes: 15, failAlertThreshold: 3 } as const

export async function listLibraryCards(
  db: Db,
  kind: LibraryCardKind,
  opts: { includeInactive?: boolean } = {},
): Promise<OnboardingLibraryCard[]> {
  return db.onboardingLibraryCard.findMany({
    where: { kind, ...(opts.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function eligibleCards(
  db: Db,
  kind: LibraryCardKind,
  person: PersonAttributes,
): Promise<OnboardingLibraryCard[]> {
  const cards = await listLibraryCards(db, kind)
  return cards.filter((card) => isCardEligible(card, person))
}

export async function createLibraryCard(db: PrismaClient, input: unknown): Promise<OnboardingLibraryCard> {
  const data = libraryCardSchema.parse(input)
  const last = await db.onboardingLibraryCard.aggregate({ where: { kind: data.kind }, _max: { orderIndex: true } })
  return db.onboardingLibraryCard.create({ data: { ...data, orderIndex: (last._max.orderIndex ?? -1) + 1 } })
}

const cardUpdateSchema = libraryCardSchema
  .extend({
    isActive: z.boolean().optional(),
    orderIndex: z.number().int().min(0).optional(),
  })
  .transform(({ kind: _kind, ...fields }) => fields)

/** Hide or unhide on its own, without resending the card. */
const cardVisibilitySchema = z.object({ isActive: z.boolean() }).strict()

export async function updateLibraryCard(db: PrismaClient, id: string, input: unknown): Promise<OnboardingLibraryCard> {
  const visibility = cardVisibilitySchema.safeParse(input)
  const data = visibility.success ? visibility.data : cardUpdateSchema.parse(input)
  const existing = await db.onboardingLibraryCard.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new AcademyError('Card not found', 404)
  return db.onboardingLibraryCard.update({ where: { id }, data })
}

/** Soft delete: the card stays in the database so nothing that referenced it breaks. */
export async function deactivateLibraryCard(db: PrismaClient, id: string): Promise<void> {
  const result = await db.onboardingLibraryCard.updateMany({ where: { id }, data: { isActive: false } })
  if (result.count === 0) throw new AcademyError('Card not found', 404)
}

const keyContactSchema = z
  .object({
    group: z.enum(['HR', 'SECURITY_IT', 'ACCOUNTS', 'EXECUTION']),
    userId: z.string().min(1).nullish(),
    label: z.string().trim().max(120).nullish(),
    email: z.string().trim().max(200).email().nullish().or(z.literal('')),
  })
  .refine((c) => Boolean(c.userId) || Boolean(c.label), { message: 'Pick a person or enter a label', path: ['userId'] })

const keyContactsSchema = z.array(keyContactSchema).max(100)

export async function saveKeyContacts(db: PrismaClient, contacts: unknown): Promise<void> {
  const parsed = keyContactsSchema.parse(contacts)
  const userIds = [...new Set(parsed.flatMap((c) => (c.userId ? [c.userId] : [])))]
  await db.$transaction(async (tx) => {
    if (userIds.length > 0) {
      const found = await tx.user.count({ where: { id: { in: userIds } } })
      if (found !== userIds.length) throw new AcademyError('Unknown user in key contacts', 400)
    }
    await tx.onboardingKeyContact.deleteMany({})
    if (parsed.length === 0) return
    await tx.onboardingKeyContact.createMany({
      data: parsed.map((c, orderIndex) => ({
        group: c.group,
        userId: c.userId || null,
        label: c.label || null,
        email: c.email || null,
        orderIndex,
      })),
    })
  })
}

export async function listKeyContacts(db: Db) {
  return db.onboardingKeyContact.findMany({
    orderBy: { orderIndex: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, position: true, discordUsername: true } } },
  })
}

function sanitizeInvoiceTemplates(stored: unknown): Record<string, string> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(stored)) {
    const parsed = httpsUrlSchema.safeParse(value)
    if (parsed.success) out[name] = parsed.data
    else console.warn('[academy] dropped invalid invoice template', name)
  }
  return out
}

function validCount(value: unknown, min: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min ? value : fallback
}

/** Keeps only videos that validate; a broken one reads as no video. Never throws. */
function sanitizeStoredVideos(stored: unknown): VideoConfigs {
  const out: VideoConfigs = {}
  for (const key of VIDEO_KEYS) {
    const video = readVideo(stored, key)
    if (video) out[key] = video
  }
  return out
}

/** Tolerates a missing row and malformed stored JSON; never returns a link that fails validation. */
export async function getAcademyConfig(db: Db): Promise<AcademyConfigView> {
  const row = await db.onboardingConfig.findUnique({ where: { id: CONFIG_ID } })
  const blockers = row?.blockersCallCt
  return {
    links: sanitizeStoredLinks(row?.links, (key) => console.warn('[academy] dropped invalid stored link', key)),
    invoiceTemplates: sanitizeInvoiceTemplates(row?.invoiceTemplates),
    bankLetterTemplate: row?.bankLetterTemplate ?? null,
    blockersCallCt: blockers && BLOCKERS_CALL_PATTERN.test(blockers) ? blockers : DEFAULTS.blockersCallCt,
    retakeCooldownMinutes: validCount(row?.retakeCooldownMinutes, 0, DEFAULTS.retakeCooldownMinutes),
    failAlertThreshold: validCount(row?.failAlertThreshold, 1, DEFAULTS.failAlertThreshold),
    videos: sanitizeStoredVideos(row?.videos),
  }
}

/** Validates the whole input first; nothing is written when any part is invalid. */
export async function updateAcademyConfig(db: PrismaClient, input: unknown): Promise<AcademyConfigView> {
  const parsed = academyConfigInputSchema.parse(input)
  const data: Prisma.OnboardingConfigUpdateInput = {
    ...(parsed.links !== undefined ? { links: parsed.links as Prisma.InputJsonObject } : {}),
    ...(parsed.invoiceTemplates !== undefined ? { invoiceTemplates: parsed.invoiceTemplates } : {}),
    ...(parsed.bankLetterTemplate !== undefined ? { bankLetterTemplate: parsed.bankLetterTemplate?.trim() || null } : {}),
    ...(parsed.blockersCallCt !== undefined ? { blockersCallCt: parsed.blockersCallCt } : {}),
    ...(parsed.retakeCooldownMinutes !== undefined ? { retakeCooldownMinutes: parsed.retakeCooldownMinutes } : {}),
    ...(parsed.failAlertThreshold !== undefined ? { failAlertThreshold: parsed.failAlertThreshold } : {}),  }
  await db.onboardingConfig.upsert({
    where: { id: CONFIG_ID },
    update: data,
    create: { id: CONFIG_ID, ...(data as Prisma.OnboardingConfigCreateInput) },
  })
  return getAcademyConfig(db)
}
