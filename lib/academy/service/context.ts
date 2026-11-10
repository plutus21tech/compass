import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { KeyContactGroup, OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import type { TeamTag } from '@/lib/teams/catalog'
import type { PersonAttributes } from '../attributes'
import type { ConditionFacts } from '../blocks'
import type { AcademyConfigView } from '../links'
import type { PlaceholderKey } from '../placeholders'
import { leadInputSchema } from '../setup'
import { blockersCallLocalFor } from '../time'
import {
  buildPlaceholderValues,
  toCommuteView,
  toLibraryCardView,
  type CallTimesView,
  type CommuteView,
  type KeyContactsView,
  type LibraryView,
  type PersonView,
  type TeamToolView,
  type TutorialLink,
} from '../view'
import { ATTRIBUTE_SELECT } from './attributes'
import { eligibleCards, getAcademyConfig, listKeyContacts } from './library'
import { commuteRatesInForce } from './shared-reads'

type Db = PrismaClient | Prisma.TransactionClient

const TUTORIAL_KEY_LENGTH = 12
const KEY_CONTACT_GROUPS: readonly KeyContactGroup[] = ['HR', 'SECURITY_IT', 'ACCOUNTS', 'EXECUTION']

const PERSON_SELECT = { id: true, name: true, email: true, position: true, discordUsername: true } as const

const STAFF_SELECT = { name: true, position: true, department: true, discordUsername: true, teamTag: true, ...ATTRIBUTE_SELECT } as const

const HIRE_SELECT = {
  id: true,
  preferredName: true,
  title: true,
  department: true,
  companyWing: true,
  clientAccount: true,
  coreHoursStart: true,
  coreHoursEnd: true,
  hrCallAt: true,
  teamCallAt: true,
  securityCallAt: true,
  onboardingDate: true,
  academyReleasedAt: true,
  user: { select: { name: true, discordUsername: true, teamTag: true, ...ATTRIBUTE_SELECT } },
  teamLead: { select: PERSON_SELECT },
  buddy: { select: PERSON_SELECT },
  teamMembers: { select: { user: { select: PERSON_SELECT } }, orderBy: { createdAt: 'asc' } },
  teamLeadForm: {
    select: {
      roleExpectations: true, day1Goal: true, week1Goal: true, month1Goal: true, month3Goal: true,
      tutorials: true, teamTools: true,
    },
  },
} satisfies Prisma.NewHireSelect

/** What progress rules need: the person's own record, nothing shared. */
export interface LearnerFacts {
  /** False for staff reading an assigned module: they have no rail, Home or quiz. */
  hasCourse: boolean
  name: string
  preferredName: string | null
  title: string
  department: string | null
  attributes: PersonAttributes
  teamTag: TeamTag | null
  discordUsername: string | null
  conditions: ConditionFacts
  coreHoursStart: string | null
  coreHoursEnd: string | null
  hrCallAt: Date | null
  teamCallAt: Date | null
  securityCallAt: Date | null
  lead: PersonView | null
  buddy: PersonView | null
  team: PersonView[]
  roleExpectations: string | null
  goals: { day1Goal: string | null; week1Goal: string | null; month1Goal: string | null; month3Goal: string | null }
  tutorials: TutorialLink[]
  teamTools: TeamToolView[]
}

export interface HireFacts extends LearnerFacts {
  newHireId: string
  onboardingDate: Date
}

export interface AcademyContext extends LearnerFacts {
  config: AcademyConfigView
  keyContacts: KeyContactsView
  placeholders: Record<PlaceholderKey, string>
  library: LibraryView
  commute: CommuteView
  callTimes: CallTimesView
}

/** Stable across reordering, so a lead moving a tutorial never loses a hire's progress. */
export function tutorialKey(url: string): string {
  return `tutorial:${createHash('sha256').update(url).digest('hex').slice(0, TUTORIAL_KEY_LENGTH)}`
}

const tutorialRow = leadInputSchema.shape.tutorials.unwrap().element
const teamToolRow = leadInputSchema.shape.teamTools.unwrap().element

/** Stored JSON could be anything: one bad row is dropped and the rest stay. */
function validRows<T>(stored: unknown, row: z.ZodType<T>): T[] {
  if (!Array.isArray(stored)) return []
  return stored.flatMap((value: unknown) => {
    const parsed = row.safeParse(value)
    return parsed.success ? [parsed.data] : []
  })
}

function toTutorials(stored: unknown): TutorialLink[] {
  const links = validRows(stored, tutorialRow).map((t) => ({ key: tutorialKey(t.url), title: t.title, url: t.url }))
  return links.filter((link, index) => links.findIndex((other) => other.key === link.key) === index)
}

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>

function toPerson(user: PersonRow): PersonView {
  return {
    id: user.id,
    name: user.name,
    title: user.position,
    discordUsername: user.discordUsername,
    photoUrl: null,
    email: user.email,
  }
}

/** The fresh record of a released hire, or null when no released NewHire links to the user. */
export async function loadHireFacts(db: Db, userId: string): Promise<HireFacts | null> {
  const hire = await db.newHire.findUnique({ where: { userId }, select: HIRE_SELECT })
  if (!hire?.academyReleasedAt || !hire.user) return null
  const { user, teamLeadForm: form } = hire
  const attributes: PersonAttributes = {
    officeLocation: user.officeLocation,
    remoteCountry: user.remoteCountry,
    workMode: user.workMode,
    contractType: user.contractType,
    employmentStatus: user.employmentStatus,
  }
  return {
    hasCourse: true,
    newHireId: hire.id,
    name: user.name,
    preferredName: hire.preferredName,
    title: hire.title,
    department: hire.department,
    attributes,
    teamTag: user.teamTag,
    discordUsername: user.discordUsername,
    conditions: { attributes, clientAccount: hire.clientAccount, companyWing: hire.companyWing },
    coreHoursStart: hire.coreHoursStart,
    coreHoursEnd: hire.coreHoursEnd,
    hrCallAt: hire.hrCallAt,
    teamCallAt: hire.teamCallAt,
    securityCallAt: hire.securityCallAt,
    onboardingDate: hire.onboardingDate,
    lead: hire.teamLead ? toPerson(hire.teamLead) : null,
    buddy: hire.buddy ? toPerson(hire.buddy) : null,
    team: hire.teamMembers.map((member) => toPerson(member.user)),
    roleExpectations: form?.roleExpectations ?? null,
    goals: {
      day1Goal: form?.day1Goal ?? null,
      week1Goal: form?.week1Goal ?? null,
      month1Goal: form?.month1Goal ?? null,
      month3Goal: form?.month3Goal ?? null,
    },
    tutorials: toTutorials(form?.tutorials),
    teamTools: validRows(form?.teamTools, teamToolRow).map((t) => ({ name: t.name, purpose: t.purpose, url: t.url ?? null })),
  }
}

/** Staff have no NewHire: attributes come from User, and everything set per hire is empty. */
async function loadStaffFacts(db: Db, userId: string): Promise<LearnerFacts | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: STAFF_SELECT })
  if (!user) return null
  const attributes: PersonAttributes = {
    officeLocation: user.officeLocation,
    remoteCountry: user.remoteCountry,
    workMode: user.workMode,
    contractType: user.contractType,
    employmentStatus: user.employmentStatus,
  }
  return {
    hasCourse: false,
    name: user.name,
    preferredName: null,
    title: user.position ?? '',
    department: user.department,
    attributes,
    teamTag: user.teamTag,
    discordUsername: user.discordUsername,
    conditions: { attributes, clientAccount: null, companyWing: null },
    coreHoursStart: null,
    coreHoursEnd: null,
    hrCallAt: null,
    teamCallAt: null,
    securityCallAt: null,
    lead: null,
    buddy: null,
    team: [],
    roleExpectations: null,
    goals: { day1Goal: null, week1Goal: null, month1Goal: null, month3Goal: null },
    tutorials: [],
    teamTools: [],
  }
}

