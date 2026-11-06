import { Prisma, type OnboardingCompletionRule, type OnboardingModule, type PrismaClient } from '@prisma/client'
import { parseBlocks, type Block } from '../blocks'
import { STALE_CONTENT_MESSAGE, moduleDetailsSchema, publishProblems, type ModuleDetails } from '../content-rules'
import { AcademyError } from '../errors'
import { requestReread, type AssignmentNotice } from './assignment'
import { COURSE_TX_OPTIONS, isCourseModule, listCourseModules, type CourseModule } from './progress'

type Tx = Prisma.TransactionClient

const MAX_DRAFT_CHARS = 200_000
const PHASE_LABELS = { DAY_1: 'Day 1', WEEK_1: 'Week 1' } as const

const notFound = () => new AcademyError('Module not found', 404)
const toJson = (value: unknown) => value as Prisma.InputJsonValue

export interface FreshnessCheck {
  /** The `updatedAt` the editor loaded. Left out, the write isn't checked. */
  expectedUpdatedAt?: string
}

export interface ContentModuleRow {
  id: string
  number: number
  title: string
  phase: string
  version: number
  publishedAt: string
  hasDraft: boolean
}

export interface ContentView {
  id: string
  slug: string
  number: number
  rule: OnboardingCompletionRule
  details: ModuleDetails
  /** The draft when there is one, otherwise the current version. Placeholders stay as {…}. */
  blocks: Block[]
  hasDraft: boolean
  version: number
  publishedAt: string
  changeNote: string | null
  updatedAt: string
}

const liveDetails = (module: OnboardingModule): ModuleDetails => ({
  title: module.title,
  estimatedMinutes: module.estimatedMinutes ?? 1,
  headlineLead: module.headlineLead ?? '',
  headlineAccent: module.headlineAccent ?? '',
})

export async function listContentModules(db: PrismaClient): Promise<ContentModuleRow[]> {
  const modules = await listCourseModules(db)
  const versions = await db.onboardingModuleVersion.findMany({
    where: { id: { in: modules.map((m) => m.currentVersionId) } },
    select: { id: true, version: true, publishedAt: true },
  })
  const versionOf = new Map(versions.map((v) => [v.id, v]))
  return modules.flatMap((module, index) => {
    const current = versionOf.get(module.currentVersionId)
    if (!current) return []
    return [{
      id: module.id,
      number: index + 1,
      title: module.title,
      phase: PHASE_LABELS[module.phase],
      version: current.version,
      publishedAt: current.publishedAt.toISOString(),
      hasDraft: module.draftBlocks !== null,
    }]
  })
}

export async function loadContent(db: PrismaClient, moduleId: string): Promise<ContentView> {
  const modules = await listCourseModules(db)
  const index = modules.findIndex((m) => m.id === moduleId)
  if (index < 0) throw notFound()
  const module = modules[index]
  const current = await db.onboardingModuleVersion.findUniqueOrThrow({ where: { id: module.currentVersionId } })
  const hasDraft = module.draftBlocks !== null
  return {
    id: module.id,
    slug: module.slug,
    number: index + 1,
    rule: module.completionRule,
    details: module.draftDetails === null ? liveDetails(module) : moduleDetailsSchema.parse(module.draftDetails),
    blocks: parseBlocks(hasDraft ? module.draftBlocks : current.blocks),
    hasDraft,
    version: current.version,
    publishedAt: current.publishedAt.toISOString(),
    changeNote: current.changeNote,
    updatedAt: module.updatedAt.toISOString(),
  }
}

/** Holds the module until the transaction ends, so two people's writes queue and the check can't be crossed. */
async function lockCourseModule(tx: Tx, moduleId: string, { expectedUpdatedAt }: FreshnessCheck): Promise<CourseModule> {
  await tx.$queryRaw`SELECT id FROM "OnboardingModule" WHERE id = ${moduleId} FOR NO KEY UPDATE`
  const module = await tx.onboardingModule.findUnique({ where: { id: moduleId } })
  if (!module || !module.isActive || !isCourseModule(module)) throw notFound()
  if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== module.updatedAt.getTime()) {
    throw new AcademyError(STALE_CONTENT_MESSAGE, 409)
  }
  return module
}

