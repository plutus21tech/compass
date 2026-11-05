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

/** Rules that need content the module may not have fall back to SCROLL_END. */
export function effectiveRule(rule: OnboardingCompletionRule, facts: CompletionFacts): OnboardingCompletionRule {
  if (rule === 'VIDEO_95') return 'SCROLL_END'
  if (rule === 'ALL_LINKS_OPENED' && facts.tutorialCount === 0) return 'SCROLL_END'
  if (rule === 'LINK_OPENED' && !facts.dashboardLinkSet) return 'SCROLL_END'
  return rule
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
      return result(state.checks['buddy-hello'] === true, "Tick the box once you've said hello to your buddy.")
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
  const invoiceTicked = input.state.checks['invoice-template'] === true
  return result(
    paymentSaved(input.payment) && invoiceTicked,
    'Save your payout details and tick the invoice template box.',
  )
}
