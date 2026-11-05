// Pure view types and mapping for the Academy pages. No server-only imports: safe for client components.
import type {
  KeyContactGroup,
  LibraryCardKind,
  OnboardingCompletionRule,
  OnboardingPhase,
  TransportMode,
} from '@prisma/client'
import type { PersonAttributes } from './attributes'
import type { Block } from './blocks'
import type { CompletionResult } from './completion'
import { attributeValueLabel } from './labels'
import { libraryCardSchema, resolveAcademyLink, resolveCardLink, type AcademyLink, type AcademyLinkKey } from './links'
import { renderPlaceholders, type PlaceholderKey } from './placeholders'
import { moduleCardState, type CardStatus, type ProgressState } from './progress'
import { blockersCallLocal, formatClock, overlapWindowLocal, timeZoneFor } from './time'

const COMMUTE_TOKEN = '{commute rate table}'
const COMMUTE_EMPTY_MESSAGE = 'Ask HR for the current rates.'
const SECURITY_FALLBACK = 'Security and IT'
const ACCOUNTS_FALLBACK = 'Accounts'
const DASHBOARD_EVENT_KEY = 'COMPANY_DASHBOARD'

export interface PersonView {
  id: string
  name: string
  title: string | null
  discordUsername: string | null
  /** Compass holds no profile photo yet, so this is always null and cards show initials. */
  photoUrl: string | null
  email: string | null
}

export type KeyContactsView = Record<KeyContactGroup, PersonView[]>

export interface TutorialLink { key: string; title: string; url: string }
export interface TutorialView extends TutorialLink { opened: boolean }
export interface TeamToolView { name: string; purpose: string; url: string | null }

export interface CallTimesView {
  hrCallAt: string | null
  teamCallAt: string | null
  /** The weekly Blockers Call in the hire's own time. */
  blockersCall: string
  timeZone: string | null
}

export interface CommuteRow { transportMode: TransportMode; minKm: number; maxKm: number | null; monthlyRate: number }
export interface CommuteView { rows: CommuteRow[]; emptyMessage: string }

export type CardBodyPart = { kind: 'text'; text: string } | { kind: 'commuteTable' }

export interface LibraryCardView {
  id: string
  title: string
  icon: string
  parts: CardBodyPart[]
  links: Array<{ label: string; href: string }>
}

export type LibraryView = Record<LibraryCardKind, LibraryCardView[]>

export interface ModuleCardView {
  slug: string
  title: string
  number: number
  phase: OnboardingPhase
  estimatedMinutes: number
  icon: string | null
  status: CardStatus
  overdue: boolean
  dueAt: string | null
  completedAt: string | null
}

export interface ModuleProgressView {
  state: ProgressState
  status: CardStatus
  overdue: boolean
  effectiveRule: OnboardingCompletionRule
  completion: CompletionResult
  dueAt: string | null
  completedAt: string | null
}

export interface SecurityAcknowledgementView { statementText: string; typedName: string; signedAt: string }

export interface ModuleView {
  slug: string
  number: number
  total: number
  title: string
  headlineLead: string | null
  headlineAccent: string | null
  icon: string | null
  heroImageUrl: string | null
  estimatedMinutes: number
  phase: OnboardingPhase
  rail: ModuleCardView[]
  /** Conditions applied and placeholders rendered in every text field. */
  blocks: Block[]
  lead: PersonView | null
  team: PersonView[]
  buddy: PersonView | null
  keyContacts: KeyContactsView
  tutorials: TutorialView[]
  teamTools: TeamToolView[]
  callTimes: CallTimesView
  roleExpectations: string | null
  library: LibraryView
  commute: CommuteView
  /** Only links that resolve: a key with no href is absent, and its card should hide. */
  links: Partial<Record<AcademyLinkKey, string>>
  invoiceTemplateHref: string | null
  bankSaved: boolean
  payoutSaved: boolean
  securityAcknowledgement: SecurityAcknowledgementView | null
  progress: ModuleProgressView
  nextSlug: string | null
}

