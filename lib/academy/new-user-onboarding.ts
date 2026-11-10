// Pure rules for starting onboarding straight from HR's create-user form. No server-only imports.
import { missingAttributes, partialAttributesSchema, type PersonAttributes } from './attributes'
import { ATTRIBUTE_LABELS, SETUP_FIELD_LABELS } from './labels'

export interface NewUserOnboarding {
  joiningDate: Date
  attributes: PersonAttributes
}

export type NewUserOnboardingResult = { ok: true; data: NewUserOnboarding } | { ok: false; error: string }

const DEFAULT_HIRE_TITLE = 'New hire'

function asRecord(value: unknown): Record<string, unknown> {
  return (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
}

function readJoiningDate(value: unknown): Date | null | 'invalid' {
  if (typeof value !== 'string' || value.trim() === '') return null
  const date = new Date(value.trim())
  return Number.isNaN(date.getTime()) ? 'invalid' : date
}

/**
 * What the create-user form must carry when "requires onboarding" is ticked: a joining date and the four
 * attributes, because they decide which modules and blocks the hire sees and when. Everything else about
 * the hire's setup is optional and filled in later on the new-hire page.
 */
export function parseNewUserOnboarding(body: unknown): NewUserOnboardingResult {
  const source = asRecord(body)
  const joiningDate = readJoiningDate(source.joiningDate)
  if (joiningDate === 'invalid') return { ok: false, error: 'The joining date is not a valid date.' }

  // The remote-country rule is reported with the other gaps below, not as a schema error.
  const parsed = partialAttributesSchema.safeParse(
    source.officeLocation === 'REMOTE' && !source.remoteCountry ? { ...source, officeLocation: null } : source,
  )
  if (!parsed.success) return { ok: false, error: 'One of the onboarding details has a value Compass does not know.' }

  const attributes: PersonAttributes = source.officeLocation === 'REMOTE' && !source.remoteCountry
    ? { ...parsed.data, officeLocation: 'REMOTE', remoteCountry: null }
    : parsed.data
  const gaps = [
    ...(joiningDate ? [] : [SETUP_FIELD_LABELS.onboardingDate]),
    ...missingAttributes(attributes).map((key) => ATTRIBUTE_LABELS[key]),
  ]
  if (gaps.length > 0 || !joiningDate) return { ok: false, error: `To start onboarding, fill in: ${gaps.join(', ')}.` }
  return { ok: true, data: { joiningDate, attributes } }
}

/** The hire record needs a job title; the user's position is used, or a plain fallback HR can change later. */
export function hireTitleFor(position: string | null | undefined): string {
  const trimmed = typeof position === 'string' ? position.trim() : ''
  return trimmed || DEFAULT_HIRE_TITLE
}
