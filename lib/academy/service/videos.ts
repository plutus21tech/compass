import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Prisma, type PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { VIDEO_KEYS, readVideo, videoConfigSchema, type VideoConfigs, type VideoKey } from '../video'

const CONFIG_ID = 'singleton'
const CONFLICT_MESSAGE = 'Someone else changed this video. Reload to see their changes.'
/** Other settings share the row, so a write can lose a race with them; it reads again and retries. */
const MAX_WRITE_TRIES = 3

export interface VideoSettingsView {
  videos: VideoConfigs
  /** Keys with something stored that no longer validates. */
  unreadable: VideoKey[]
  /** When the config row last changed. Null when no config row exists yet. */
  updatedAt: string | null
  /** A fingerprint of what each key holds, sent back on save so a page with a stale copy is refused. */
  versions: Record<VideoKey, string>
}

export const videoSaveSchema = z.object({
  key: z.enum(VIDEO_KEYS),
  video: videoConfigSchema.nullable(),
  expectedVersion: z.string().min(1).max(100),
})

type ConfigRow = { videos: Prisma.JsonValue; updatedAt: Date } | null

function storedObject(stored: unknown): Record<string, unknown> {
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
}

/** Same stored value, same fingerprint. Absent and null count as the same: no video. */
function versionOf(stored: unknown): string {
  return createHash('sha256').update(JSON.stringify(stored ?? null)).digest('base64url').slice(0, 22)
}

const readRow = (db: PrismaClient): Promise<ConfigRow> =>
  db.onboardingConfig.findUnique({ where: { id: CONFIG_ID }, select: { videos: true, updatedAt: true } })

function toView(row: ConfigRow): VideoSettingsView {
  const raw = storedObject(row?.videos)
  const videos: VideoConfigs = {}
  const unreadable: VideoKey[] = []
  for (const key of VIDEO_KEYS) {
    const video = readVideo(raw, key)
    if (video) videos[key] = video
    else if (raw[key] !== undefined && raw[key] !== null) unreadable.push(key)
  }
  const versions = { VIDEO_1: versionOf(raw.VIDEO_1), VIDEO_2: versionOf(raw.VIDEO_2) }
  return { videos, unreadable, updatedAt: row ? row.updatedAt.toISOString() : null, versions }
}

export async function getVideoSettings(db: PrismaClient): Promise<VideoSettingsView> {
  return toView(await readRow(db))
}

const isUniqueClash = (error: unknown) =>
  (error instanceof Prisma.PrismaClientKnownRequestError || (typeof error === 'object' && error !== null && 'code' in error)) &&
  (error as { code?: unknown }).code === 'P2002'

/** One attempt. False when the row moved under it (another setting, or the row being created), so it can retry. */
async function tryWrite(db: PrismaClient, row: ConfigRow, next: Prisma.InputJsonObject): Promise<boolean> {
  if (!row) {
    try {
      await db.onboardingConfig.create({ data: { id: CONFIG_ID, videos: next } })
      return true
    } catch (error) {
      if (isUniqueClash(error)) return false
      throw error
    }
  }
  const result = await db.onboardingConfig.updateMany({ where: { id: CONFIG_ID, updatedAt: row.updatedAt }, data: { videos: next } })
  return result.count > 0
}

/**
 * Replaces one video (or removes it with null) and leaves the other exactly as stored. Refused with
 * 409 only when this video changed since the page loaded: another video or setting saved meanwhile
 * is written around, never over.
 */
export async function saveVideo(db: PrismaClient, input: unknown): Promise<VideoSettingsView> {
  const { key, video, expectedVersion } = videoSaveSchema.parse(input)
  for (let attempt = 0; attempt < MAX_WRITE_TRIES; attempt += 1) {
    const row = await readRow(db)
    const stored = storedObject(row?.videos)
    if (versionOf(stored[key]) !== expectedVersion) throw new AcademyError(CONFLICT_MESSAGE, 409)
    const { [key]: _replaced, ...others } = stored
    const next = (video ? { ...others, [key]: video } : others) as Prisma.InputJsonObject
    if (await tryWrite(db, row, next)) return getVideoSettings(db)
  }
  throw new AcademyError('The videos are busy being saved. Try again in a moment.', 409)
}
