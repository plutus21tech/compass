// Re-runnable seed for the Onboarding Academy. Never runs on deploy.
// RUN ONLY AT FLAG-ON: this retires the legacy onboarding modules and quiz questions, so with
// ONBOARDING_ACADEMY_ENABLED off the old flow would break. Run it at switch-on, after the
// hire-facing course exists (stage 2 or later), and not before.
// CLI: ONBOARDING_ACADEMY_ENABLED=true ONBOARDING_ACADEMY_SEED_CONFIRM=yes npm run seed:academy
import { Prisma, PrismaClient } from '@prisma/client'
import { parseBlocks } from '../lib/academy/blocks'
import { isAcademyEnabled } from '../lib/academy/flag'
import { academyLinkSchema, libraryCardSchema } from '../lib/academy/links'
import { ACADEMY_CARDS, ACADEMY_CHECKLIST, ACADEMY_DEFAULT_LINKS, ACADEMY_MODULES } from './seed-academy-data'
import { ACADEMY_MODULE_BLOCKS } from './seed-academy-content'

export interface SeedAcademyResult {
  modulesCreated: number
  modulesRetired: number
  cardsCreated: number
  checklistItemsCreated: number
}

type Tx = Prisma.TransactionClient

const RETIRED_OFFSET = 1000
const REORDER_TIMEOUT_MS = 120_000
const FLAG_ON_WARNING =
  'WARNING: this retires the legacy onboarding modules and quiz questions. Run it only at flag-on (ONBOARDING_ACADEMY_ENABLED), after the hire-facing course exists (stage 2 or later), not before.'

/** Highest first, so a bumped row can never land on one still waiting to move. */
async function retireOldModules(db: Tx): Promise<number> {
  const keep = ACADEMY_MODULES.map((m) => m.slug)
  const old = await db.onboardingModule.findMany({
    where: { slug: { notIn: keep }, orderIndex: { lt: RETIRED_OFFSET } },
    orderBy: { orderIndex: 'desc' },
  })
  for (const row of old) {
    await db.onboardingModule.update({ where: { id: row.id }, data: { isActive: false, orderIndex: RETIRED_OFFSET + row.orderIndex } })
  }
  // Old questions have no explanation; every stage-3 question does, so those are never retired.
  const questions = await db.onboardingQuizQuestion.findMany({
    where: { orderIndex: { lt: RETIRED_OFFSET }, explanation: null, retiredAt: null },
    orderBy: { orderIndex: 'desc' },
  })
  const retiredAt = new Date()
  for (const q of questions) {
    await db.onboardingQuizQuestion.update({
      where: { id: q.id },
      data: { isActive: false, retiredAt, orderIndex: RETIRED_OFFSET + q.orderIndex },
    })
  }
  return old.length
}

async function ensureModules(db: Tx): Promise<number> {
  const existing = await db.onboardingModule.findMany({
    where: { slug: { in: ACADEMY_MODULES.map((m) => m.slug) } },
    orderBy: { id: 'asc' },
  })
  // Park existing rows on negative indexes first, so reordering cannot trip the unique constraint.
  for (const [i, row] of existing.entries()) {
    await db.onboardingModule.update({ where: { id: row.id }, data: { orderIndex: -(i + 1) } })
  }
  let created = 0
  for (const def of ACADEMY_MODULES) {
    const { slug, ...fields } = def
    const found = existing.find((e) => e.slug === slug)
    const mod = found
      ? await db.onboardingModule.update({ where: { id: found.id }, data: { ...fields } })
      : await db.onboardingModule.create({ data: { slug, ...fields, isActive: true } })
    if (!found) created += 1
    const content = parseBlocks(ACADEMY_MODULE_BLOCKS[slug] ?? []) as unknown as Prisma.InputJsonValue
    // Fill version 1 only while it is empty: once HR has edited it, a re-run never touches it.
    const v1 = await db.onboardingModuleVersion.findUnique({ where: { moduleId_version: { moduleId: mod.id, version: 1 } } })
    if (v1 && Array.isArray(v1.blocks) && v1.blocks.length === 0) {
      await db.onboardingModuleVersion.update({ where: { id: v1.id }, data: { blocks: content } })
    }
    if (!mod.currentVersionId) {
      const version = v1 ?? (await db.onboardingModuleVersion.create({ data: { moduleId: mod.id, version: 1, blocks: content } }))
      await db.onboardingModule.update({ where: { id: mod.id }, data: { currentVersionId: version.id } })
    }
  }
  return created
}

