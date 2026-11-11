// Bell notifications: Compass rows plus the Security Checks inbox, merged for the header bell.
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { listNotifications, markRead, unreadCount } from '@/lib/security-checks/service/inbox'

export const BELL_PAGE_SIZE = 30
export const BELL_RETENTION_DAYS = 90
export const TITLE_MAX = 200

const DAY_MS = 24 * 60 * 60 * 1000
const CONSOLE_KINDS: ReadonlySet<string> = new Set(['OVERDUE_DIGEST', 'UNREVIEWED_EXPIRED', 'SELF_REVIEW_REPORT'])

export type NotificationKind =
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'PLAN_REMINDER'
  | 'PLAN_DEADLINE_NOTICE'
  | 'PLAN_FINAL_WARNING'
  | 'PLAN_DISAPPROVED'
  | 'WFH_APPROVED'
  | 'WFH_REJECTED'
  | 'WEEKLY_LIST_DECISION'
  | 'WEEKLY_LIST_CHANGED'
  | 'WEEKLY_FORMS_OPEN'

export interface NewNotification {
  userId: string
  kind: NotificationKind
  title: string
  link: string
  dedupeKey?: string
}

type Db = PrismaClient | Prisma.TransactionClient

export function isInternalLink(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') && !/\s/.test(link)
}

export async function recordNotifications(rows: readonly NewNotification[], db: Db = prisma): Promise<number> {
  const data = rows
    .filter((row) => isInternalLink(row.link))
    .map((row) => ({
      userId: row.userId,
      kind: row.kind,
      title: row.title.slice(0, TITLE_MAX),
      link: row.link,
      dedupeKey: row.dedupeKey ?? null,
    }))
  if (data.length === 0) return 0
  const result = await db.userNotification.createMany({ data, skipDuplicates: true })
  return result.count
}

export async function recordNotificationsSafely(
  label: string,
  rows: readonly NewNotification[] | (() => Promise<readonly NewNotification[]>),
  db: Db = prisma,
): Promise<void> {
  try {
    const resolved = typeof rows === 'function' ? await rows() : rows
    await recordNotifications(resolved, db)
  } catch (error) {
    console.error('[notifications] ' + label + ' failed', { error })
  }
}

export type BellSource = 'compass' | 'security'

export interface BellItem {
  id: string
  source: BellSource
  kind: string
  title: string
  detail: string | null
  href: string
  createdAt: string
  read: boolean
}

export interface BellRef {
  source: BellSource
  id: string
}

export function securityNoticeHref(kind: string, taskId: string | null): string {
  if (CONSOLE_KINDS.has(kind)) return '/security-checks/console'
  return taskId ? `/security-checks/${taskId}` : '/security-checks'
}

export async function listBell(
  userId: string,
  options: { now: Date; securityChecks: boolean },
  db: Db = prisma,
): Promise<{ items: BellItem[]; unread: number }> {
  const since = new Date(options.now.getTime() - BELL_RETENTION_DAYS * DAY_MS)
  const window = { userId, createdAt: { gte: since } }
  const [rows, compassUnread] = await Promise.all([
    db.userNotification.findMany({ where: window, orderBy: { createdAt: 'desc' }, take: BELL_PAGE_SIZE }),
    db.userNotification.count({ where: { ...window, readAt: null } }),
  ])
  const compass: BellItem[] = rows.map((row) => ({
    id: row.id,
    source: 'compass',
    kind: row.kind,
    title: row.title,
    detail: null,
    href: row.link,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  }))
  let security: BellItem[] = []
  let securityUnread = 0
  if (options.securityChecks) {
    const [notices, count] = await Promise.all([listNotifications(userId), unreadCount(userId)])
    security = notices.map((notice) => ({
      id: notice.id,
      source: 'security',
      kind: notice.kind,
      title: notice.title,
      detail: notice.body,
      href: securityNoticeHref(notice.kind, notice.taskId),
      createdAt: notice.createdAt,
      read: notice.read,
    }))
    securityUnread = count
  }
  const items = [...compass, ...security]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, BELL_PAGE_SIZE)
  return { items, unread: compassUnread + securityUnread }
}

export async function markBellRead(
  userId: string,
  refs: readonly BellRef[],
  now: Date,
  options: { securityChecks: boolean },
  db: Db = prisma,
): Promise<number> {
  const compassIds = refs.filter((ref) => ref.source === 'compass').map((ref) => ref.id)
  const securityIds = refs.filter((ref) => ref.source === 'security').map((ref) => ref.id)
  let updated = 0
  if (compassIds.length > 0) {
    const result = await db.userNotification.updateMany({
      where: { userId, readAt: null, id: { in: compassIds } },
      data: { readAt: now },
    })
    updated += result.count
  }
  if (options.securityChecks && securityIds.length > 0) updated += await markRead(userId, securityIds, now)
  return updated
}
