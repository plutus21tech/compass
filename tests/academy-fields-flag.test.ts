import test from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { applyPendingBankDetailsSafely } from '../lib/academy/service/fields'

// Any use of this client throws, so a call that reaches the database shows up.
const untouchable = new Proxy({}, {
  get() { throw new Error('database was touched') },
}) as unknown as PrismaClient

async function withFlag(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const before = process.env.ONBOARDING_ACADEMY_ENABLED
  if (value === undefined) delete process.env.ONBOARDING_ACADEMY_ENABLED
  else process.env.ONBOARDING_ACADEMY_ENABLED = value
  try {
    await run()
  } finally {
    if (before === undefined) delete process.env.ONBOARDING_ACADEMY_ENABLED
    else process.env.ONBOARDING_ACADEMY_ENABLED = before
  }
}

test('applyPendingBankDetailsSafely does nothing, with no database call, when the Academy is off', async () => {
  await withFlag(undefined, async () => {
    const originalError = console.error
    const logged: unknown[][] = []
    console.error = (...args: unknown[]) => { logged.push(args) }
    try {
      await applyPendingBankDetailsSafely(untouchable, 'user-1')
    } finally {
      console.error = originalError
    }
    assert.equal(logged.length, 0)
  })
})

test('applyPendingBankDetailsSafely reaches the database, and logs rather than throws, when the Academy is on', async () => {
  await withFlag('true', async () => {
    const originalError = console.error
    const logged: unknown[][] = []
    console.error = (...args: unknown[]) => { logged.push(args) }
    try {
      await applyPendingBankDetailsSafely(untouchable, 'user-1')
    } finally {
      console.error = originalError
    }
    assert.equal(logged.length, 1)
  })
})