/**
 * Who may use this row. A released hire uses any of theirs. Anyone else only an assigned or re-read
 * row: a COURSE row without a released course stays shut, so null.
 */
export async function loadRowFacts(db: Db, userId: string, row: Pick<OnboardingProgress, 'source'>): Promise<LearnerFacts | null> {
  const hire = await loadHireFacts(db, userId)
  if (hire) return hire
  return row.source === 'COURSE' ? null : loadStaffFacts(db, userId)
}

type ContactRow = Awaited<ReturnType<typeof listKeyContacts>>[number]

function contactPerson(contact: ContactRow): PersonView {
  const base = contact.user
    ? toPerson(contact.user)
    : { id: contact.id, name: contact.label ?? '', title: null, discordUsername: null, photoUrl: null, email: null }
  return { ...base, email: contact.email ?? base.email }
}

function groupContacts(contacts: readonly ContactRow[]): KeyContactsView {
  const inGroup = (group: KeyContactGroup) => contacts.filter((c) => c.group === group).map(contactPerson)
  return Object.fromEntries(KEY_CONTACT_GROUPS.map((group) => [group, inGroup(group)])) as KeyContactsView
}

/**
 * Everything a page needs for one person. With no row: only a released hire, so Home and the quiz stay
 * theirs. With the row being read: also staff, under the rule in loadRowFacts. Otherwise null.
 */
export async function buildAcademyContext(
  db: Db, userId: string, row?: Pick<OnboardingProgress, 'source'>,
): Promise<AcademyContext | null> {
  const facts = row ? await loadRowFacts(db, userId, row) : await loadHireFacts(db, userId)
  return facts ? contextFromFacts(db, facts, new Date()) : null
}

/**
 * The shared lists and config around a set of facts. Preview passes sample facts, and `overrides` for
 * the placeholders a sample can't fill; a real person's page passes none.
 */
export async function contextFromFacts(
  db: Db, facts: LearnerFacts, now: Date, overrides: Partial<Record<PlaceholderKey, string>> = {},
): Promise<AcademyContext> {
  const config = await getAcademyConfig(db)
  const keyContacts = groupContacts(await listKeyContacts(db))
  const placeholders = {
    ...buildPlaceholderValues({ ...facts, blockersCallCt: config.blockersCallCt, keyContacts }, now),
    ...overrides,
  }
  const cardViews = async (kind: 'BENEFIT' | 'REIMBURSEMENT') =>
    (await eligibleCards(db, kind, facts.attributes)).map((card) => toLibraryCardView(card, config.links, placeholders))
  return {
    ...facts,
    config,
    keyContacts,
    placeholders,
    library: { BENEFIT: await cardViews('BENEFIT'), REIMBURSEMENT: await cardViews('REIMBURSEMENT') },
    commute: toCommuteView(await commuteRatesInForce(db, now)),
    callTimes: {
      hrCallAt: facts.hrCallAt?.toISOString() ?? null,
      teamCallAt: facts.teamCallAt?.toISOString() ?? null,
      securityCallAt: facts.securityCallAt?.toISOString() ?? null,
      ...blockersCallLocalFor(config.blockersCallCt, facts.attributes, now),
    },
  }
}
