import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { academyE2eSkipReason } from './academy-env'

// Fictional people on the local test database only (guarded by academyE2eSkipReason).
const PASSWORD = 'E2e-Fictional-Pass-1'
const STAFF = { id: 'pfe-staff', name: 'Ines Varga', email: 'ines.pfe@example.test', role: 'EMPLOYEE', position: 'Analyst' }
const LEAD = { id: 'pfe-lead', name: 'Jonas Reuter', email: 'jonas.pfe@example.test', role: 'EMPLOYEE', position: 'Lead' }
const HR = { id: 'pfe-hr', name: 'Kaia Lindqvist', email: 'kaia.pfe@example.test', role: 'HR', position: 'HR Executive' }
const OURS = { startsWith: 'pfe-' }
const SHOTS = process.env.PROFILE_E2E_SHOTS

test.skip(academyE2eSkipReason() !== null, academyE2eSkipReason() ?? '')
test.describe.configure({ timeout: 120_000 })

const FIRST_LOAD = { timeout: 30_000 }

async function removeFixtures(): Promise<void> {
  await prisma.payrollReceipt.deleteMany({ where: { periodId: OURS } })
  await prisma.payrollPeriod.deleteMany({ where: { id: OURS } })
  await prisma.project.deleteMany({ where: { id: OURS } })
  await prisma.leaveRequest.deleteMany({ where: { employeeId: OURS } })
  await prisma.evaluatorMapping.deleteMany({ where: { evaluatorId: OURS } })
  await prisma.user.deleteMany({ where: { id: OURS } })
}

test.beforeAll(async () => {
  if (academyE2eSkipReason() !== null) return
  await removeFixtures()
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  for (const person of [STAFF, LEAD, HR]) {
    await prisma.user.create({
      data: { ...person, role: person.role as 'EMPLOYEE' | 'HR', department: 'Product', passwordHash, onboardingCompleted: true },
    })
  }
  await prisma.evaluatorMapping.create({ data: { evaluatorId: LEAD.id, evaluateeId: STAFF.id, relationshipType: 'TEAM_LEAD' } })
  await prisma.project.create({
    data: { id: 'pfe-project', name: 'Pfe Lighthouse', ownerId: LEAD.id, status: 'ACTIVE', members: { create: { userId: STAFF.id } } },
  })
  const soon = new Date(Date.now() + 10 * 86_400_000)
  const start = new Date(Date.UTC(soon.getUTCFullYear(), soon.getUTCMonth(), soon.getUTCDate()))
  await prisma.leaveRequest.create({
    data: { employeeId: LEAD.id, leaveType: 'ANNUAL', startDate: start, endDate: start, reason: 'Trip', transitionPlan: '', status: 'APPROVED' },
  })
  for (const [id, month, basicSalary] of [['pfe-pay-1', 7, 90000], ['pfe-pay-2', 8, 110000]] as const) {
    const periodStart = new Date(Date.UTC(2026, month, 1))
    await prisma.payrollPeriod.create({ data: { id, label: id, periodStart, periodEnd: periodStart, status: 'LOCKED', currency: 'PKR' } })
    await prisma.payrollReceipt.create({
      data: { periodId: id, userId: STAFF.id, payrollName: STAFF.name, status: 'SENT', receiptJson: { earnings: { basicSalary } } },
    })
  }
})

test.beforeEach(async () => {
  if (academyE2eSkipReason() !== null) return
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'login:%'`
})

test.afterAll(async () => {
  if (academyE2eSkipReason() !== null) return
  await removeFixtures()
  await prisma.$disconnect()
})

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  const submit = page.locator('button[type="submit"]')
  await expect(submit).toBeEnabled()
  await submit.click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${test.info().project.name}.png`, fullPage: true })
}

test('a colleague opens a profile from People and sees no pay', async ({ page }) => {
  await signIn(page, LEAD.email)
  await page.goto('/people')
  await page.getByRole('link', { name: STAFF.name }).first().click(FIRST_LOAD)
  await page.waitForURL(`**/people/${STAFF.id}`)
  await expect(page.getByRole('heading', { level: 1, name: STAFF.name })).toBeVisible(FIRST_LOAD)
  await expect(page.getByRole('link', { name: STAFF.email })).toBeVisible()
  await expect(page.getByText('Pfe Lighthouse')).toBeVisible()
  await expect(page.getByRole('img', { name: `${STAFF.name}'s office avatar` })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pay' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^(Edit|Add)$/ })).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await shot(page, 'profile-colleague')
})

test('upcoming approved leave shows on the profile', async ({ page }) => {
  await signIn(page, STAFF.email)
  await page.goto(`/people/${LEAD.id}`)
  await expect(page.getByRole('heading', { level: 1, name: LEAD.name })).toBeVisible(FIRST_LOAD)
  await expect(page.getByText('Annual')).toBeVisible()
})

test('you can write your own about-me, and it stays after a reload', async ({ page }) => {
  await prisma.profileDetail.deleteMany({ where: { userId: STAFF.id } })
  await signIn(page, STAFF.email)
  await page.goto(`/people/${STAFF.id}`)
  await page.getByRole('button', { name: 'Add' }).click(FIRST_LOAD)
  await page.getByLabel('About me').fill('I turn messy data into tidy reports.')
  await page.getByLabel('Fun fact').fill('I have visited 12 lighthouses.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('I turn messy data into tidy reports.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('I have visited 12 lighthouses.')).toBeVisible(FIRST_LOAD)
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
  await shot(page, 'profile-own')
})

test('HR sees pay only after asking for it; a colleague is refused by the server', async ({ page }) => {
  await signIn(page, HR.email)
  await page.goto(`/people/${STAFF.id}`)
  await expect(page.getByRole('heading', { name: 'Pay' })).toBeVisible(FIRST_LOAD)
  await expect(page.getByText('PKR 110,000')).toHaveCount(0)
  await page.getByRole('button', { name: 'Show pay history' }).click()
  await expect(page.getByText('PKR 110,000').first()).toBeVisible()
  await expect(page.getByText('PKR 90,000')).toBeVisible()
  await shot(page, 'profile-hr-pay')

  await page.context().clearCookies()
  await signIn(page, LEAD.email)
  const refused = await page.request.get(`/api/people/${STAFF.id}/compensation`)
  expect(refused.status()).toBe(403)
  const missing = await page.request.get('/api/people/pfe-nobody')
  expect(missing.status()).toBe(404)
})

test('the Calendar page has its new name and filters', async ({ page }) => {
  await signIn(page, STAFF.email)
  await page.goto('/leave')
  await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible(FIRST_LOAD)
  const show = page.getByRole('group', { name: 'Show on the calendar' })
  await expect(show.getByRole('button', { name: 'Everything' })).toHaveAttribute('aria-pressed', 'true', FIRST_LOAD)
  await show.getByRole('button', { name: 'Birthdays' }).click()
  await expect(show.getByRole('button', { name: 'Birthdays' })).toHaveAttribute('aria-pressed', 'true')
  await show.getByRole('button', { name: 'Public holidays' }).click()
  await expect(show.getByRole('button', { name: 'Public holidays' })).toHaveAttribute('aria-pressed', 'true')
  await shot(page, 'calendar-filters')
})
