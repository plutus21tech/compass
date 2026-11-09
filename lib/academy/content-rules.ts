// What HR may publish, and the plain words the editor uses. Pure: no server-only imports, safe for client components.
import type { OnboardingCompletionRule } from '@prisma/client'
import { z } from 'zod'
import { CONTRACT_TYPES } from './attributes'
import type { Block, ConditionWhen } from './blocks'
import { BUDDY_HELLO_KEY } from './completion'
import { attributeValueLabel } from './labels'
import { findUnknownPlaceholders } from './placeholders'

type BlockType = Block['type']

/** Refused at save and at publish: keys, targets and conditions are not HR's to change. */
export const FIXED_BLOCK_MESSAGE = "That part of the module can't be changed here."

/** Two HR people editing: the second one to write gets this. */
export const STALE_CONTENT_MESSAGE = 'Someone else changed this. Reload to see their edits.'

const BLOCK_LABELS: Record<BlockType, string> = {
  video: 'Video',
  richText: 'Text',
  peopleCards: 'People cards',
  linkCards: 'Links',
  tutorialCards: 'Tutorials',
  checklist: 'Checklist',
  dataTable: 'Table',
  warningBox: 'Warning box',
  inputField: 'Answer box',
  acknowledgement: 'Acknowledgement',
  copyText: 'Text to copy',
  timeline: 'Timeline',
  toolTiles: 'Tools',
  libraryCards: 'Benefits or reimbursements',
  callTimes: 'Call times',
  roleExpectations: 'Role expectations',
  dashboardLink: 'Company Dashboard link',
  conditional: 'Only for some people',
}

const INPUT_LABELS: Record<Extract<Block, { type: 'inputField' }>['target'], string> = {
  discordUsername: 'Discord username box',
  linkedinUrl: 'LinkedIn link box',
  bank: 'Bank details box',
  payout: 'Payout details box',
}

export function blockLabel(block: Block): string {
  return block.type === 'inputField' ? INPUT_LABELS[block.target] : BLOCK_LABELS[block.type]
}

export const blockTypeLabel = (type: BlockType): string => BLOCK_LABELS[type]

/** How a hire finishes each module, for the editor's header. */
export const COMPLETION_RULE_LABELS: Record<OnboardingCompletionRule, string> = {
  VIDEO_95: "Hires finish this module by watching the video to the end, or by reading to the end while the video isn't ready.",
  SCROLL_END: 'Hires finish this module by reading to the end.',
  ALL_LINKS_OPENED: 'Hires finish this module by opening every tutorial.',
  LINK_OPENED: 'Hires finish this module by opening the Company Dashboard.',
  BUDDY_HELLO: 'Hires finish this module by ticking the buddy hello box.',
  CHECKLIST_AND_FIELD: 'Hires finish this module by ticking the checklist and saving their Discord username.',
  CHECKLIST_AND_ACK: 'Hires finish this module by ticking the checklist and signing the acknowledgement.',
  FIELD_SUBMITTED: 'Hires finish this module by sending their LinkedIn link.',
  PAYMENT_SETUP: 'Hires finish this module by saving their bank or payout details.',
}

const flatten = (blocks: readonly Block[]): Block[] =>
  blocks.flatMap((block) => (block.type === 'conditional' ? [block, ...flatten(block.children)] : [block]))

const PK_CONTRACT = 'PK_EMPLOYMENT'

/** The blocks someone on this contract can be shown. Other conditions stay in: their fallback covers those. */
function forContract(blocks: readonly Block[], contract: (typeof CONTRACT_TYPES)[number]): Block[] {
  return blocks.flatMap((block) => {
    if (block.type !== 'conditional') return [block]
    if ('contractType' in block.when && !block.when.contractType.includes(contract)) return []
    return forContract(block.children, contract)
  })
}

const hasTarget = (blocks: readonly Block[], target: string): boolean =>
  blocks.some((b) => b.type === 'inputField' && b.target === target)

/** PAYMENT_SETUP has a fallback only for someone shown no box at all, so each contract has to see its own. */
function paymentProblems(blocks: readonly Block[]): string[] {
  const others = CONTRACT_TYPES.filter((contract) => contract !== PK_CONTRACT)
  return [
    ...(hasTarget(forContract(blocks, PK_CONTRACT), 'bank') ? [] : [PK_NEEDS_BANK]),
    ...(others.every((contract) => hasTarget(forContract(blocks, contract), 'payout')) ? [] : [OTHERS_NEED_PAYOUT]),
  ]
}

const needs = (name: string): string => `Hires need the ${name} to finish this module, so it has to stay.`
const MISSING_CHECKLIST = 'Hires tick a checklist to finish this module, so it needs one with at least one item.'
const PK_NEEDS_BANK = 'People on a Pakistan employment contract need the bank details box to finish this module, so it has to stay where they can see it.'
const OTHERS_NEED_PAYOUT = 'Everyone on another contract needs the payout details box to finish this module, so it has to stay where they can see it.'
const HIDDEN_ACKNOWLEDGEMENT = 'Everyone needs the acknowledgement to finish this module, so it has to stay outside any block shown to only some people.'

