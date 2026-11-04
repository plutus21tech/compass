// Pure rules for new-hire setup and team lead input. No server-only imports: safe for client components.
import { z } from 'zod'
import { missingAttributes, personAttributesSchema, type PersonAttributes } from './attributes'

const DAY_MS = 24 * 60 * 60 * 1000
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
export const COMPANY_WINGS = ['CAPITAL', 'PARTNERS'] as const

const text = (max: number) => z.string().trim().min(1).max(max)
const timeOfDay = z.string().regex(TIME_OF_DAY, 'Use HH:mm')
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  }, 'Must be an https link')

export const setupSchema = z
  .object({
    preferredName: text(100),
    title: text(200),
    department: text(200),
    companyWing: z.enum(COMPANY_WINGS),
    clientAccount: z.string().trim().max(200).nullish(),
    attributes: personAttributesSchema,
    onboardingDate: z.coerce.date(),
    hrCallAt: z.coerce.date(),
    teamCallAt: z.coerce.date(),
    teamLeadId: text(100),
    teamMemberIds: z.array(text(100)).max(100),
    buddyId: text(100),
    coreHoursStart: timeOfDay,
    coreHoursEnd: timeOfDay,
    /** Not saved: lets the schema reject a hire being their own buddy. */
    hireUserId: z.string().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.coreHoursStart >= v.coreHoursEnd) {
      ctx.addIssue({ code: 'custom', path: ['coreHoursEnd'], message: 'Core hours must end after they start' })
    }
    if (v.hireUserId && v.teamMemberIds.includes(v.hireUserId)) {
      ctx.addIssue({ code: 'custom', path: ['teamMemberIds'], message: 'The new hire cannot be on their own team list' })
    }
    if (v.hireUserId && v.buddyId === v.hireUserId) {
      ctx.addIssue({ code: 'custom', path: ['buddyId'], message: 'The buddy cannot be the new hire' })
    }
  })
  .transform(({ hireUserId: _ignored, clientAccount, teamMemberIds, ...rest }) => ({
    ...rest,
    clientAccount: clientAccount || null,
    teamMemberIds: [...new Set(teamMemberIds)],
  }))

export type SetupInput = z.output<typeof setupSchema>

export const leadInputSchema = z.object({
  roleExpectations: text(10000),
  day1Goal: text(1000).nullish(),
  week1Goal: text(1000),
  month1Goal: text(1000),
  month3Goal: text(1000),
  tutorials: z.array(z.object({ title: text(200), url: httpsUrl })).max(30).default([]),
  teamTools: z
    .array(z.object({ name: text(80), purpose: text(200), url: httpsUrl.nullish() }))
    .max(30)
    .default([]),
})

export type LeadInput = z.output<typeof leadInputSchema>

/** Drafts may be partial; a submit must pass the whole schema. */
export const leadInputDraftSchema = leadInputSchema.partial().extend({
  // No default: an absent list must stay absent, not become an empty one.
  tutorials: leadInputSchema.shape.tutorials.unwrap().optional(),
  teamTools: leadInputSchema.shape.teamTools.unwrap().optional(),
})

function stripBlank(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')))
}

/** Blank text becomes undefined and fully blank list rows are dropped, so a draft can be saved half-filled. */
export function normalizeLeadInputBody(body: unknown): Record<string, unknown> {
  const source = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of ['roleExpectations', 'day1Goal', 'week1Goal', 'month1Goal', 'month3Goal']) {
    const value = source[key]
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim()
  }
  for (const key of ['tutorials', 'teamTools']) {
    const rows = source[key]
    if (!Array.isArray(rows)) continue
    out[key] = rows
      .map((row) => (typeof row === 'object' && row !== null ? stripBlank(row as Record<string, unknown>) : row))
      .filter((row) => !(typeof row === 'object' && row !== null && Object.keys(row).length === 0))
  }
  return out
}

const TEXT_KEYS = ['roleExpectations', 'day1Goal', 'week1Goal', 'month1Goal', 'month3Goal'] as const
const LIST_KEYS = ['tutorials', 'teamTools'] as const

