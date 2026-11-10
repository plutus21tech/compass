// Pure rules for new-hire setup and team lead input. No server-only imports: safe for client components.
import { z } from 'zod'
import { missingAttributes, partialAttributesSchema, type PersonAttributes } from './attributes'
import { ATTRIBUTE_LABELS, SETUP_FIELD_LABELS, describeLeadIssues } from './labels'

const DAY_MS = 24 * 60 * 60 * 1000
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
export const COMPANY_WINGS = ['CAPITAL', 'PARTNERS'] as const

const text = (max: number) => z.string().trim().min(1).max(max)
const timeOfDay = z.string().regex(TIME_OF_DAY)
const httpsUrl = z.string().trim().max(2000).pipe(z.url({ protocol: /^https$/ }))

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
const blankable = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (isBlank(value) ? null : value), schema.nullable())
const optionalDate = z.preprocess((value) => (isBlank(value) ? null : new Date(value as string)), z.date().nullable())
const requiredDate = z.preprocess((value) => (isBlank(value) ? undefined : new Date(value as string)), z.date())

/**
 * One whole-form save. Only title and joining date are required, because NewHire requires them;
 * any other field may be blank and stay null, and getSetupReadiness decides what is still missing.
 * Whatever is present is validated. Blank or absent both mean empty.
 */