/**
 * A required block may sit in a conditional only where effectiveRule has a fallback for people who can't see it.
 * The acknowledgement has none, so it is checked against the top level; payment is checked per contract.
 */
function missingFor(rule: OnboardingCompletionRule, tree: readonly Block[]): string[] {
  const blocks = flatten(tree)
  const hasField = (target: string) => hasTarget(blocks, target)
  const hasType = (type: BlockType) => blocks.some((b) => b.type === type)
  const hasChecklist = blocks.some((b) => b.type === 'checklist' && b.items.length > 0)
  const unless = (met: boolean, problem: string) => (met ? [] : [problem])
  switch (rule) {
    case 'SCROLL_END':
      return []
    case 'VIDEO_95':
      return unless(hasType('video'), needs('video'))
    case 'ALL_LINKS_OPENED':
      return unless(hasType('tutorialCards'), needs('tutorials'))
    case 'LINK_OPENED':
      return unless(hasType('dashboardLink'), needs('Company Dashboard link'))
    case 'BUDDY_HELLO':
      return unless(
        blocks.some((b) => b.type === 'checklist' && b.items.some((item) => item.key === BUDDY_HELLO_KEY)),
        needs('buddy hello tick box'),
      )
    case 'CHECKLIST_AND_FIELD':
      return [...unless(hasChecklist, MISSING_CHECKLIST), ...unless(hasField('discordUsername'), needs('Discord username box'))]
    case 'CHECKLIST_AND_ACK':
      return [
        ...unless(hasChecklist, MISSING_CHECKLIST),
        ...unless(hasType('acknowledgement'), needs('acknowledgement')),
        ...unless(!hasType('acknowledgement') || tree.some((b) => b.type === 'acknowledgement'), HIDDEN_ACKNOWLEDGEMENT),
      ]
    case 'FIELD_SUBMITTED':
      return unless(hasField('linkedinUrl'), needs('LinkedIn link box'))
    case 'PAYMENT_SETUP':
      return paymentProblems(tree)
  }
}

/** The text a hire can't do without, per block. Optional headings aren't here. */
function requiredTexts(block: Block): string[] {
  switch (block.type) {
    case 'video':
      return [block.summary]
    case 'richText':
      return [block.markdown]
    case 'linkCards':
      return block.links.map((link) => link.label)
    case 'checklist':
      return block.items.map((item) => item.label)
    case 'dataTable':
      return block.headers
    case 'warningBox':
      return [block.heading, block.markdown]
    case 'inputField':
    case 'dashboardLink':
      return [block.label]
    case 'acknowledgement':
      return [block.statement]
    case 'copyText':
      return [block.label, block.text]
    case 'timeline':
      return block.items.map((item) => item.label)
    case 'toolTiles':
      return block.tools.map((tool) => tool.name)
    default:
      return []
  }
}

/** Every string anywhere in a block, so a new text field can't dodge the placeholder check. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn)
  return []
}

function duplicateKeys(blocks: readonly Block[]): string[] {
  const keys = blocks.flatMap((b) => (b.type === 'checklist' ? b.items.map((item) => item.key) : []))
  return [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))]
}

/** Why this content can't go live: an empty list means it can. Walks every branch of every conditional. */
export function publishProblems(rule: OnboardingCompletionRule, blocks: Block[]): string[] {
  const all = flatten(blocks)
  const unknown = findUnknownPlaceholders(stringsIn(blocks).join('\n'))
  const blank = all.filter((block) => requiredTexts(block).some((text) => !text.trim()))
  return [
    ...new Set([
      ...missingFor(rule, blocks),
      ...unknown.map((name) => `{${name}} isn't a placeholder we recognise. Check the spelling or take it out.`),
      ...blank.map((block) => `${blockLabel(block)} is missing some text. Fill it in or delete it.`),
      ...duplicateKeys(all).map(() => 'Two checklist items are the same behind the scenes. Delete one and add it again.'),
    ]),
  ]
}

/** What makes a block fixed: its identity, never its words. Null for a block HR is free to change. */
function fixedIdentity(block: Block): string | null {
  switch (block.type) {
    case 'inputField':
      return `inputField:${block.target}`
    case 'acknowledgement':
      return `acknowledgement:${block.kind}`
    case 'video':
      return `video:${block.videoKey}`
    case 'dashboardLink':
      return 'dashboardLink'
    case 'conditional':
      return `conditional:${JSON.stringify(block.when)}`
    default:
      return null
  }
}

