// Pure rules: no server-only imports. Safe for client components.
import type { OnboardingCompletionRule } from '@prisma/client'
import type { Block } from './blocks'
import type { ProgressState } from './progress'

export interface CompletionFacts {
  tutorialCount: number
  dashboardLinkSet: boolean
}

export type PaymentFacts = { kind: 'PK'; bankSaved: boolean } | { kind: 'OTHER'; payoutSaved: boolean }

export interface CompletionInput {
  rule: OnboardingCompletionRule
  /** Already run through filterBlocks, so hidden checklist items are absent. */
  blocks: Block[]
  state: ProgressState
  tutorialKeys: string[]
  discordUsername: string | null
  securityAckSigned: boolean
  payment: PaymentFacts
}

export type CompletionResult = { met: true } | { met: false; reason: string }

const COMPANY_DASHBOARD_KEY = 'COMPANY_DASHBOARD'
const BUDDY_HELLO_KEY = 'buddy-hello'
export const INVOICE_TEMPLATE_KEY = 'invoice-template'

const hasChecklistItem = (blocks: readonly Block[], key: string): boolean =>
  blocks.some((b) => b.type === 'checklist' && b.items.some((item) => item.key === key))

const hasFilledChecklist = (blocks: readonly Block[]): boolean =>
  blocks.some((b) => b.type === 'checklist' && b.items.length > 0)

const hasInputField = (blocks: readonly Block[], ...targets: string[]): boolean =>
  blocks.some((b) => b.type === 'inputField' && targets.includes(b.target))

/** Whether the hire can actually do what the rule asks, given the blocks they are shown. */
function canMeetRule(rule: OnboardingCompletionRule, blocks: readonly Block[], facts: CompletionFacts): boolean {
  switch (rule) {
    case 'VIDEO_95':
      return false
    case 'SCROLL_END':
      return true
    case 'ALL_LINKS_OPENED':
      return facts.tutorialCount > 0
    case 'LINK_OPENED':
      return facts.dashboardLinkSet
    case 'BUDDY_HELLO':
      return hasChecklistItem(blocks, BUDDY_HELLO_KEY)
    case 'CHECKLIST_AND_FIELD':
      return hasFilledChecklist(blocks) && hasInputField(blocks, 'discordUsername')
    case 'CHECKLIST_AND_ACK':
      return blocks.some((b) => b.type === 'acknowledgement')
    case 'FIELD_SUBMITTED':
      return hasInputField(blocks, 'linkedinUrl')
    case 'PAYMENT_SETUP':
      return hasInputField(blocks, 'bank', 'payout')
  }
}

/** A hire is never stuck: a rule whose content is missing from the filtered blocks falls back to SCROLL_END. */
export function effectiveRule(
  rule: OnboardingCompletionRule,
  blocks: readonly Block[],
  facts: CompletionFacts,
): OnboardingCompletionRule {
  return canMeetRule(rule, blocks, facts) ? rule : 'SCROLL_END'
}

function requiredCheckKeys(blocks: readonly Block[]): string[] {
  return blocks.flatMap((b) => (b.type === 'checklist' ? b.items.map((i) => i.key) : []))
}

function allChecked(input: CompletionInput): boolean {
  return requiredCheckKeys(input.blocks).every((key) => input.state.checks[key] === true)
}

function unopenedTutorials(input: CompletionInput): number {
  return input.tutorialKeys.filter((key) => !input.state.linksOpenedAt[key]).length
}

function paymentSaved(payment: PaymentFacts): boolean {
  return payment.kind === 'PK' ? payment.bankSaved : payment.payoutSaved
}

const result = (met: boolean, reason: string): CompletionResult => (met ? { met: true } : { met: false, reason })

export function evaluateCompletion(input: CompletionInput): CompletionResult {
  const { state } = input
  switch (input.rule) {
    case 'VIDEO_95':
    case 'SCROLL_END':
      return result(state.scrolledToEnd, 'Read to the end of this page first.')
    case 'BUDDY_HELLO':
      return result(state.checks[BUDDY_HELLO_KEY] === true, "Tick the box once you've said hello to your buddy.")
    case 'ALL_LINKS_OPENED':
      return result(unopenedTutorials(input) === 0, `Open each tutorial first. ${unopenedTutorials(input)} to go.`)
    case 'CHECKLIST_AND_FIELD':
      return result(allChecked(input) && Boolean(input.discordUsername), 'Tick every step and save your Discord username.')
    case 'CHECKLIST_AND_ACK':
      return result(allChecked(input) && input.securityAckSigned, 'Tick every step and sign the acknowledgement.')
    case 'FIELD_SUBMITTED':
      return result(Boolean(state.linkedinUrl), 'Paste your LinkedIn link first.')
    case 'PAYMENT_SETUP':
      return paymentResult(input)
    case 'LINK_OPENED':
      return result(Boolean(state.linksOpenedAt[COMPANY_DASHBOARD_KEY]), 'Open the Company Dashboard first.')
  }
}

function paymentResult(input: CompletionInput): CompletionResult {
  if (input.payment.kind === 'PK') return result(input.payment.bankSaved, 'Save your bank details first.')
  // A version with no invoice box cannot ask for its tick.
  const invoiceTicked = !hasChecklistItem(input.blocks, INVOICE_TEMPLATE_KEY) || input.state.checks[INVOICE_TEMPLATE_KEY] === true
  return result(
    paymentSaved(input.payment) && invoiceTicked,
    'Save your payout details and tick the invoice template box.',
  )
}
