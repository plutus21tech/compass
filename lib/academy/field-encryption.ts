import crypto from 'crypto'

// Onboarding keeps its own key, so nothing here depends on payroll's. Each value is AES-256-GCM,
// with its label bound in as AAD: a value copied to another column will not open.
const KEY_NAME = 'ONBOARDING_FIELD_ENCRYPTION_KEY'
const ENCRYPTION_PREFIX = 'p21enc:v1'
const KEY_BYTES = 32

function readKey(): Buffer | null {
  const raw = process.env[KEY_NAME]?.trim()
  if (!raw) return null
  if (/^[a-fA-F0-9]{64}$/.test(raw)) return Buffer.from(raw, 'hex')
  const base64 = Buffer.from(raw, 'base64')
  if (base64.length === KEY_BYTES) return base64
  const utf8 = Buffer.from(raw, 'utf8')
  if (utf8.length === KEY_BYTES) return utf8
  throw new Error(`${KEY_NAME} must be a 32-byte base64, 64-character hex, or 32-character string key`)
}

function requireKey(): Buffer {
  const key = readKey()
  if (!key) throw new Error(`${KEY_NAME} is required to save or read onboarding payment details`)
  return key
}

function isEncrypted(value: string): boolean {
  return value.startsWith(`${ENCRYPTION_PREFIX}:`)
}

/** Blank input stays null. A value already carrying the prefix is returned as it is. */
export function encryptField(label: string, value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return null
  if (isEncrypted(trimmed)) return trimmed

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', requireKey(), iv)
  cipher.setAAD(Buffer.from(label, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()])

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptField(label: string, value: string | null | undefined): string | null {
  if (!value) return null
  if (!isEncrypted(value)) return value

  const parts = value.split(':')
  if (parts.length !== 5) throw new Error('Invalid encrypted onboarding field format')
  const [, , iv, tag, ciphertext] = parts

  const decipher = crypto.createDecipheriv('aes-256-gcm', requireKey(), Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(label, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8')
}