/**
 * What a draft save writes. Flag off: nothing. A key absent from the request is left alone;
 * a text key sent blank is cleared. Returns an error message when the sent values are invalid.
 */
export function buildLeadDraftData(
  enabled: boolean,
  body: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!shouldApplyLeadInput(enabled)) return { ok: true, data: {} }
  const source = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const parsed = leadInputDraftSchema.safeParse(normalizeLeadInputBody(source))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ') }
  }
  const cleared: Record<string, unknown> = {}
  for (const key of TEXT_KEYS) {
    if (typeof source[key] === 'string' && source[key].trim() === '') cleared[key] = null
  }
  for (const key of LIST_KEYS) if (key in source && !Array.isArray(source[key])) cleared[key] = []
  return { ok: true, data: { ...cleared, ...parsed.data } }
}

/** The team lead should fill in their input a week before the hire joins. */
export function leadInputDueAt(joiningDate: Date): Date {
  return new Date(joiningDate.getTime() - 7 * DAY_MS)
}

export interface SetupSnapshot {
  preferredName: string | null
  title: string | null
  department: string | null
  companyWing: 'CAPITAL' | 'PARTNERS' | null
  clientAccount: string | null
  attributes: PersonAttributes
  onboardingDate: Date | null
  hrCallAt: Date | null
  teamCallAt: Date | null
  teamLeadId: string | null
  teamMemberIds: string[]
  buddyId: string | null
  coreHoursStart: string | null
  coreHoursEnd: string | null
  userLinked: boolean
  leadInputSubmitted: boolean
}

export type MissingItem = { key: string; label: string }

const ATTRIBUTE_LABELS: Record<keyof PersonAttributes, string> = {
  officeLocation: 'Office location',
  remoteCountry: 'Remote country',
  workMode: 'Work mode',
  contractType: 'Contract type',
  employmentStatus: 'Employment status',
}

type ScalarKey =
  | 'preferredName' | 'title' | 'department' | 'companyWing' | 'onboardingDate' | 'hrCallAt'
  | 'teamCallAt' | 'teamLeadId' | 'buddyId' | 'coreHoursStart' | 'coreHoursEnd'

const LEADING_FIELDS: Array<[ScalarKey, string]> = [
  ['preferredName', 'Preferred name'],
  ['title', 'Job title'],
  ['department', 'Department'],
  ['companyWing', 'Company wing'],
  ['onboardingDate', 'Joining date'],
  ['hrCallAt', 'HR call'],
  ['teamCallAt', 'Team call'],
  ['teamLeadId', 'Team lead'],
]

const TRAILING_FIELDS: Array<[ScalarKey, string]> = [
  ['buddyId', 'Onboarding buddy'],
  ['coreHoursStart', 'Core hours start'],
  ['coreHoursEnd', 'Core hours end'],
]

export function getSetupReadiness(input: SetupSnapshot): { ready: boolean; missing: MissingItem[] } {
  const missing: MissingItem[] = []
  const check = ([key, label]: [ScalarKey, string]) => {
    if (!input[key]) missing.push({ key, label })
  }
  if (!input.userLinked) missing.push({ key: 'account', label: 'No Compass account linked' })
  LEADING_FIELDS.forEach(check)
  for (const key of missingAttributes(input.attributes)) missing.push({ key, label: ATTRIBUTE_LABELS[key] })
  if (input.teamMemberIds.length === 0) missing.push({ key: 'teamMemberIds', label: 'Team members' })
  TRAILING_FIELDS.forEach(check)
  if (!input.leadInputSubmitted) {
    missing.push({ key: 'leadInput', label: 'Team lead input (role expectations, goals)' })
  }
  return { ready: missing.length === 0, missing }
}

/** Only HR sets up a new hire. */
export function setupAccessGate(role: string | null | undefined): 'allow' | 'forbidden' {
  return role === 'HR' ? 'allow' : 'forbidden'
}

/** The lead-input fields exist only while the Academy is on. */
export function shouldApplyLeadInput(enabled: boolean): boolean {
  return enabled
}