async function ensureCards(db: PrismaClient): Promise<number> {
  let created = 0
  for (const [index, raw] of ACADEMY_CARDS.entries()) {
    const card = libraryCardSchema.parse(raw)
    const found = await db.onboardingLibraryCard.findFirst({ where: { kind: card.kind, title: card.title } })
    if (found) continue
    await db.onboardingLibraryCard.create({
      data: { ...card, links: card.links as unknown as Prisma.InputJsonValue, orderIndex: index },
    })
    created += 1
  }
  return created
}

async function ensureLinks(db: PrismaClient): Promise<void> {
  const row = await db.onboardingConfig.findUnique({ where: { id: 'singleton' } })
  const stored = row?.links
  const current: Record<string, unknown> =
    stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...(stored as Record<string, unknown>) } : {}
  const merged: Record<string, unknown> = { ...current }
  for (const [key, link] of Object.entries(ACADEMY_DEFAULT_LINKS)) {
    if (current[key] === undefined || current[key] === null) merged[key] = academyLinkSchema.parse(link)
  }
  const links = merged as Prisma.InputJsonObject
  if (!row) await db.onboardingConfig.create({ data: { id: 'singleton', links } })
  else if (JSON.stringify(merged) !== JSON.stringify(current)) await db.onboardingConfig.update({ where: { id: 'singleton' }, data: { links } })
}

async function ensureChecklist(db: PrismaClient): Promise<number> {
  const result = await db.onboardingChecklistTemplateItem.createMany({
    data: ACADEMY_CHECKLIST.map((item, index) => ({ ...item, orderIndex: index + 1 })),
    skipDuplicates: true,
  })
  return result.count
}

export async function seedAcademy(db: PrismaClient): Promise<SeedAcademyResult> {
  // Together: a failure partway must not leave old modules retired with no new ones in place.
  const { modulesRetired, modulesCreated } = await db.$transaction(
    async (tx) => ({ modulesRetired: await retireOldModules(tx), modulesCreated: await ensureModules(tx) }),
    { timeout: REORDER_TIMEOUT_MS },
  )
  const cardsCreated = await ensureCards(db)
  await ensureLinks(db)
  const checklistItemsCreated = await ensureChecklist(db)
  return { modulesCreated, modulesRetired, cardsCreated, checklistItemsCreated }
}

function describeHost(url: string | undefined): string {
  try {
    return new URL(url ?? '').host
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

/** Why the CLI must not run, or null when both the flag and the confirmation are set. */
export function seedRefusal(env: Record<string, string | undefined>): string | null {
  if (!isAcademyEnabled(env)) {
    return 'Refusing to run: ONBOARDING_ACADEMY_ENABLED must be true, because this retires the legacy onboarding.'
  }
  if (env.ONBOARDING_ACADEMY_SEED_CONFIRM !== 'yes') {
    return 'Refusing to run: set ONBOARDING_ACADEMY_SEED_CONFIRM=yes to seed the Academy.'
  }
  return null
}

async function main(): Promise<void> {
  const refusal = seedRefusal(process.env)
  if (refusal) {
    console.error(refusal)
    process.exit(1)
  }
  console.warn(FLAG_ON_WARNING)
  console.log(`Seeding the Academy into database host: ${describeHost(process.env.DATABASE_URL)}`)
  const db = new PrismaClient()
  try {
    console.log('Academy seed complete:', await seedAcademy(db))
  } finally {
    await db.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Academy seed failed:', error)
    process.exit(1)
  })
}
