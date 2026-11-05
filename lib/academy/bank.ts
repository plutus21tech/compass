// Pure rules for the fields a hire saves in the course. No server-only imports.
import { z } from 'zod'
import { stripHtml } from '../sanitize'

const IBAN_PATTERN = /^PK\d{2}[A-Z]{4}\d{16}$/
const IBAN_MESSAGE = "That IBAN doesn't look right. It should start with PK and have 24 characters."
const MASK = '••••'
const MASK_VISIBLE = 4

// encryptSensitiveValue passes through any value carrying its prefix, so a stored value could later
// fail to decrypt. Reject the prefix on every encrypted free-text field.
const plain = (max: number) =>
  z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .max(max)
    .refine((v) => !v.toLowerCase().includes('p21enc:'), 'This value is not allowed')

export const bankDetailsSchema = z.object({
  accountTitle: plain(200),
  bankName: plain(200),
  branch: plain(200),
  iban: z
    .string()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine((v) => IBAN_PATTERN.test(v), IBAN_MESSAGE),
})

export type BankDetailsInput = z.infer<typeof bankDetailsSchema>

/** Keeps the last 4 characters; everything before them is hidden. */
export function maskIban(iban: string): string {
  return `${MASK}${iban.slice(-MASK_VISIBLE)}`
}

const DISCORD_PATTERN = /^[A-Za-z0-9_.#]{2,37}$/

export const discordUsernameSchema = z
  .string()
  .trim()
  .refine((v) => DISCORD_PATTERN.test(v), 'Discord usernames use letters, numbers, dots and underscores, with no spaces.')

const LINKEDIN_MESSAGE = 'LinkedIn must be a full https link, like https://www.linkedin.com/in/your-name.'
const LINKEDIN_MAX = 300

function isLinkedinUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return host === 'linkedin.com' || host.endsWith('.linkedin.com')
}

export const linkedinUrlSchema = z
  .string()
  .trim()
  .max(LINKEDIN_MAX, 'LinkedIn link is too long.')
  .refine(isLinkedinUrl, LINKEDIN_MESSAGE)
  .transform((v) => stripHtml(v).trim())

/**
 * The admin users listing sends a profile to the browser. iban and branch are not needed there,
 * so they never leave the server. Returns a new object.
 */
export function omitBankIdentifiers<T extends { iban?: unknown; branch?: unknown } | null | undefined>(
  profile: T,
): T extends null | undefined ? T : Omit<NonNullable<T>, 'iban' | 'branch'> {
  if (!profile) return profile as never
  const { iban: _iban, branch: _branch, ...rest } = profile
  return rest as never
}
