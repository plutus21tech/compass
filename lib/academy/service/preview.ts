import type { PrismaClient } from '@prisma/client'
import type { SafeUser } from '@/lib/auth'
import { canManageOnboarding } from '@/lib/permissions'
import { filterBlocks, type Block } from '../blocks'
import { effectiveRule, evaluateCompletion, type PaymentFacts } from '../completion'
import { unknownPlaceholdersIn } from '../content-rules'
import { AcademyError } from '../errors'
import { resolveAcademyLink } from '../links'
import {
  PREVIEW_SAMPLES,
  previewConditions,
  previewRequestSchema,
  type PreviewFacts,
  type PreviewView,
} from '../preview'
import { parseProgressState, type ProgressState } from '../progress'
import { moduleVideo, renderBlocks, resolveLinkHrefs, withVideoDetails, type ModuleProgressView, type ModuleView } from '../view'
import { loadPreviewSource, type PreviewSourceView } from './content'
import { contextFromFacts, type AcademyContext, type LearnerFacts } from './context'

export type { PreviewView } from '../preview'

type Viewer = Pick<SafeUser, 'id' | 'role'>

/** A person who isn't there: the chosen facts, and labelled samples for everything set per hire. */
function sampleLearner(facts: PreviewFacts): LearnerFacts {
  const conditions = previewConditions(facts)
  return {
    hasCourse: true,
    name: PREVIEW_SAMPLES.name,
    preferredName: PREVIEW_SAMPLES.preferredName,
    title: PREVIEW_SAMPLES.title,
    department: PREVIEW_SAMPLES.department,
    attributes: conditions.attributes,
    teamTag: null,
    discordUsername: null,
    conditions,
    coreHoursStart: null,
    coreHoursEnd: null,
    hrCallAt: null,
    teamCallAt: null,
    securityCallAt: null,
    lead: PREVIEW_SAMPLES.lead,
    buddy: PREVIEW_SAMPLES.buddy,
    team: [...PREVIEW_SAMPLES.team],
    roleExpectations: PREVIEW_SAMPLES.roleExpectations,
    goals: { ...PREVIEW_SAMPLES.goals },
    tutorials: [...PREVIEW_SAMPLES.tutorials],
    teamTools: [...PREVIEW_SAMPLES.teamTools],
  }
}

const paymentFor = (facts: PreviewFacts): PaymentFacts =>
  facts.contractType === 'PK_EMPLOYMENT' ? { kind: 'PK', bankSaved: false } : { kind: 'OTHER', payoutSaved: false }

/** The rule a fresh hire with these facts would be held to, judged on an untouched page. */
function previewProgress(
  source: PreviewSourceView, blocks: Block[], context: AcademyContext, facts: PreviewFacts, state: ProgressState,
): ModuleProgressView {
  const tutorialKeys = blocks.some((b) => b.type === 'tutorialCards') ? context.tutorials.map((t) => t.key) : []
  const dashboardLinkSet =
    blocks.some((b) => b.type === 'dashboardLink') && resolveAcademyLink(context.config.links.COMPANY_DASHBOARD) !== null
  const video = moduleVideo(blocks, context.config.videos)
  const rule = effectiveRule(source.module.completionRule, blocks, {
    tutorialCount: tutorialKeys.length, dashboardLinkSet, videoReady: video !== null,
  })
  const completion = evaluateCompletion({
    rule, blocks, state, tutorialKeys, discordUsername: null, securityAckSigned: false,
    payment: paymentFor(facts), videoDurationSeconds: video?.video.durationSeconds ?? null,
  })
  return { state, status: 'IN_PROGRESS', overdue: false, effectiveRule: rule, completion, dueAt: null, completedAt: null }
}

function toPreviewModule(source: PreviewSourceView, context: AcademyContext, blocks: Block[], progress: ModuleProgressView): ModuleView {
  const { module, details } = source
  return {
    slug: module.slug,
    number: source.number,
    total: source.total,
    title: details.title,
    headlineLead: details.headlineLead || null,
    headlineAccent: details.headlineAccent || null,
    icon: module.icon,
    heroImageUrl: module.heroImageUrl,
    estimatedMinutes: details.estimatedMinutes,
    phase: module.phase,
    plain: false,
    rail: [],
    blocks: withVideoDetails(renderBlocks(blocks, context.placeholders), context.config.videos, progress.state, false),
    lead: context.lead,
    team: context.team,
    buddy: context.buddy,
    keyContacts: context.keyContacts,
    tutorials: context.tutorials.map((t) => ({ ...t, opened: false })),
    teamTools: context.teamTools,
    callTimes: context.callTimes,
    roleExpectations: context.roleExpectations,
    library: context.library,
    commute: context.commute,
    links: resolveLinkHrefs(context.config.links),
    invoiceTemplateHref: null,
    bankSaved: false,
    payoutSaved: false,
    securityAcknowledgement: null,
    discordUsername: null,
    progress,
    nextSlug: null,
  }
}

/**
 * HR's "Preview as": the saved draft or the live version, rendered for chosen facts. It reads no
 * person and writes nothing; people and per-hire data are labelled samples, key contacts are the
 * shared list every hire sees. `now` is injectable for tests.
 */
export async function previewModule(
  db: PrismaClient, viewer: Viewer, moduleId: string, input: unknown, now: Date = new Date(),
): Promise<PreviewView> {
  if (!canManageOnboarding(viewer.role)) throw new AcademyError('Forbidden', 403)
  const { source, facts } = previewRequestSchema.parse(input)
  const loaded = await loadPreviewSource(db, moduleId, source)
  const learner = sampleLearner(facts)
  const context = await contextFromFacts(db, learner, now, PREVIEW_SAMPLES.placeholders)
  const blocks = filterBlocks(loaded.blocks, learner.conditions)
  const progress = previewProgress(loaded, blocks, context, facts, parseProgressState(null))
  return {
    showing: loaded.showing,
    version: loaded.version,
    module: toPreviewModule(loaded, context, blocks, progress),
    unknownPlaceholders: unknownPlaceholdersIn(loaded.blocks),
  }
}
