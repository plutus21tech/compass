import { Prisma, type OnboardingProgress, type PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { parseProgressState } from '../progress'
import {
  latestDue,
  renderBlocks,
  resolveLinkHrefs,
  toHomeQuizView,
  toModuleCard,
  type HomeQuizView,
  type HomeView,
  type ModuleCardView,
  type ModuleView,
  type ReleasedHomeView,
} from '../view'
import { ATTRIBUTE_SELECT } from './attributes'
import { buildAcademyContext, type AcademyContext } from './context'
import {
  COURSE_MODULE_COUNT,
  COURSE_TX_OPTIONS,
  assertModuleOpen,
  courseDueDates,
  evaluateModule,
  findCourseModule,
  listCourseModules,
  moduleBlocks,
  toProgressView,
  versionIdFor,
  type CourseModule,
} from './progress'
import { readQuizState } from './quiz'
import { loadSetup } from './setup'

export type { HomeView, ModuleCardView, ModuleProgressView, ModuleView } from '../view'
export { COURSE_MODULE_COUNT, recomputeDueDates } from './progress'

/**
 * The NewHire row lock makes this once-only and keeps saveSetup from moving the joining date halfway.
 * Rows are written in full, so anything the legacy path created is corrected. Emails come in stage 4.
 */
export async function releaseCourse(db: PrismaClient, newHireId: string, _actorId: string): Promise<{ releasedAt: Date }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "NewHire" WHERE id = ${newHireId} FOR UPDATE`
    const hire = await tx.newHire.findUnique({
      where: { id: newHireId },
      select: {
        onboardingDate: true,
        academyReleasedAt: true,
        userId: true,
        user: { select: { teamTag: true, ...ATTRIBUTE_SELECT } },
      },
    })
    if (!hire) throw new AcademyError('New hire not found', 404)
    if (hire.academyReleasedAt) return { releasedAt: hire.academyReleasedAt }

    const { readiness } = await loadSetup(tx, newHireId)
    const { userId, user } = hire
    if (!readiness.ready || !userId || !user) {
      throw new AcademyError(`The course can't be released yet. Still missing: ${readiness.missing.map((m) => m.label).join(', ')}.`, 409)
    }
    const modules = await listCourseModules(tx)
    if (modules.length !== COURSE_MODULE_COUNT) throw new AcademyError("The Academy content hasn't been loaded yet.", 409)

    const dueDates = await courseDueDates(tx, user, hire.onboardingDate)
    for (const [index, module] of modules.entries()) {
      const row = {
        status: index === 0 ? ('IN_PROGRESS' as const) : ('LOCKED' as const),
        startedAt: null,
        completedAt: null,
        versionId: null,
        state: Prisma.DbNull,
        dueAt: dueDates[module.phase],
        source: 'COURSE' as const,
        assignedById: null,
        unlockedEarlyById: null,
      }
      await tx.onboardingProgress.upsert({
        where: { userId_moduleId: { userId, moduleId: module.id } },
        create: { userId, moduleId: module.id, ...row },
        update: row,
      })
    }
    const releasedAt = new Date()
    await tx.newHire.update({ where: { id: newHireId }, data: { academyReleasedAt: releasedAt } })
    return { releasedAt }
  }, COURSE_TX_OPTIONS)
}

const notFound = () => new AcademyError('Module not found', 404)

function cardsFor(modules: readonly CourseModule[], rows: readonly OnboardingProgress[], now: Date): ModuleCardView[] {
  return modules.map((module, index) => toModuleCard(module, index + 1, rows.find((r) => r.moduleId === module.id), now))
}

async function readRows(db: PrismaClient, userId: string, modules: readonly CourseModule[]): Promise<OnboardingProgress[]> {
  return db.onboardingProgress.findMany({ where: { userId, moduleId: { in: modules.map((m) => m.id) } } })
}

/** A single-statement write of `startedAt`, so it cannot clobber a concurrent change to `state`. */
async function markOpened(db: PrismaClient, row: OnboardingProgress, now: Date): Promise<OnboardingProgress> {
  if (row.startedAt || row.status === 'COMPLETED') return row
  await db.onboardingProgress.updateMany({
    where: { id: row.id, startedAt: null, status: { not: 'COMPLETED' } },
    data: { startedAt: now, status: 'IN_PROGRESS' },
  })
  return { ...row, startedAt: now, status: 'IN_PROGRESS' }
}