export interface SaveDraftOptions extends FreshnessCheck {
  details?: unknown
}

/** Hires never see this: they read versions only. Rules wait for publish, so unfinished work can be saved. */
export async function saveDraft(
  db: PrismaClient, moduleId: string, blocks: unknown, options: SaveDraftOptions = {},
): Promise<{ updatedAt: string }> {
  const parsed = parseBlocks(blocks)
  if (JSON.stringify(parsed).length > MAX_DRAFT_CHARS) throw new AcademyError('This module is too long to save. Take some text out.', 400)
  const details = options.details === undefined ? undefined : moduleDetailsSchema.parse(options.details)
  return db.$transaction(async (tx) => {
    await lockCourseModule(tx, moduleId, options)
    const saved = await tx.onboardingModule.update({
      where: { id: moduleId },
      data: { draftBlocks: toJson(parsed), ...(details ? { draftDetails: toJson(details) } : {}) },
    })
    return { updatedAt: saved.updatedAt.toISOString() }
  }, COURSE_TX_OPTIONS)
}

export async function discardDraft(db: PrismaClient, moduleId: string, options: FreshnessCheck = {}): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockCourseModule(tx, moduleId, options)
    await tx.onboardingModule.update({
      where: { id: moduleId },
      data: { draftBlocks: Prisma.DbNull, draftDetails: Prisma.DbNull },
    })
  }, COURSE_TX_OPTIONS)
}

async function nextVersion(tx: Tx, moduleId: string): Promise<number> {
  const { _max } = await tx.onboardingModuleVersion.aggregate({ where: { moduleId }, _max: { version: true } })
  return (_max.version ?? 0) + 1
}

export interface PublishInput extends FreshnessCheck {
  changeNote: string
  askReread: boolean
}

export interface PublishResult {
  version: number
  reopened?: number
  /** Pass to notifyAssigned after this returns, or a re-read sends no mail. */
  notice?: AssignmentNotice
  /** The version went live but the re-read didn't: it can't be undone, so it isn't an error. */
  rereadFailed?: true
}

type Reread = (db: PrismaClient, moduleId: string, actorId: string) => Promise<{ reopened: number; notice: AssignmentNotice }>

async function publishDraft(db: PrismaClient, moduleId: string, input: PublishInput, changeNote: string, actorId: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const module = await lockCourseModule(tx, moduleId, input)
    if (module.draftBlocks === null) throw new AcademyError('There is nothing to publish. Make a change first.', 409)
    const blocks = parseBlocks(module.draftBlocks)
    const problems = publishProblems(module.completionRule, blocks)
    if (problems.length > 0) throw new AcademyError(`This can't be published yet. ${problems.join(' ')}`, 409)
    const details = module.draftDetails === null ? {} : moduleDetailsSchema.parse(module.draftDetails)

    const version = await nextVersion(tx, moduleId)
    const created = await tx.onboardingModuleVersion.create({
      data: { moduleId, version, blocks: toJson(blocks), publishedById: actorId, changeNote },
    })
    await tx.onboardingModule.update({
      where: { id: moduleId },
      data: { ...details, currentVersionId: created.id, draftBlocks: Prisma.DbNull, draftDetails: Prisma.DbNull },
    })
    return version
  }, COURSE_TX_OPTIONS)
}

/**
 * One transaction makes the version live and clears the draft. A re-read is its own long transaction
 * after that, so it reopens rows on the new version; if it fails the version stands and the result says so.
 */
export async function publishModule(
  db: PrismaClient, moduleId: string, input: PublishInput, actorId: string,
  { reread = requestReread }: { reread?: Reread } = {},
): Promise<PublishResult> {
  const changeNote = input.changeNote.trim()
  if (!changeNote) throw new AcademyError('Add a short note about what changed.', 400)
  const version = await publishDraft(db, moduleId, input, changeNote, actorId)
  if (!input.askReread) return { version }
  try {
    const { reopened, notice } = await reread(db, moduleId, actorId)
    return { version, reopened, notice }
  } catch (error) {
    console.error('[academy] re-read failed after publish', { moduleId, version, error: error instanceof Error ? error.name : 'unknown' })
    return { version, rereadFailed: true }
  }
}
