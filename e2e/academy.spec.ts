import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { P } from '../tests/helpers/academy-test-db'
import { HIRE_ID, NEW_HIRE_ID, cleanCourse, createReadyHire, createReleasedHire, scrollAndComplete } from '../tests/helpers/academy-course-fixtures'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { loadModule } from '../lib/academy/service/course'
import { academyE2eSkipReason } from './academy-env'

// Fictional password for fictional people on the local test database only.
const PASSWORD = 'E2e-Fictional-Pass-1'

test.skip(academyE2eSkipReason() !== null, academyE2eSkipReason() ?? '')

async function giveLogins(...ids: string[]): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  await prisma.user.updateMany({ where: { id: { in: ids } }, data: { passwordHash } })
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  const submit = page.locator('button[type="submit"]')
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

test.afterAll(async () => {
  // Never touch a database the guard refused.
  if (academyE2eSkipReason() !== null) return
  await cleanCourse()
  await prisma.$disconnect()
})

test('a hire finishes Day 1 Module 5 (How We Work)', async ({ page }) => {
  await createReleasedHire()
  await giveLogins(HIRE_ID)
  // Modules 1 to 4 through the services, so module 5 is the first one the hire opens in the browser.
  await scrollAndComplete('welcome')
  await scrollAndComplete('culture-values')
  await recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'CHECK', key: 'buddy-hello', checked: true })
  await completeModule(prisma, HIRE_ID, 'team-contacts')
  const four = await loadModule(prisma, HIRE_ID, 'role-90-days')
  for (const t of four.tutorials) await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'LINK_OPENED', key: t.key })
  await completeModule(prisma, HIRE_ID, 'role-90-days')

  await signIn(page, P.hire.email)
  await page.goto('/onboarding/how-we-work')
  const complete = page.getByRole('button', { name: 'Mark complete and continue' })
  await expect(complete).toHaveAttribute('aria-disabled', 'true')

  // The page scrolls inside the app shell, so bring the end-of-content marker into view.
  await page.locator('div.h-px[aria-hidden]').last().scrollIntoViewIfNeeded()
  await expect(complete).not.toHaveAttribute('aria-disabled', 'true')
  await complete.click()
  await expect(page.getByRole('status').filter({ hasText: 'Module complete' })).toBeVisible()

  const row = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, module: { slug: 'how-we-work' } } })
  expect(row.status).toBe('COMPLETED')
})

test('HR releases a course from the setup section', async ({ page }) => {
  await createReadyHire()
  await giveLogins(P.hr.id)
  expect(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } })).toBe(0)

  await signIn(page, P.hr.email)
  await page.goto(`/admin/onboarding/new-hires/${NEW_HIRE_ID}`)
  await page.getByRole('heading', { name: 'Onboarding Academy setup' }).waitFor()
  await page.getByRole('button', { name: 'Release course' }).click()
  await expect(page.getByText('Course released')).toBeVisible()

  expect(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } })).toBe(14)
})
