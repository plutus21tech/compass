import type { Prisma, PrismaClient } from '@prisma/client'
import type { SafeUser } from '@/lib/auth'
import { AcademyError } from '../errors'
import { VIDEO_KEYS, VIDEO_LANGUAGES, isVideoReady, type VideoKey, type VideoLanguage } from '../video'
import { loadRowFacts } from './context'
import { getAcademyConfig } from './library'
import { collectionFor, listCourseModules, moduleBlocks, versionIdFor } from './progress'

type Db = PrismaClient | Prisma.TransactionClient
type Viewer = Pick<SafeUser, 'id' | 'role'>

const notFound = () => new AcademyError('Not found', 404)
const forbidden = () => new AcademyError("You can't open this video yet.", 403)

const isVideoKey = (key: string): key is VideoKey => (VIDEO_KEYS as readonly string[]).includes(key)
const isLanguage = (language: string): language is VideoLanguage => (VIDEO_LANGUAGES as readonly string[]).includes(language)

/**
 * Whether this person can open a module showing this video, by the same rules as loadModule:
 * a row they may use, not locked, and the video block among the blocks their conditions show.
 */
async function canOpenVideo(db: Db, userId: string, key: VideoKey): Promise<boolean> {
  const modules = await listCourseModules(db)
  const rows = await db.onboardingProgress.findMany({ where: { userId, moduleId: { in: modules.map((m) => m.id) } } })
  for (const row of rows) {
    const module = modules.find((m) => m.id === row.moduleId)
    if (!module || (row.status === 'LOCKED' && !row.unlockedEarlyById)) continue
    const facts = await loadRowFacts(db, userId, row)
    if (!facts) continue
    const blocks = await moduleBlocks(db, versionIdFor(row, module), facts, await collectionFor(db, row))
    if (blocks.some((b) => b.type === 'video' && b.videoKey === key)) return true
  }
  return false
}

/** One language's transcript of a ready video, for someone who can open its module, or HR. */
export async function readTranscript(db: Db, viewer: Viewer, key: string, language: string): Promise<string> {
  if (!isVideoKey(key) || !isLanguage(language)) throw notFound()
  if (viewer.role !== 'HR' && !(await canOpenVideo(db, viewer.id, key))) throw forbidden()
  const video = (await getAcademyConfig(db)).videos[key]
  const text = isVideoReady(video) ? (video.transcripts[language] ?? '') : ''
  if (!text.trim()) throw notFound()
  return text
}
