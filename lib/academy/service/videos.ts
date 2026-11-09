import { z } from 'zod'
import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { VIDEO_KEYS, readVideo, videoConfigSchema, type VideoConfigs, type VideoKey } from '../video'

const CONFIG_ID = 'singleton'
const CONFLICT_MESSAGE = 'Someone else changed the videos. Reload to see their changes.'

export interface VideoSettingsView {
  videos: VideoConfigs
  /** Keys with something stored that no longer validates. */
  unreadable: VideoKey[]
  /** Sent back on save so a stale page is refused. Null when no config row exists yet. */
  updatedAt: string | null
}

export const videoSaveSchema = z.object({
  key: z.enum(VIDEO_KEYS),
  video: videoConfigSchema.nullable(),
  expectedUpdatedAt: z.string().datetime().nullable(),
})

function storedObject(stored: unknown): Record<string, unknown> {
  return typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {}
}

export async function getVideoSettings(db: PrismaClient): Promise<VideoSettingsView> {
  const row = await db.onboardingConfig.findUnique({ where: { id: CONFIG_ID }, select: { videos: true, updatedAt: true } })
  const raw = storedObject(row?.videos)
  const videos: VideoConfigs = {}
  const unreadable: VideoKey[] = []
  for (const key of VIDEO_KEYS) {
    const video = readVideo(raw, key)
    if (video) videos[key] = video
    else if (raw[key] !== undefined && raw[key] !== null) unreadable.push(key)
  }
  return { videos, unreadable, updatedAt: row ? row.updatedAt.toISOString() : null }
}

/**
 * Replaces one video (or removes it with null) and leaves the other exactly as stored.
 * The write only lands if the config is unchanged since the page loaded; otherwise 409.
 */
export async function saveVideo(db: PrismaClient, input: unknown): Promise<VideoSettingsView> {
  const { key, video, expectedUpdatedAt } = videoSaveSchema.parse(input)
  const row = await db.onboardingConfig.findUnique({ where: { id: CONFIG_ID }, select: { videos: true, updatedAt: true } })
  if ((row?.updatedAt.toISOString() ?? null) !== expectedUpdatedAt) throw new AcademyError(CONFLICT_MESSAGE, 409)

  const { [key]: _replaced, ...others } = storedObject(row?.videos)
  const next = (video ? { ...others, [key]: video } : others) as Prisma.InputJsonObject

  if (!row) {
    try {
      await db.onboardingConfig.create({ data: { id: CONFIG_ID, videos: next } })
    } catch {
      throw new AcademyError(CONFLICT_MESSAGE, 409)
    }
  } else {
    const result = await db.onboardingConfig.updateMany({
      where: { id: CONFIG_ID, updatedAt: row.updatedAt },
      data: { videos: next },
    })
    if (result.count === 0) throw new AcademyError(CONFLICT_MESSAGE, 409)
  }
  return getVideoSettings(db)
}
