// Prisma-free: the client-side Home list imports these.
export type CardNoticeKind =
  | 'LIST_CHANGE_TO_REVIEW' | 'PEER_CHANGE_ABOUT_YOU' | 'LIST_DECISION' | 'HR_CHANGED_LISTS' | 'TEAM_SELF_REVIEW'
  | 'LATE_JOINER' | 'FORMS_OPEN' | 'HR_LIST_CHANGES' | 'HR_ANSWERS'
export interface CardNotice { text: string; href: string; kind: CardNoticeKind }
/**
 * Notices that only inform; the rest ask the person to do something. A late joiner has nothing to
 * clear in Compass (leads give feedback in person and already get an email), so it is FYI too.
 */
export const FYI_NOTICE_KINDS: ReadonlySet<CardNoticeKind> = new Set<CardNoticeKind>(['LIST_DECISION', 'HR_CHANGED_LISTS', 'LATE_JOINER'])