export interface ReleasedHomeView {
  released: true
  greeting: string
  title: string
  department: string | null
  doneCount: number
  total: number
  courseDueAt: string | null
  nextModule: ModuleCardView | null
  yourCalls: CallTimesView
  yourBuddy: PersonView | null
  phases: Array<{ phase: OnboardingPhase; modules: ModuleCardView[] }>
}

export type HomeView = { released: false } | ReleasedHomeView

export interface PlaceholderInput {
  name: string
  preferredName: string | null
  title: string
  department: string | null
  attributes: PersonAttributes
  lead: PersonView | null
  coreHoursStart: string | null
  coreHoursEnd: string | null
  goals: { day1Goal: string | null; week1Goal: string | null; month1Goal: string | null; month3Goal: string | null }
  blockersCallCt: string
  keyContacts: KeyContactsView
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

function contactList(people: readonly PersonView[], fallback: string): string {
  if (people.length === 0) return fallback
  return people.map((p) => (p.email ? `${p.name} (${p.email})` : p.name)).join(', ')
}

function clockLabel(stored: string): string {
  const [hour, minute] = stored.split(':').map(Number)
  return formatClock(hour, minute)
}

function coreHoursLabel(start: string | null, end: string | null): string {
  return start && end ? `${clockLabel(start)} to ${clockLabel(end)}` : ''
}

function locationLabel({ officeLocation, remoteCountry }: PersonAttributes): string {
  if (!officeLocation) return ''
  if (officeLocation !== 'REMOTE' || !remoteCountry) return attributeValueLabel(officeLocation)
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(remoteCountry) ?? remoteCountry
}

/** Every key is present, so a value we do not have is empty and never raw braces. */
export function buildPlaceholderValues(input: PlaceholderInput, now: Date): Record<PlaceholderKey, string> {
  const timeZone = timeZoneFor(input.attributes)
  return {
    'preferred name': input.preferredName ?? firstWord(input.name),
    title: input.title,
    department: input.department ?? '',
    location: locationLabel(input.attributes),
    'lead first name': input.lead ? firstWord(input.lead.name) : '',
    'core hours': coreHoursLabel(input.coreHoursStart, input.coreHoursEnd),
    'overlap local time': overlapWindowLocal(timeZone, now),
    'blockers local time': blockersCallLocal(input.blockersCallCt, timeZone, now),
    'security contacts': contactList(input.keyContacts.SECURITY_IT, SECURITY_FALLBACK),
    'accounts contacts': contactList(input.keyContacts.ACCOUNTS, ACCOUNTS_FALLBACK),
    // Not the hire's own bank: that value stays out of every view, and no company bank is configured yet.
    'bank name': '',
    'day 1 goal': input.goals.day1Goal ?? '',
    'week 1 goal': input.goals.week1Goal ?? '',
    'month 1 goal': input.goals.month1Goal ?? '',
    'month 3 goal': input.goals.month3Goal ?? '',
  }
}

/** Renders placeholders in every human text field. Ids such as checklist keys stay as stored. */
export function renderBlocks(blocks: readonly Block[], values: Record<string, string>): Block[] {
  const r = (text: string) => renderPlaceholders(text, values)
  const heading = (value: string | undefined) => (value === undefined ? {} : { heading: r(value) })
  return blocks.map((block): Block => {
    switch (block.type) {
      case 'video':
        return { ...block, summary: r(block.summary) }
      case 'richText':
        return { ...block, markdown: r(block.markdown) }
      case 'peopleCards':
      case 'tutorialCards':
        return { ...block, ...heading(block.heading) }
      case 'linkCards':
        return { ...block, ...heading(block.heading), links: block.links.map((l) => ({ ...l, label: r(l.label) })) }
      case 'checklist':
        return { ...block, ...heading(block.heading), items: block.items.map((i) => ({ ...i, label: r(i.label) })) }
      case 'dataTable':
        return { ...block, headers: block.headers.map(r), rows: block.rows.map((row) => row.map(r)) }
      case 'warningBox':
        return { ...block, heading: r(block.heading), markdown: r(block.markdown) }
      case 'inputField':
      case 'dashboardLink':
        return { ...block, label: r(block.label) }
      case 'acknowledgement':
        return { ...block, statement: r(block.statement) }
      case 'copyText':
        return { ...block, label: r(block.label), text: r(block.text) }
      case 'timeline':
        return { ...block, items: block.items.map((i) => ({ label: r(i.label), markdown: r(i.markdown) })) }
      case 'toolTiles':
        return {
          ...block,
          ...heading(block.heading),
          tools: block.tools.map((t) => ({ ...t, name: r(t.name), purpose: r(t.purpose) })),
        }
      case 'libraryCards':
      case 'callTimes':
      case 'roleExpectations':
        return block
      case 'conditional':
        return { ...block, children: renderBlocks(block.children, values) }
    }
  })
}

/** Keeps the commute table a real table: the body is split around its token, never string-substituted. */
export function splitCardBody(body: string, values: Record<string, string>): CardBodyPart[] {
  const pieces = body.split(COMMUTE_TOKEN).map((text) => renderPlaceholders(text, values))
  return pieces.flatMap((text, index): CardBodyPart[] => [
    ...(index > 0 ? [{ kind: 'commuteTable' as const }] : []),
    ...(text ? [{ kind: 'text' as const, text }] : []),
  ])
}

const cardLinkRow = libraryCardSchema.shape.links.element

function resolveCardLinks(
  stored: unknown,
  configLinks: Partial<Record<AcademyLinkKey, AcademyLink>>,
): LibraryCardView['links'] {
  if (!Array.isArray(stored)) return []
  return stored.flatMap((row: unknown) => {
    const parsed = cardLinkRow.safeParse(row)
    const href = parsed.success ? resolveCardLink(parsed.data.link, configLinks) : null
    return parsed.success && href ? [{ label: parsed.data.label, href }] : []
  })
}

export function toLibraryCardView(
  card: { id: string; title: string; icon: string; body: string; links: unknown },
  configLinks: Partial<Record<AcademyLinkKey, AcademyLink>>,
  values: Record<string, string>,
): LibraryCardView {
  return {
    id: card.id,
    title: renderPlaceholders(card.title, values),
    icon: card.icon,
    parts: splitCardBody(card.body, values),
    links: resolveCardLinks(card.links, configLinks),
  }
}

export function toCommuteView(rows: CommuteRow[]): CommuteView {
  return { rows, emptyMessage: COMMUTE_EMPTY_MESSAGE }
}

/** Only links that resolve, by key. */
export function resolveLinkHrefs(links: Partial<Record<AcademyLinkKey, AcademyLink>>): Partial<Record<AcademyLinkKey, string>> {
  return Object.fromEntries(
    Object.entries(links).flatMap(([key, link]) => {
      const href = resolveAcademyLink(link)
      return href ? [[key, href]] : []
    }),
  )
}

/** The keys a module's filtered blocks define: nothing else may be reported as an event. */
export function eventKeysFor(blocks: readonly Block[], tutorialKeys: readonly string[]): { checks: string[]; links: string[] } {
  return {
    checks: blocks.flatMap((b) => (b.type === 'checklist' ? b.items.map((i) => i.key) : [])),
    links: [
      ...(blocks.some((b) => b.type === 'tutorialCards') ? tutorialKeys : []),
      ...(blocks.some((b) => b.type === 'dashboardLink') ? [DASHBOARD_EVENT_KEY] : []),
    ],
  }
}

export interface ModuleForCard {
  slug: string
  title: string
  phase: OnboardingPhase
  estimatedMinutes: number | null
  icon: string | null
}

export interface RowForCard {
  status: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'
  startedAt: Date | null
  dueAt: Date | null
  completedAt: Date | null
}

const NO_ROW: RowForCard = { status: 'LOCKED', startedAt: null, dueAt: null, completedAt: null }

export function toModuleCard(module: ModuleForCard, number: number, row: RowForCard | undefined, now: Date): ModuleCardView {
  const source = row ?? NO_ROW
  return {
    slug: module.slug,
    title: module.title,
    number,
    phase: module.phase,
    estimatedMinutes: module.estimatedMinutes ?? 0,
    icon: module.icon,
    ...moduleCardState(source, now),
    dueAt: source.dueAt?.toISOString() ?? null,
    completedAt: source.completedAt?.toISOString() ?? null,
  }
}
