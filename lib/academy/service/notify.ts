import type { PrismaClient } from '@prisma/client'
import { sendCourseReleasedNotice, sendLinkedinSubmittedNotice } from '@/lib/email'

export type SendResult = { success: boolean }
export type Delivery = 'SENT' | 'ALREADY_SENT' | 'FAILED'

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown')

async function attempt(key: string, send: () => Promise<SendResult>): Promise<boolean> {
  try {
    if ((await send()).success) return true
    console.error('[academy] notice not delivered', { key })
    return false
  } catch (error) {
    // Only the error's name: a mail error can quote the address.
    console.error('[academy] notice failed', { key, error: errorName(error) })
    return false
  }
}

async function releaseKey(db: PrismaClient, key: string): Promise<void> {
  try {
    await db.onboardingNotificationLog.deleteMany({ where: { key } })
  } catch (error) {
    // The row stays, so this notice won't be retried: the log line is the only trace of that.
    console.error('[academy] notice key could not be released', { key, error: errorName(error) })
  }
}

/**
 * The row goes in first, so only one of any number of overlapping callers ever sends. A failed send
 * takes its row back out, so a later run can try again. Throws only if the log itself can't be written.
 */
export async function deliverOnce(db: PrismaClient, key: string, send: () => Promise<SendResult>): Promise<Delivery> {
  const { count } = await db.onboardingNotificationLog.createMany({ data: [{ key }], skipDuplicates: true })
  if (count === 0) return 'ALREADY_SENT'
  if (await attempt(key, send)) return 'SENT'
  await releaseKey(db, key)
  return 'FAILED'
}

/** True only when this call sent the notice. */
export async function sendOnce(db: PrismaClient, key: string, send: () => Promise<SendResult>): Promise<boolean> {
  return (await deliverOnce(db, key, send)) === 'SENT'
}

/** For `after()`: a route's notice must never fail or disturb the action it follows. */
export async function sendRouteNotice(db: PrismaClient, key: string, send: () => Promise<SendResult>): Promise<Delivery> {
  try {
    return await deliverOnce(db, key, send)
  } catch (error) {
    console.error('[academy] notice could not be logged', { key, error: errorName(error) })
    return 'FAILED'
  }
}

export async function notifyCourseReleased(
  db: PrismaClient,
  newHireId: string,
  send: (to: string, name: string) => Promise<SendResult> = sendCourseReleasedNotice,
): Promise<void> {
  const key = `released:${newHireId}`
  try {
    const hire = await db.newHire.findUnique({
      where: { id: newHireId },
      select: { name: true, preferredName: true, email: true, user: { select: { name: true, email: true } } },
    })
    if (!hire) return
    const to = hire.user?.email ?? hire.email
    const name = hire.preferredName?.trim() || hire.user?.name || hire.name
    await sendRouteNotice(db, key, () => send(to, name))
  } catch (error) {
    console.error('[academy] notice could not be prepared', { key, error: errorName(error) })
  }
}

export async function notifyLinkedinSubmitted(
  db: PrismaClient,
  userId: string,
  name: string,
  send: (name: string) => Promise<SendResult> = sendLinkedinSubmittedNotice,
): Promise<void> {
  await sendRouteNotice(db, `linkedin:${userId}`, () => send(name))
}