export const setupSchema = z
  .object({
    preferredName: blankable(text(100)),
    title: text(200),
    department: blankable(text(200)),
    companyWing: blankable(z.enum(COMPANY_WINGS)),
    clientAccount: blankable(text(200)),
    attributes: partialAttributesSchema,
    onboardingDate: requiredDate,
    hrCallAt: optionalDate,
    teamCallAt: optionalDate,
    securityCallAt: optionalDate,
    teamLeadId: blankable(text(100)),
    teamMemberIds: z.array(text(100)).max(100).nullish(),
    buddyId: blankable(text(100)),
    coreHoursStart: blankable(timeOfDay),
    coreHoursEnd: blankable(timeOfDay),
    /** Not saved: lets the schema reject a hire being their own buddy. */
    hireUserId: z.string().nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.coreHoursStart && v.coreHoursEnd && v.coreHoursStart >= v.coreHoursEnd) {
      ctx.addIssue({ code: 'custom', path: ['coreHoursEnd'], message: 'Core hours must end after they start.' })
    }
    if (v.hireUserId && v.teamMemberIds?.includes(v.hireUserId)) {
      ctx.addIssue({ code: 'custom', path: ['teamMemberIds'], message: 'The new hire cannot be on their own team list.' })
    }
    if (v.hireUserId && v.buddyId === v.hireUserId) {
      ctx.addIssue({ code: 'custom', path: ['buddyId'], message: 'The buddy cannot be the new hire.' })
    }
  })
  .transform(({ hireUserId: _ignored, teamMemberIds, ...rest }) => ({
    ...rest,
    teamMemberIds: [...new Set(teamMemberIds ?? [])],
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

type LeadResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> {
  return (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
}

/** Text keys the request sent empty, as opposed to ones it left out. */
function textKeysSentBlank(source: Record<string, unknown>): string[] {
  return TEXT_KEYS.filter((key) => key in source && isBlank(source[key]))
}

/**
 * What a draft save writes. A key absent from the request is left alone; a text key sent blank
 * is cleared. Returns an error message when the sent values are invalid.
 */
export function buildLeadDraftData(body: unknown): LeadResult {
  const source = asRecord(body)
  const parsed = leadInputDraftSchema.safeParse(normalizeLeadInputBody(source))
  if (!parsed.success) return { ok: false, error: describeLeadIssues(parsed.error) }
  const cleared: Record<string, unknown> = {}
  for (const key of textKeysSentBlank(source)) cleared[key] = null
  for (const key of LIST_KEYS) if (key in source && !Array.isArray(source[key])) cleared[key] = []
  return { ok: true, data: { ...cleared, ...parsed.data } }
}

/**
 * What a submit writes. An absent key falls back to the stored value; a key sent blank is blank,
 * so blanking a required goal fails validation and the optional Day 1 goal can be cleared.
 */
export function buildLeadSubmitData(stored: unknown, body: unknown): LeadResult {
  const source = asRecord(body)
  const blank = textKeysSentBlank(source)
  const merged = { ...normalizeLeadInputBody(stored), ...normalizeLeadInputBody(source) }
  const kept = Object.fromEntries(Object.entries(merged).filter(([key]) => !blank.includes(key)))
  const parsed = leadInputSchema.safeParse(kept)
  if (!parsed.success) return { ok: false, error: describeLeadIssues(parsed.error) }
  return { ok: true, data: { ...Object.fromEntries(blank.map((key) => [key, null])), ...parsed.data } }
}

/** Submitted means the form was submitted and what is stored now still passes the schema. */
export function isLeadInputSubmitted(form: { submittedAt?: unknown } | null | undefined): boolean {
  if (!form?.submittedAt) return false
  return leadInputSchema.safeParse(normalizeLeadInputBody(form)).success
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
  securityCallAt: Date | null
  teamLeadId: string | null
  teamMemberIds: string[]
  buddyId: string | null
  coreHoursStart: string | null
  coreHoursEnd: string | null
  userLinked: boolean
  leadInputSubmitted: boolean
}

export type MissingItem = { key: string; label: string }

type ScalarKey =
  | 'preferredName' | 'title' | 'department' | 'companyWing' | 'onboardingDate' | 'hrCallAt'
  | 'teamCallAt' | 'teamLeadId' | 'buddyId' | 'coreHoursStart' | 'coreHoursEnd'

const LEADING_FIELDS: ScalarKey[] = [
  'preferredName', 'title', 'department', 'companyWing', 'onboardingDate', 'hrCallAt', 'teamCallAt', 'teamLeadId',
]

const TRAILING_FIELDS: ScalarKey[] = ['buddyId', 'coreHoursStart', 'coreHoursEnd']

export function getSetupReadiness(input: SetupSnapshot): { ready: boolean; missing: MissingItem[] } {
  const missing: MissingItem[] = []
  const check = (key: ScalarKey) => {
    if (!input[key]) missing.push({ key, label: SETUP_FIELD_LABELS[key] })
  }
  if (!input.userLinked) missing.push({ key: 'account', label: 'No Compass account linked' })
  LEADING_FIELDS.forEach(check)
  for (const key of missingAttributes(input.attributes)) missing.push({ key, label: ATTRIBUTE_LABELS[key] })
  if (input.teamMemberIds.length === 0) missing.push({ key: 'teamMemberIds', label: SETUP_FIELD_LABELS.teamMemberIds })
  TRAILING_FIELDS.forEach(check)
  if (!input.leadInputSubmitted) {
    missing.push({ key: 'leadInput', label: 'Team lead input (role expectations, goals)' })
  }
  return { ready: missing.length === 0, missing }
}

/** With the Academy on, these belong to the setup section; the top new-hire form must not send them. */
const SETUP_OWNED_KEYS = ['title', 'department', 'teamLeadId', 'buddyId', 'onboardingDate'] as const
type SetupOwnedKey = (typeof SETUP_OWNED_KEYS)[number]

export function withoutSetupOwnedFields<T extends Record<string, unknown>>(form: T): Omit<T, SetupOwnedKey> {
  const owned: readonly string[] = SETUP_OWNED_KEYS
  return Object.fromEntries(Object.entries(form).filter(([key]) => !owned.includes(key))) as Omit<T, SetupOwnedKey>
}

/** Only HR sets up a new hire. */
export function setupAccessGate(role: string | null | undefined): 'allow' | 'forbidden' {
  return role === 'HR' ? 'allow' : 'forbidden'
}