function invoiceTemplateHref(context: AcademyContext): string | null {
  const { department, config } = context
  if (!department || !Object.prototype.hasOwnProperty.call(config.invoiceTemplates, department)) return null
  return config.invoiceTemplates[department]
}

export async function loadModule(db: PrismaClient, userId: string, slug: string): Promise<ModuleView> {
  const context = await buildAcademyContext(db, userId)
  if (!context) throw notFound()
  const modules = await listCourseModules(db)
  const { module, index } = findCourseModule(modules, slug)
  const rows = await readRows(db, userId, modules)
  const found = rows.find((r) => r.moduleId === module.id)
  if (!found) throw notFound()
  assertModuleOpen(found, index)

  const now = new Date()
  const row = await markOpened(db, found, now)
  const state = parseProgressState(row.state)
  const blocks = await moduleBlocks(db, versionIdFor(row, module), context)
  const evaluated = await evaluateModule(db, userId, context, module, blocks, state)
  const { payment, acknowledgement } = evaluated
  return {
    slug: module.slug,
    number: index + 1,
    total: modules.length,
    title: module.title,
    headlineLead: module.headlineLead,
    headlineAccent: module.headlineAccent,
    icon: module.icon,
    heroImageUrl: module.heroImageUrl,
    estimatedMinutes: module.estimatedMinutes ?? 0,
    phase: module.phase,
    rail: cardsFor(modules, rows.map((r) => (r.id === row.id ? row : r)), now),
    blocks: renderBlocks(blocks, context.placeholders),
    lead: context.lead,
    team: context.team,
    buddy: context.buddy,
    keyContacts: context.keyContacts,
    tutorials: context.tutorials.map((t) => ({ ...t, opened: Boolean(state.linksOpenedAt[t.key]) })),
    teamTools: context.teamTools,
    callTimes: context.callTimes,
    roleExpectations: context.roleExpectations,
    library: context.library,
    commute: context.commute,
    links: resolveLinkHrefs(context.config.links),
    invoiceTemplateHref: invoiceTemplateHref(context),
    bankSaved: payment.kind === 'PK' && payment.bankSaved,
    payoutSaved: payment.kind === 'OTHER' && payment.payoutSaved,
    securityAcknowledgement: acknowledgement && { ...acknowledgement, signedAt: acknowledgement.signedAt.toISOString() },
    discordUsername: context.discordUsername,
    progress: toProgressView(row, state, evaluated, now),
    nextSlug: modules[index + 1]?.slug ?? null,
  }
}

function toHomeView(context: AcademyContext, cards: ModuleCardView[], quiz: HomeQuizView): ReleasedHomeView {
  return {
    released: true,
    greeting: `WELCOME TO THE TEAM, ${context.placeholders['preferred name']}`,
    title: context.title,
    department: context.department,
    doneCount: cards.filter((c) => c.status === 'COMPLETED').length,
    total: cards.length,
    courseDueAt: latestDue(cards),
    quiz,
    nextModule: cards.find((c) => c.status === 'AVAILABLE' || c.status === 'IN_PROGRESS') ?? null,
    yourCalls: context.callTimes,
    yourBuddy: context.buddy,
    phases: (['DAY_1', 'WEEK_1'] as const).map((phase) => ({ phase, modules: cards.filter((c) => c.phase === phase) })),
  }
}

export async function loadHome(db: PrismaClient, userId: string): Promise<HomeView> {
  const context = await buildAcademyContext(db, userId)
  if (!context) return { released: false }
  const modules = await listCourseModules(db)
  const now = new Date()
  const { status, dueAt, retakeAt, failedCount } = await readQuizState(db, userId, context.config.retakeCooldownMinutes, now)
  const quiz = toHomeQuizView({ status, dueAt, retakeAt: retakeAt?.toISOString() ?? null, failedCount }, now)
  return toHomeView(context, cardsFor(modules, await readRows(db, userId, modules), now), quiz)
}
