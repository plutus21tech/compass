// Pure link and config rules for the Academy. No server-only imports: safe for client components.
import { z } from 'zod'
import { videoConfigsSchema, type VideoConfigs } from './video'
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES, WORK_MODES } from './attributes'

export const ACADEMY_LINK_KEYS = [
  'COMPANY_DASHBOARD',
  'TRAVEL_POLICY',
  'EQUIPMENT_POLICY',
  'FAULTY_EQUIPMENT_SOP',
  'DISCORD_CHANNELS_GUIDE',
  'LEAVE_POLICY',
  'CORE_HOURS_POLICY',
  'ZERO_TOLERANCE_POLICY',
  'PRINCIPLES_OF_CONDUCT',
  'DISCORD_TRAINING_MANUAL',
  'DISCORD_TRAINING_VIDEO',
  'INCIDENT_FORM',
  'CYBER_SECURITY_SOP',
  'HEALTH_INSURANCE_PRESENTATION',
  'HEALTH_CLAIM_KIT',
] as const

export type AcademyLinkKey = (typeof ACADEMY_LINK_KEYS)[number]
export type AcademyLink = { kind: 'handbook'; slug: string } | { kind: 'url'; url: string }

/** COMPANY_DASHBOARD reads as "Company dashboard". */
export function academyLinkLabel(key: AcademyLinkKey): string {
  const words = key.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const SLUG = /^[a-z0-9-]*$/

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const httpsUrlSchema = z.string().trim().max(2000).refine(isHttpsUrl, 'must be a valid https URL')

export const academyLinkSchema: z.ZodType<AcademyLink> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('handbook'), slug: z.string().max(120).regex(SLUG, 'slug may only use a-z, 0-9 and -') }),
  z.object({ kind: z.literal('url'), url: httpsUrlSchema }),
])

/** A card link may also point at a settings link by key, so HR changes it once under Links & settings. */
export type ConfigLinkRef = { kind: 'config'; key: AcademyLinkKey }
export type CardLinkTarget = AcademyLink | ConfigLinkRef

export const cardLinkSchema: z.ZodType<CardLinkTarget> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('handbook'), slug: z.string().max(120).regex(SLUG, 'slug may only use a-z, 0-9 and -') }),
  z.object({ kind: z.literal('url'), url: httpsUrlSchema }),
  z.object({ kind: z.literal('config'), key: z.enum(ACADEMY_LINK_KEYS) }),
])

/** Stored JSON could be anything: re-validate before turning a link into an href. */
export function resolveAcademyLink(link: AcademyLink | null | undefined): string | null {
  const parsed = academyLinkSchema.safeParse(link)
  if (!parsed.success) return null
  const value = parsed.data
  if (value.kind === 'handbook') return value.slug ? `/handbook/${value.slug}` : '/handbook'
  return value.url
}

/** Resolves a card link, looking a config reference up in the settings links; null when unset or invalid. */
export function resolveCardLink(
  link: CardLinkTarget | null | undefined,
  configLinks: Partial<Record<AcademyLinkKey, AcademyLink>>,
): string | null {
  const parsed = cardLinkSchema.safeParse(link)
  if (!parsed.success) return null
  const value = parsed.data
  if (value.kind !== 'config') return resolveAcademyLink(value)
  return resolveAcademyLink(configLinks[value.key])
}

/** Keeps only known keys with valid links; reports each dropped key. Never throws. */
export function sanitizeStoredLinks(
  stored: unknown,
  onDrop?: (key: string) => void,
): Partial<Record<AcademyLinkKey, AcademyLink>> {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  const known = new Set<string>(ACADEMY_LINK_KEYS)
  const out: Partial<Record<AcademyLinkKey, AcademyLink>> = {}
  for (const [key, value] of Object.entries(stored)) {
    const parsed = known.has(key) ? academyLinkSchema.safeParse(value) : null
    if (parsed?.success) out[key as AcademyLinkKey] = parsed.data
    else onDrop?.(key)
  }
  return out
}

export const eligibilityRulesSchema = z.object({
  countries: z.array(z.string().regex(/^[A-Z]{2}$/, 'use a two-letter ISO code in capitals')).max(50),
  workModes: z.array(z.enum(WORK_MODES)),
  contractTypes: z.array(z.enum(CONTRACT_TYPES)),
  employmentStatuses: z.array(z.enum(EMPLOYMENT_STATUSES)),
})

export const libraryCardSchema = z
  .object({
    kind: z.enum(['BENEFIT', 'REIMBURSEMENT']),
    title: z.string().trim().min(1).max(120),
    icon: z.string().regex(/^[A-Z][A-Za-z0-9]+$/, 'use a Lucide icon name such as HeartPulse'),
    body: z.string().trim().min(1).max(5000),
    links: z.array(z.object({ label: z.string().trim().min(1).max(80), link: cardLinkSchema })).max(5),
  })
  .extend(eligibilityRulesSchema.shape)

export type LibraryCardInput = z.infer<typeof libraryCardSchema>

export interface AcademyConfigView {
  links: Partial<Record<AcademyLinkKey, AcademyLink>>
  invoiceTemplates: Record<string, string>
  bankLetterTemplate: string | null
  blockersCallCt: string
  retakeCooldownMinutes: number
  failAlertThreshold: number
  videos: VideoConfigs
}

export const BLOCKERS_CALL_PATTERN = /^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]\d|2[0-3]):[0-5]\d$/

const linksInputSchema = z
  .object(Object.fromEntries(ACADEMY_LINK_KEYS.map((key) => [key, academyLinkSchema.optional()])))
  .strict()

export const academyConfigInputSchema = z.object({
  links: linksInputSchema.optional(),
  invoiceTemplates: z.record(z.string().trim().min(1).max(80), httpsUrlSchema).optional(),
  bankLetterTemplate: z.string().max(10000).nullable().optional(),
  blockersCallCt: z.string().trim().toUpperCase().regex(BLOCKERS_CALL_PATTERN, 'use a format like WED 07:00').optional(),
  retakeCooldownMinutes: z.number().int().min(0).max(525600).optional(),
  failAlertThreshold: z.number().int().min(1).max(1000).optional(),
  videos: videoConfigsSchema.optional(),
})

export type AcademyConfigInput = z.infer<typeof academyConfigInputSchema>
