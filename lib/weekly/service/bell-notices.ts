// Pure builders for the bell rows that sit beside weekly list and forms emails.
import { yourChange } from '../emails'
import type { WeeklyBellNotice } from './notifications'

const WEEKLY_LINK = '/evaluations/weekly'
type Action = 'ADD' | 'REMOVE'
type Relation = 'PEER' | 'LEAD' | 'REPORT'

export function decisionBellForRequester(input: { requestId: string; approved: boolean; action: Action; relation: Relation; otherName: string }): WeeklyBellNotice {
  return {
    kind: 'WEEKLY_LIST_DECISION',
    title: `Your request to ${yourChange({ action: input.action, relation: input.relation }, input.otherName)} was ${input.approved ? 'approved' : 'not approved'}`,
    link: WEEKLY_LINK,
    dedupeKey: `bell:peer-request-outcome:${input.requestId}`,
  }
}

export function decisionBellForOther(input: { requestId: string; approved: boolean; requesterName: string }): WeeklyBellNotice {
  return {
    kind: 'WEEKLY_LIST_DECISION',
    title: input.approved
      ? `HR changed your evaluation lists after a request from ${input.requesterName}`
      : `HR did not approve ${input.requesterName}'s request about you`,
    link: WEEKLY_LINK,
    dedupeKey: `bell:peer-request-outcome:${input.requestId}:other`,
  }
}

export function expiredBell(input: { requestId: string; otherName: string; forPeer: boolean }): WeeklyBellNotice {
  return {
    kind: 'WEEKLY_LIST_DECISION',
    title: input.forPeer
      ? `${input.otherName}'s request about you lapsed when the round opened`
      : `Your request about ${input.otherName} lapsed when the round opened`,
    link: WEEKLY_LINK,
    dedupeKey: `bell:peer-request-expired:${input.requestId}${input.forPeer ? ':peer' : ''}`,
  }
}

export function listChangedBell(input: { text: string; dedupeKey: string }): WeeklyBellNotice {
  return { kind: 'WEEKLY_LIST_CHANGED', title: input.text, link: WEEKLY_LINK, dedupeKey: `bell:${input.dedupeKey}` }
}

export function formsOpenBell(input: { userId: string; cycleId: string; href: string; partner: boolean }): WeeklyBellNotice {
  return {
    kind: 'WEEKLY_FORMS_OPEN',
    title: input.partner ? 'Your quarter-end tables are open' : 'Quarter-end forms are open',
    link: input.href,
    dedupeKey: `bell:weekly-forms-open:${input.userId}:${input.cycleId}`,
  }
}
