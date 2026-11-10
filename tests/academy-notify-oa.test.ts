import test from 'node:test'
import assert from 'node:assert/strict'
import { notifyPaymentDetailsChanged } from '../lib/academy/service/notify-oa'

async function quietly(run: () => Promise<void>): Promise<unknown[][]> {
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    await run()
  } finally {
    console.error = original
  }
  return logged
}

test('the notification carries the name and nothing else', async () => {
  const sent: string[] = []
  await notifyPaymentDetailsChanged('user-1', 'Cara Lindqvist', async (name) => {
    sent.push(name)
    return { success: true, data: { messageId: 'm1' } }
  })
  assert.deepEqual(sent, ['Cara Lindqvist'])
})

test('an email that throws does not fail the save, and is logged with the user id', async () => {
  const logged = await quietly(() => notifyPaymentDetailsChanged('user-1', 'Cara', async () => { throw new Error('smtp down') }))
  assert.deepEqual(logged[0][1], { userId: 'user-1' })
})

test('an email that was not delivered does not fail the save, and is logged', async () => {
  const logged = await quietly(() => notifyPaymentDetailsChanged('user-1', 'Cara', async () => ({ success: false, message: 'no recipients' })))
  assert.equal(logged.length, 1)
})
