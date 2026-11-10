// Pure request-shaping helpers for the profile routes. No server-only imports.
import { z } from 'zod'
import { stripHtml } from '../sanitize'
import { ATTRIBUTE_KEYS, type PersonAttributes } from './attributes'

export { ATTRIBUTE_KEYS }

export function hasAttributeKeys(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  return ATTRIBUTE_KEYS.some((key) => key in body)
}

/** The stored attributes with any attribute keys present in the body laid over them. */
export function mergeAttributePatch(current: PersonAttributes, body: unknown): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (typeof body === 'object' && body !== null) {
    for (const key of ATTRIBUTE_KEYS) {
      if (key in body) patch[key] = (body as Record<string, unknown>)[key]
    }
  }
  return { ...current, ...patch }
}

const LINKEDIN_URL = /^https:\/\/(www\.)?linkedin\.com\/\S+$/i

const LINKEDIN_MESSAGE = 'LinkedIn must be a full https link, like https://www.linkedin.com/in/your-name.'

/** Empty or whitespace-only input clears the value. */
const emptyToNull = (value: string): string | null => (value === '' ? null : value)

export const selfContactExtrasShape = {
  discordUsername: z
    .string()
    .trim()
    .max(100, 'Discord username is too long.')
    .nullable()
    .optional()
    .transform((value) => (typeof value === 'string' ? emptyToNull(stripHtml(value).trim()) : value)),
  linkedinUrl: z
    .string()
    .trim()
    .max(300, 'LinkedIn link is too long.')
    .refine((value) => value === '' || LINKEDIN_URL.test(value), LINKEDIN_MESSAGE)
    .nullable()
    .optional()
    .transform((value) => (typeof value === 'string' ? emptyToNull(value) : value)),
}

/** The message for a bad contact field, which a person can act on; null for any other problem. */
export function contactFieldError(error: z.ZodError): string | null {
  const issue = error.issues.find(({ path }) => path[0] === 'linkedinUrl' || path[0] === 'discordUsername')
  return issue ? issue.message : null
}

export type AttributeGate = 'ignore' | 'allow' | 'forbidden'

/** Admin PUT: flag off or no attribute keys -> ignored as unknown keys; otherwise only HR may write. */
export function adminAttributeGate(enabled: boolean, role: string, body: unknown): AttributeGate {
  if (!enabled || !hasAttributeKeys(body)) return 'ignore'
  return role === 'HR' ? 'allow' : 'forbidden'
}

/** Self-service PUT: attribute keys are never allowed once the Academy is on. */
export function selfAttributeGate(enabled: boolean, body: unknown): Exclude<AttributeGate, 'allow'> {
  return enabled && hasAttributeKeys(body) ? 'forbidden' : 'ignore'
}

/** The new-hire link step copies setup onto the account only with the Academy on. */
export function shouldCopyNewHireSetup(enabled: boolean): boolean {
  return enabled
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
}

/** Fills only the empty fields from a suggestion; never overwrites a value already set. */
export function applyPrefill(current: PersonAttributes, suggestion: Partial<PersonAttributes>): PersonAttributes {
  const officeLocation = current.officeLocation ?? suggestion.officeLocation ?? null
  return {
    officeLocation,
    remoteCountry: current.remoteCountry ?? (officeLocation === 'REMOTE' ? suggestion.remoteCountry ?? null : null),
    workMode: current.workMode ?? suggestion.workMode ?? null,
    contractType: current.contractType ?? suggestion.contractType ?? null,
    employmentStatus: current.employmentStatus ?? suggestion.employmentStatus ?? null,
  }
}
