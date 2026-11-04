// Pure request-shaping helpers for the profile routes. No server-only imports.
import { z } from 'zod'
import { stripHtml } from '../sanitize'
import type { PersonAttributes } from './attributes'

export const ATTRIBUTE_KEYS = [
  'officeLocation',
  'remoteCountry',
  'workMode',
  'contractType',
  'employmentStatus',
] as const satisfies ReadonlyArray<keyof PersonAttributes>

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

/** Empty or whitespace-only input clears the value. */
const emptyToNull = (value: string): string | null => (value === '' ? null : value)

export const selfContactExtrasShape = {
  discordUsername: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((value) => (typeof value === 'string' ? emptyToNull(stripHtml(value).trim()) : value)),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === '' || LINKEDIN_URL.test(value), 'LinkedIn must be an https://linkedin.com/… address')
    .nullable()
    .optional()
    .transform((value) => (typeof value === 'string' ? emptyToNull(value) : value)),
}
