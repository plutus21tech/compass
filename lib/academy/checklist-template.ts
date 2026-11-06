// Pure rules for editing the checklist template. No server-only imports: safe for client components.
import { z } from 'zod'

export const OWNER_ROLES = ['HR', 'SECURITY', 'OA', 'TEAM_LEAD'] as const
export const OWNER_LABELS: Record<(typeof OWNER_ROLES)[number], string> = {
  HR: 'HR',
  SECURITY: 'Security',
  OA: 'Operations & Admin',
  TEAM_LEAD: 'Team lead',
}
const MAX_OFFSET_DAYS = 365

/** key and autoTickEvent are not editable, so the schema is strict. */
export const templateItemInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Write a title.').max(200),
    ownerRole: z.enum(OWNER_ROLES),
    dueOffsetDays: z.number().int('Use a whole number of days.').min(-MAX_OFFSET_DAYS).max(MAX_OFFSET_DAYS),
    isActive: z.boolean(),
    orderIndex: z.number().int().min(0).max(10_000),
  })
  .strict()
export type TemplateItemInput = z.infer<typeof templateItemInputSchema>

export const newTemplateItemSchema = templateItemInputSchema.omit({ orderIndex: true }).strict()
export type NewTemplateItemInput = z.infer<typeof newTemplateItemSchema>

export function slugFromTitle(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return slug || 'item'
}

export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/** Plain words for the due date, since it can be before the joining day. */
export function offsetPhrase(days: number): string {
  if (days === 0) return 'On the joining day'
  const n = Math.abs(days)
  return `${n} ${n === 1 ? 'day' : 'days'} ${days < 0 ? 'before' : 'after'} joining`
}
