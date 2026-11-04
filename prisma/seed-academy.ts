// Re-runnable seed for the Onboarding Academy. Never runs on deploy.
// CLI: ONBOARDING_ACADEMY_SEED_CONFIRM=yes npm run seed:academy
import { Prisma, PrismaClient } from '@prisma/client'
import { academyLinkSchema, libraryCardSchema } from '../lib/academy/links'
import { ACADEMY_CARDS, ACADEMY_CHECKLIST, ACADEMY_DEFAULT_LINKS, ACADEMY_MODULES } from './seed-academy-data'

export interface SeedAcademyResult {
  modulesCreated: number
  modulesRetired: number
  cardsCreated: number
  checklistItemsCreated: number
}

const RETIRED_OFFSET = 1000

/** Highest first, so a bumped row can never land on one still waiting to move. */
async function retireOldModules(db: PrismaClient): Promise<number> {
  const keep = ACADEMY_MODULES.map((m) => m.slug)
  const old = await db.onboardingModule.findMany({
    where: { slug: { notIn: keep }, orderIndex: { lt: RETIRED_OFFSET } },
    orderBy: { orderIndex: 'desc' },
  })
  for (const row of old) {
    await db.onboardingModule.update({ where: { id: row.id }, data: { isActive: false, orderIndex: RETIRED_OFFSET + row.orderIndex } })
  }
  const questions = await db.onboardingQuizQuestion.findMany({ where: { orderIndex: { lt: RETIRED_OFFSET } }, orderBy: { orderIndex: 'desc' } })
  for (const q of questions) {
    await db.onboardingQuizQuestion.update({ where: { id: q.id }, data: { isActive: false, orderIndex: RETIRED_OFFSET + q.orderIndex } })
  }
  return old.length
}

async function ensureModules(db: PrismaClient): Promise<number> {
  const existing = await db.onboardingModule.findMany({ where: { slug: { in: ACADEMY_MODULES.map((m) => m.slug) } } })
  // Park existing rows on negative indexes first, so reordering cannot trip the unique constraint.
  for (const [i, row] of existing.entries()) {
    await db.onboardingModule.update({ where: { id: row.id }, data: { orderIndex: -(i + 1) } })
  }
  let created = 0
  for (const def of ACADEMY_MODULES) {
    const { slug, ...fields } = def
    const found = existing.find((e) => e.slug === slug)
    const mod = found
      ? await db.onboardingModule.update({ where: { id: found.id }, data: { ...fields, isActive: true } })
      : await db.onboardingModule.create({ data: { slug, ...fields, isActive: true } })
    if (!found) created += 1
    if (!mod.currentVersionId) {
      const version = await db.onboardingModuleVersion.upsert({
        where: { moduleId_version: { moduleId: mod.id, version: 1 } },
        create: { moduleId: mod.id, version: 1, blocks: [] },
        update: {},
      })
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
  else if (Object.keys(merged).length !== Object.keys(current).length) await db.onboardingConfig.update({ where: { id: 'singleton' }, data: { links } })
}

async function ensureChecklist(db: PrismaClient): Promise<number> {
  const result = await db.onboardingChecklistTemplateItem.createMany({
    data: ACADEMY_CHECKLIST.map((item, index) => ({ ...item, orderIndex: index + 1 })),
    skipDuplicates: true,
  })
  return result.count
}

export async function seedAcademy(db: PrismaClient): Promise<SeedAcademyResult> {
  const modulesRetired = await retireOldModules(db)
  const modulesCreated = await ensureModules(db)
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

async function main(): Promise<void> {
  if (process.env.ONBOARDING_ACADEMY_SEED_CONFIRM !== 'yes') {
    console.error('Refusing to run: set ONBOARDING_ACADEMY_SEED_CONFIRM=yes to seed the Academy.')
    process.exit(1)
  }
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
