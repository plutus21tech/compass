import type { OnboardingChecklistTemplateItem, Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { newTemplateItemSchema, slugFromTitle, templateItemInputSchema, uniqueKey } from '../checklist-template'

type Db = PrismaClient | Prisma.TransactionClient

export function listTemplateItems(db: Db): Promise<OnboardingChecklistTemplateItem[]> {
  return db.onboardingChecklistTemplateItem.findMany({ orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }] })
}

/** Appended after the last item, with a key made from the title. Only hires without a checklist get it. */
export async function createTemplateItem(db: PrismaClient, input: unknown): Promise<OnboardingChecklistTemplateItem> {
  const data = newTemplateItemSchema.parse(input)
  const base = slugFromTitle(data.title)
  // The unique key can collide with a concurrent create; try again with a fresh read.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [keys, last] = await Promise.all([
      db.onboardingChecklistTemplateItem.findMany({ select: { key: true } }),
      db.onboardingChecklistTemplateItem.aggregate({ _max: { orderIndex: true } }),
    ])
    const key = uniqueKey(base, new Set(keys.map((row) => row.key)))
    try {
      return await db.onboardingChecklistTemplateItem.create({ data: { ...data, key, orderIndex: (last._max.orderIndex ?? 0) + 1 } })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
    }
  }
  throw new AcademyError('Could not save that item. Try again.', 409)
}

/** The key and the auto-tick event never change. */
export async function updateTemplateItem(db: PrismaClient, id: string, input: unknown): Promise<OnboardingChecklistTemplateItem> {
  const data = templateItemInputSchema.parse(input)
  const existing = await db.onboardingChecklistTemplateItem.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new AcademyError('Checklist item not found', 404)
  return db.onboardingChecklistTemplateItem.update({ where: { id }, data })
}
