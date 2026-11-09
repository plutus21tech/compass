// Pure rules: no server-only imports. Safe for client components.
import { z } from 'zod'
import { CONTRACT_TYPES, OFFICE_LOCATIONS, type PersonAttributes } from './attributes'
import { ACADEMY_LINK_KEYS, type AcademyLinkKey } from './links'

export const COMPANY_WINGS = ['CAPITAL', 'PARTNERS'] as const
export type CompanyWing = (typeof COMPANY_WINGS)[number]

const text = z.string()
const linkKey = z.enum(ACADEMY_LINK_KEYS)

export type ConditionWhen =
  | { clientAccountSet: true }
  | { contractType: Array<(typeof CONTRACT_TYPES)[number]> }
  | { location: Array<(typeof OFFICE_LOCATIONS)[number]> }
  | { companyWing: CompanyWing }

export type Block =
  | { type: 'video'; videoKey: 'VIDEO_1' | 'VIDEO_2'; summary: string }
  | { type: 'richText'; markdown: string }
  | { type: 'peopleCards'; source: 'lead' | 'team' | 'buddy' | 'keyContacts'; heading?: string; group?: string }
  | { type: 'linkCards'; heading?: string; links: Array<{ label: string; linkKey: AcademyLinkKey }> }
  | { type: 'tutorialCards'; heading?: string }
  | { type: 'checklist'; heading?: string; items: Array<{ key: string; label: string }> }
  | { type: 'dataTable'; headers: string[]; rows: string[][] }
  | { type: 'warningBox'; heading: string; markdown: string }
  | { type: 'inputField'; target: 'discordUsername' | 'linkedinUrl' | 'bank' | 'payout'; label: string }
  | { type: 'acknowledgement'; kind: 'SECURITY_SOPS'; statement: string }
  | { type: 'copyText'; label: string; text: string }
  | { type: 'timeline'; items: Array<{ label: string; markdown: string }> }
  | { type: 'toolTiles'; heading?: string; tools: Array<{ name: string; purpose: string; linkKey?: AcademyLinkKey }>; includeTeamTools: boolean }
  | { type: 'libraryCards'; kind: 'BENEFIT' | 'REIMBURSEMENT' }
  | { type: 'callTimes' }
  | { type: 'roleExpectations' }
  | { type: 'dashboardLink'; label: string }
  | { type: 'conditional'; when: ConditionWhen; children: Block[] }

const whenSchema: z.ZodType<ConditionWhen> = z.union([
  z.object({ clientAccountSet: z.literal(true) }).strict(),
  z.object({ contractType: z.array(z.enum(CONTRACT_TYPES)) }).strict(),
  z.object({ location: z.array(z.enum(OFFICE_LOCATIONS)) }).strict(),
  z.object({ companyWing: z.enum(COMPANY_WINGS) }).strict(),
])

const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('video'), videoKey: z.enum(['VIDEO_1', 'VIDEO_2']), summary: text }),
    z.object({ type: z.literal('richText'), markdown: text }),
    z.object({
      type: z.literal('peopleCards'),
      source: z.enum(['lead', 'team', 'buddy', 'keyContacts']),
      heading: text.optional(),
      group: text.optional(),
    }),
    z.object({
      type: z.literal('linkCards'),
      heading: text.optional(),
      links: z.array(z.object({ label: text, linkKey })),
    }),
    z.object({ type: z.literal('tutorialCards'), heading: text.optional() }),
    z.object({
      type: z.literal('checklist'),
      heading: text.optional(),
      items: z.array(z.object({ key: text.min(1), label: text })),
    }),
    z.object({ type: z.literal('dataTable'), headers: z.array(text), rows: z.array(z.array(text)) }),
    z.object({ type: z.literal('warningBox'), heading: text, markdown: text }),
    z.object({
      type: z.literal('inputField'),
      target: z.enum(['discordUsername', 'linkedinUrl', 'bank', 'payout']),
      label: text,
    }),
    z.object({ type: z.literal('acknowledgement'), kind: z.literal('SECURITY_SOPS'), statement: text }),
    z.object({ type: z.literal('copyText'), label: text, text }),
    z.object({ type: z.literal('timeline'), items: z.array(z.object({ label: text, markdown: text })) }),
    z.object({
      type: z.literal('toolTiles'),
      heading: text.optional(),
      tools: z.array(z.object({ name: text, purpose: text, linkKey: linkKey.optional() })),
      includeTeamTools: z.boolean(),
    }),
    z.object({ type: z.literal('libraryCards'), kind: z.enum(['BENEFIT', 'REIMBURSEMENT']) }),
    z.object({ type: z.literal('callTimes') }),
    z.object({ type: z.literal('roleExpectations') }),
    z.object({ type: z.literal('dashboardLink'), label: text }),
    z.object({ type: z.literal('conditional'), when: whenSchema, children: z.array(blockSchema) }),
  ]),
)

const blocksSchema = z.array(blockSchema)

/** Stored content could be anything: throws a ZodError when it is not a valid block list. */
export function parseBlocks(json: unknown): Block[] {
  return blocksSchema.parse(json)
}

export interface ConditionFacts {
  attributes: PersonAttributes
  clientAccount: string | null
  companyWing: CompanyWing | null
}

function conditionHolds(when: ConditionWhen, facts: ConditionFacts): boolean {
  if ('clientAccountSet' in when) return Boolean(facts.clientAccount?.trim())
  if ('contractType' in when) {
    const { contractType } = facts.attributes
    return contractType !== null && when.contractType.includes(contractType)
  }
  if ('location' in when) {
    const { officeLocation } = facts.attributes
    return officeLocation !== null && when.location.includes(officeLocation)
  }
  return facts.companyWing === when.companyWing
}

const COLLECTING_TARGETS: readonly string[] = ['linkedinUrl', 'bank', 'payout']

/**
 * A re-read or an assignment is for reading, so it collects nothing: these fields go, and the rules
 * that need them fall back to SCROLL_END through effectiveRule.
 */
export function readingBlocks(blocks: readonly Block[]): Block[] {
  return blocks.filter((b) => !(b.type === 'inputField' && COLLECTING_TARGETS.includes(b.target)))
}

/** What a row may collect: the course takes everything, a Module 11 re-read only payout, the rest nothing. */
export type Collects = 'all' | 'payout' | 'none'

/**
 * The blocks a row shows for what it collects. A re-read of Module 11 keeps the payout form, which a
 * contractor may update, and drops the bank form, which only the course row can save.
 */
export function collectingBlocks(blocks: readonly Block[], collects: Collects): Block[] {
  if (collects === 'all') return [...blocks]
  if (collects === 'none') return readingBlocks(blocks)
  return blocks.filter((b) => !(b.type === 'inputField' && COLLECTING_TARGETS.includes(b.target) && b.target !== 'payout'))
}

/** Removes conditional blocks whose rule fails and flattens the ones that pass, at any depth. */
export function filterBlocks(blocks: Block[], facts: ConditionFacts): Block[] {
  return blocks.flatMap((block): Block[] => {
    if (block.type !== 'conditional') return [block]
    return conditionHolds(block.when, facts) ? filterBlocks(block.children, facts) : []
  })
}
