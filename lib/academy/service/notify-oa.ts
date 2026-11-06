import type { PrismaClient } from '@prisma/client'
import { sendFirstPaymentSaveNotice, sendPaymentDetailsUpdatedNotification, sendPaymentSetupDoneNotice } from '@/lib/email'
import { sendRouteNotice, type SendResult } from './notify'

type SendNotification = typeof sendPaymentDetailsUpdatedNotification

/**
 * Tells OA a hire changed details OA may already have entered into payroll. A failed email never
 * fails the save, so it is logged, with the user id only, for OA not to miss it silently.
 */
export async function notifyPaymentDetailsChanged(
  userId: string,
  name: string,
  send: SendNotification = sendPaymentDetailsUpdatedNotification,
): Promise<void> {
  try {
    const result = await send(name)
    if (!result.success) console.error('[academy] payment details notification not delivered', { userId })
  } catch {
    console.error('[academy] payment details notification failed', { userId })
  }
}

export async function notifyFirstPaymentSave(
  db: PrismaClient,
  userId: string,
  name: string,
  send: (name: string) => Promise<SendResult> = sendFirstPaymentSaveNotice,
): Promise<void> {
  await sendRouteNotice(db, `first-save:${userId}`, () => send(name))
}

export async function notifyPaymentSetupDone(
  db: PrismaClient,
  userId: string,
  name: string,
  send: (name: string) => Promise<SendResult> = sendPaymentSetupDoneNotice,
): Promise<void> {
  await sendRouteNotice(db, `payment-done:${userId}`, () => send(name))
}
