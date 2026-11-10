// Pure rules for the fields a hire saves in the course. No server-only imports.
import { z } from 'zod'
import { stripHtml } from '../sanitize'

const IBAN_PATTERN = /^PK\d{2}[A-Z]{4}\d{16}$/
const IBAN_MESSAGE = "That IBAN doesn't look right. It should start with PK and have 24 characters."

export const BANK_LOCKED_MESSAGE = 'Your bank details are saved. To change them, email acct@plutus21.com.'

// Text that looks like a stored ciphertext is never a real detail: refused on every encrypted free-text field.
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