function fixedSignatures(blocks: readonly Block[], path: string): string[] {
  return blocks.flatMap((block) => {
    const identity = fixedIdentity(block)
    if (identity === null) return []
    const own = `${path}/${identity}`
    return block.type === 'conditional' ? [own, ...fixedSignatures(block.children, own)] : [own]
  })
}

/** True when the draft has a fixed block the live version lacks at that conditional path. Reordering and deleting are free. */
export function fixedBlocksChanged(live: readonly Block[], draft: readonly Block[]): boolean {
  const remaining = new Map<string, number>()
  for (const signature of fixedSignatures(live, '')) remaining.set(signature, (remaining.get(signature) ?? 0) + 1)
  return fixedSignatures(draft, '').some((signature) => {
    const left = remaining.get(signature) ?? 0
    remaining.set(signature, left - 1)
    return left < 1
  })
}

/** Legacy module routes send whole rows, and a draft is for HR's editor only. */
export function withoutDraft<T extends { draftBlocks: unknown; draftDetails: unknown }>(module: T): Omit<T, 'draftBlocks' | 'draftDetails'> {
  const { draftBlocks: _blocks, draftDetails: _details, ...rest } = module
  return rest
}

const WING_LABELS: Record<'CAPITAL' | 'PARTNERS', string> = { CAPITAL: 'Capital', PARTNERS: 'Partners' }

/** A conditional block's rule, in plain words. */
export function describeCondition(when: ConditionWhen): string {
  if ('clientAccountSet' in when) return 'Only shown to people with a client account.'
  if ('companyWing' in when) return `Only shown to people in ${WING_LABELS[when.companyWing]}.`
  if ('location' in when) return `Only shown to people in ${when.location.map(attributeValueLabel).join(' or ')}.`
  const contracts = when.contractType.map(attributeValueLabel).join(', ')
  return `Only shown to people on ${when.contractType.length === 1 ? 'this contract' : 'these contracts'}: ${contracts}.`
}

/** Blocks HR can add. Nothing here collects data, takes a signature or decides who sees what. */
export const ADDABLE_BLOCKS = [
  'richText', 'warningBox', 'checklist', 'dataTable', 'copyText', 'timeline', 'linkCards',
  'peopleCards', 'tutorialCards', 'toolTiles', 'libraryCards', 'callTimes', 'roleExpectations',
] as const satisfies readonly BlockType[]

export type AddableBlock = (typeof ADDABLE_BLOCKS)[number]

/** Checklist keys are what a hire's ticks are saved under, so an item keeps its key for life. */
export function newItemKey(taken: readonly string[]): string {
  const key = `item-${Math.random().toString(36).slice(2, 10)}`
  return taken.includes(key) ? newItemKey(taken) : key
}

export function newBlock(type: AddableBlock, takenKeys: readonly string[] = []): Block {
  switch (type) {
    case 'richText':
      return { type, markdown: '' }
    case 'warningBox':
      return { type, heading: '', markdown: '' }
    case 'checklist':
      return { type, items: [{ key: newItemKey(takenKeys), label: '' }] }
    case 'dataTable':
      return { type, headers: ['', ''], rows: [['', '']] }
    case 'copyText':
      return { type, label: '', text: '' }
    case 'timeline':
      return { type, items: [{ label: '', markdown: '' }] }
    case 'linkCards':
      return { type, links: [{ label: '', linkKey: 'COMPANY_DASHBOARD' }] }
    case 'peopleCards':
      return { type, source: 'team' }
    case 'toolTiles':
      return { type, tools: [{ name: '', purpose: '' }], includeTeamTools: false }
    case 'libraryCards':
      return { type, kind: 'BENEFIT' }
    case 'tutorialCards':
    case 'callTimes':
    case 'roleExpectations':
      return { type }
  }
}

/** Every checklist key in the tree, so a new one can't collide. */
export function checklistKeys(blocks: readonly Block[]): string[] {
  return flatten(blocks).flatMap((b) => (b.type === 'checklist' ? b.items.map((item) => item.key) : []))
}

const MAX_TITLE = 120
const MAX_HEADLINE_PART = 60
const MAX_MINUTES = 240

/** The module's own words: `slug`, `orderIndex`, `phase`, `completionRule` and `icon` are not HR's to change. */
export const moduleDetailsSchema = z
  .object({
    title: z.string().trim().min(1, 'Give the module a title.').max(MAX_TITLE, 'The title is too long.'),
    estimatedMinutes: z
      .number()
      .int('Use whole minutes.')
      .min(1, 'Estimated time needs to be at least 1 minute.')
      .max(MAX_MINUTES, `Estimated time can be ${MAX_MINUTES} minutes at most.`),
    headlineLead: z.string().trim().max(MAX_HEADLINE_PART, 'The headline is too long.'),
    headlineAccent: z.string().trim().max(MAX_HEADLINE_PART, 'The headline is too long.'),
  })
  .strict()

export type ModuleDetails = z.infer<typeof moduleDetailsSchema>
