import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { academyE2eSkipReason } from './academy-env'

// Fictional people on the local test database only (guarded by academyE2eSkipReason).
const PASSWORD = 'E2e-Fictional-Pass-1'
const STAFF = { id: 'lve-staff', name: 'Ana Torvik', email: 'ana.lve@example.test' }
const LEAD = { id: 'lve-lead', name: 'Layla Mercer', email: 'layla.lve@example.test' }
const ID_PREFIX = 'lve-'

test.skip(academyE2eSkipReason() !== null, academyE2eSkipReason() ?? '')

// A cold dev-server compile plus a POST that tries SMTP with blank credentials is slow.
test.describe.configure({ timeout: 120_000 })

const FIRST_LOAD = { timeout: 30_000 }
let nativeDialogs: string[] = []

// A native alert, confirm or prompt is a bug on this page. Record and dismiss it (throwing inside
// the handler would not fail the test); afterEach asserts none opened.
test.afterEach(() => {
  expect(nativeDialogs, 'native browser dialogs opened').toEqual([])
})

test.beforeEach(async ({ page }) => {
  nativeDialogs = []
  page.on('dialog', async (d) => {
    nativeDialogs.push(d.message())
    await d.dismiss()
  })
  // Never touch a database the guard refused.
  if (academyE2eSkipReason() !== null) return
  // Login limits persist in the database, so repeat runs would otherwise lock these accounts out.
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'login:%'`
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { startsWith: ID_PREFIX } } })
})

test.beforeAll(async () => {
  if (academyE2eSkipReason() !== null) return
  await removeFixtures()
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  for (const person of [STAFF, LEAD]) {
    await prisma.user.create({
      data: { ...person, role: 'EMPLOYEE', department: 'Product', passwordHash, onboardingCompleted: true },
    })
  }
  await prisma.evaluatorMapping.create({
    data: { evaluatorId: LEAD.id, evaluateeId: STAFF.id, relationshipType: 'TEAM_LEAD' },
  })
})

test.afterAll(async () => {
  if (academyE2eSkipReason() !== null) return
  await removeFixtures()
  await prisma.$disconnect()
})

/** Removes only rows whose ids start with `lve-`. */
async function removeFixtures(): Promise<void> {
  await prisma.leaveRequest.deleteMany({ where: { employeeId: { startsWith: ID_PREFIX } } })
  await prisma.leaveBalance.deleteMany({ where: { employeeId: { startsWith: ID_PREFIX } } })
  await prisma.evaluatorMapping.deleteMany({ where: { evaluatorId: { startsWith: ID_PREFIX } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: ID_PREFIX } } })
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

const pad = (n: number): string => String(n).padStart(2, '0')
const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function addDays(base: Date, days: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
}

/** The first Monday at least `minDays` from today, plus `offset` days (0 = Monday, 2 = Wednesday). */
function nextWeekday(minDays: number, offset: number): string {
  const from = addDays(new Date(), minDays)
  const toMonday = (8 - from.getDay()) % 7
  return dayKey(addDays(from, toMonday + offset))
}

/** The Monday of the second full week of next month, plus `offset` days. */
function secondMondayNextMonth(offset: number): string {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const firstMonday = addDays(first, (8 - first.getDay()) % 7)
  return dayKey(addDays(firstMonday, 7 + offset))
}

/** A pending Annual request for the staff member, created directly so the test starts from it. */
async function seedAnnualRequest(withPlan: boolean): Promise<string> {
  const [sy, sm, sd] = nextWeekday(10, 0).split('-').map(Number)
  const [ey, em, ed] = nextWeekday(10, 2).split('-').map(Number)
  const request = await prisma.leaveRequest.create({
    data: {
      employeeId: STAFF.id,
      leaveType: 'ANNUAL',
      startDate: new Date(Date.UTC(sy, sm - 1, sd)),
      endDate: new Date(Date.UTC(ey, em - 1, ed)),
      reason: 'Family trip',
      transitionPlan: '',
      status: 'PENDING',
      ...(withPlan
        ? {
            transitionPlanTasks: [
              { taskDetails: 'Weekly report', projectDept: '', assignedTo: '', accepted: null, deadline: null, completed: null, variance: '', links: '' },
            ],
            transitionPlanSubmittedAt: new Date(),
          }
        : {}),
    },
  })
  return request.id
}

async function dayCenter(page: Page, key: string): Promise<{ x: number; y: number }> {
  const cell = page.locator(`[data-day="${key}"]`)
  await cell.scrollIntoViewIfNeeded()
  const box = await cell.boundingBox()
  if (!box) throw new Error(`calendar cell ${key} has no box`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function dragAcross(page: Page, fromKey: string, toKey: string): Promise<void> {
  const from = await dayCenter(page, fromKey)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const to = await dayCenter(page, toKey)
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

test('request leave through the three steps', async ({ page }, testInfo) => {
  const start = nextWeekday(10, 0)
  const end = nextWeekday(10, 2)
  await signIn(page, STAFF.email)
  await page.goto('/leave?request=1')
  await expect(page.getByRole('heading', { name: 'Request leave' })).toBeVisible(FIRST_LOAD)

  await page.locator('#leave-start').fill(start)
  await page.locator('#leave-end').fill(end)
  await page.getByRole('radio', { name: /Annual/ }).click()
  await page.locator('#leave-reason').fill('Family trip')
  await expect(page.getByText('3 working days')).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }

  await page.getByRole('button', { name: 'Next: Handover' }).click()
  await expect(page.getByText('This leave needs a transition plan')).toBeVisible()
  await page.getByRole('button', { name: 'Next: People and review' }).click()
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByText('Leave request submitted!')).toBeVisible(FIRST_LOAD)
  await expect(page.getByRole('heading', { name: 'Request leave' })).toBeHidden()

  const latest = async () =>
    prisma.leaveRequest.findFirst({ where: { employeeId: STAFF.id }, select: { status: true, leaveType: true } })
  await expect.poll(latest, { timeout: 15_000 }).toEqual({ status: 'PENDING', leaveType: 'ANNUAL' })
  await expect.poll(() => page.url()).not.toContain('request=1')
})

test('cancel asks in a dialog', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only')
  const id = await seedAnnualRequest(false)
  await signIn(page, STAFF.email)
  await page.goto('/leave')
  await expect(page.getByRole('heading', { name: 'My requests' })).toBeVisible(FIRST_LOAD)

  await page.getByRole('button', { name: 'Cancel request' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Cancel this leave request?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel request' }).click()

  const status = async () => (await prisma.leaveRequest.findUnique({ where: { id }, select: { status: true } }))?.status
  await expect.poll(status, { timeout: 15_000 }).toBe('CANCELLED')
})

test('drag across days opens the panel with those dates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only')
  await signIn(page, STAFF.email)
  await page.goto('/leave')
  await page.getByRole('button', { name: 'Next month' }).click()

  const monday = secondMondayNextMonth(0)
  const wednesday = secondMondayNextMonth(2)
  await expect(page.locator(`[data-day="${monday}"]`)).toBeVisible(FIRST_LOAD)
  await dragAcross(page, monday, wednesday)
  await expect(page.getByRole('heading', { name: 'Request leave' })).toBeVisible()
  await expect(page.locator('#leave-start')).toHaveValue(monday)
  await expect(page.locator('#leave-end')).toHaveValue(wednesday)

  await page.locator('#leave-reason').fill('Conference week')
  const tuesday = secondMondayNextMonth(1)
  const thursday = secondMondayNextMonth(3)
  await dragAcross(page, tuesday, thursday)
  await expect(page.locator('#leave-start')).toHaveValue(tuesday)
  await expect(page.locator('#leave-end')).toHaveValue(thursday)
  await expect(page.locator('#leave-reason')).toHaveValue('Conference week')
})

test('a lead disapproves a plan with a reason from an email link', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop only')
  const id = await seedAnnualRequest(true)
  await signIn(page, LEAD.email)
  await page.goto(`/leave?requestId=${id}`)

  const card = page.locator(`#leave-approval-${id}`)
  await expect(card).toHaveAttribute('aria-current', 'true', FIRST_LOAD)
  await expect(card.getByText('Opened from email')).toBeVisible(FIRST_LOAD)

  await card.getByRole('button', { name: 'Disapprove plan' }).click()
  const reason = 'Please name a cover for the weekly report.'
  await page.locator('#plan-disapprove-reason').fill(reason)
  await page.getByRole('button', { name: 'Send back' }).click()

  const review = async () =>
    prisma.leaveRequest.findUnique({
      where: { id },
      select: { transitionPlanLeadStatus: true, transitionPlanDisapprovalReason: true },
    })
  await expect
    .poll(review, { timeout: 15_000 })
    .toEqual({ transitionPlanLeadStatus: 'DISAPPROVED', transitionPlanDisapprovalReason: reason })
})
