import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { P } from '../tests/helpers/academy-test-db'
import { CONTRACTOR_ATTRIBUTES, HIRE_ID, NEW_HIRE_ID, cleanCourse, createReadyHire, createReleasedHire, failQuizAttempt, openPaymentModule, scrollAndComplete } from '../tests/helpers/academy-course-fixtures'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { saveLinkedinUrl } from '../lib/academy/service/fields'
import { unlockModule } from '../lib/academy/service/tracker-actions'
import { setPersonAttributes } from '../lib/academy/service/attributes'
import { savePayout } from '../lib/academy/service/payout'
import { requestReread } from '../lib/academy/service/assignment'
import { loadModule } from '../lib/academy/service/course'
import { academyE2eSkipReason } from './academy-env'
import { VALUES_STATEMENT } from '../lib/academy/quiz'

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

// Login limits persist in the database, so repeat runs would otherwise lock these accounts out.
test.beforeEach(async () => {
  // Never touch a database the guard refused.
  if (academyE2eSkipReason() !== null) return
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'login:%'`
})

test.afterAll(async () => {
  // Never touch a database the guard refused.
  if (academyE2eSkipReason() !== null) return
  await removeFormHire()
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

  // The completed row, not the "Module complete" status: that goes as soon as the next module opens.
  const status = async () => {
    const row = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, module: { slug: 'how-we-work' } } })
    return row.status
  }
  await expect.poll(status, { timeout: 15_000 }).toBe('COMPLETED')
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

// A fictional person on the company domain, which the create-user route requires for a new hire.
const FORM_HIRE = { name: 'Dara Quill', email: 'act-e2e-dara@plutus21.com' }

/** The form creates the user, hire and position with generated ids, so they are removed by email. */
async function removeFormHire(): Promise<void> {
  const hires = await prisma.newHire.findMany({ where: { email: FORM_HIRE.email }, select: { id: true, positionId: true } })
  await prisma.newHire.deleteMany({ where: { id: { in: hires.map((h) => h.id) } } })
  await prisma.position.deleteMany({ where: { id: { in: hires.map((h) => h.positionId) } } })
  const users = await prisma.user.findMany({ where: { email: FORM_HIRE.email }, select: { id: true } })
  await prisma.payrollEmployeeProfile.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
}

async function pick(page: Page, triggerId: string, option: string): Promise<void> {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

test('HR ticks "requires onboarding" on a new user, and that hire starts the course at first sign-in', async ({ page, browser }) => {
  await removeFormHire()
  await createReadyHire()
  await giveLogins(P.hr.id)
  try {
    await signIn(page, P.hr.email)
    await page.goto('/admin/users')
    await page.getByRole('button', { name: 'Add User' }).click()
    await page.locator('#name').fill(FORM_HIRE.name)
    await page.locator('#email').fill(FORM_HIRE.email)
    await page.getByRole('switch').first().click()
    await expect(page.getByText('Link an existing new-hire record (optional)')).toBeVisible()
    await page.locator('#new-hire-joining-date').fill('2027-01-18')
    await pick(page, 'attr-office', 'Karachi')
    await pick(page, 'attr-mode', 'Hybrid')
    await pick(page, 'attr-contract', 'Pakistan employment contract')
    await pick(page, 'attr-status', 'Permanent')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // The switch's caption says the same thing, so wait for the toast's own opening words.
    await expect(page.getByText(/^User created. They'll start the Onboarding Academy/)).toBeVisible()

    const user = await prisma.user.findFirstOrThrow({ where: { email: FORM_HIRE.email } })
    expect(user.onboardingCompleted).toBe(false)
    expect(await prisma.onboardingProgress.count({ where: { userId: user.id } })).toBe(14)
    const hire = await prisma.newHire.findFirstOrThrow({ where: { userId: user.id } })
    expect(hire.academyReleasedAt).not.toBeNull()

    await giveLogins(user.id)
    const hirePage = await (await browser.newContext()).newPage()
    await signIn(hirePage, FORM_HIRE.email)
    await hirePage.goto('/dashboard')
    await hirePage.waitForURL((url) => url.pathname.startsWith('/onboarding'))
    await expect(hirePage.getByRole('heading', { name: 'UP NEXT' })).toBeVisible()
    await expect(hirePage.locator('a[href="/onboarding/welcome"]').first()).toBeVisible()
  } finally {
    await removeFormHire()
  }
})

// The quiz and completion routes, through the real browser session: routes have no session seam for unit tests.
const NEW_ROUTES = [
  { method: 'GET', url: '/api/onboarding/academy/quiz' },
  { method: 'POST', url: '/api/onboarding/academy/quiz' },
  { method: 'POST', url: '/api/onboarding/academy/quiz/acknowledgement' },
  { method: 'GET', url: '/api/onboarding/academy/certificate' },
] as const

/** Every module done and the Security SOPs signed: the hire is at the quiz. */
async function readyForQuiz(): Promise<void> {
  await createReleasedHire()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { status: 'COMPLETED', completedAt: new Date() } })
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'Fictional SOPs statement', typedName: P.hire.name },
  })
}

/** Answers the paper on screen The first `wrong` questions are answered wrongly. */
async function answerPaper(page: Page, wrong: number): Promise<void> {
  const bank = await prisma.onboardingQuizQuestion.findMany({ where: { isActive: true, retiredAt: null } })
  const byText = new Map(bank.map((q) => [q.questionText, q]))
  for (let i = 0; ; i++) {
    const legend = page.locator('legend')
    await legend.waitFor()
    const question = byText.get((await legend.innerText()).trim())
    expect(question, 'the question on screen is in the bank').toBeTruthy()
    const options = question!.optionsJson as string[]
    const choice = i < wrong ? options.find((o) => o !== question!.correctAnswer)! : question!.correctAnswer
    await page.locator('label', { has: page.getByText(choice, { exact: true }) }).click()
    const submit = page.getByRole('button', { name: /^(Next|Submit)$/ })
    const last = (await submit.innerText()).trim() === 'Submit'
    await submit.click()
    if (last) return
    await expect(legend).not.toHaveText(question!.questionText)
  }
}

test('anonymous requests to the quiz and certificate routes get 401', async ({ request }) => {
  for (const { method, url } of NEW_ROUTES) {
    const response = await request.fetch(url, { method, data: method === 'POST' ? {} : undefined })
    expect(response.status(), `${method} ${url}`).toBe(401)
  }
})

test('a non-HR person is refused at the release route', async ({ page }) => {
  await createReadyHire()
  await giveLogins(P.staff.id)
  await signIn(page, P.staff.email)
  const response = await page.request.post(`/api/admin/onboarding/new-hires/${NEW_HIRE_ID}/release`)
  expect(response.status()).toBe(403)
  expect(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } })).toBe(0)
})

test('the certificate is a 404 for a hire who has not finished', async ({ page }) => {
  await readyForQuiz()
  await giveLogins(HIRE_ID)
  await signIn(page, P.hire.email)
  const response = await page.request.get('/api/onboarding/academy/certificate')
  expect(response.status()).toBe(404)
})

test('a failed quiz shows the wait and does not offer the retake yet', async ({ page }) => {
  await readyForQuiz()
  await giveLogins(HIRE_ID)
  await signIn(page, P.hire.email)
  await page.goto('/onboarding/quiz')
  await answerPaper(page, 3)

  await expect(page.getByText(/You can retake the quiz after/)).toBeVisible()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retake' })).toHaveCount(0)
  expect(await prisma.quizAttempt.count({ where: { userId: HIRE_ID, passed: false } })).toBe(1)
})

test('a hire passes the quiz, signs, sees the completion screen, downloads the PDF and reaches the dashboard', async ({ page }) => {
  await readyForQuiz()
  await giveLogins(HIRE_ID)
  await signIn(page, P.hire.email)
  await page.goto('/onboarding/quiz')
  await answerPaper(page, 0)

  await page.getByRole('button', { name: 'Sign your acknowledgement' }).click()
  await expect(page.getByText(VALUES_STATEMENT)).toBeVisible()
  await page.locator('#ack-agree').click()
  await page.locator('#ack-name').fill(P.hire.name)
  await page.getByRole('button', { name: 'Sign', exact: true }).click()

  await page.waitForURL('**/onboarding/complete')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WELCOME TO THE')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  expect(user.onboardingCompleted).toBe(true)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download your certificate' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('plutus21-academy-certificate.pdf')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).subarray(0, 5).toString('latin1')).toBe('%PDF-')

  await page.getByRole('link', { name: 'Go to Compass' }).click()
  await page.waitForURL('**/dashboard')
})

test('HR edits a module and publishes, and a hire sees it', async ({ page, browser }) => {
  test.setTimeout(180_000)
  await createReleasedHire()
  await giveLogins(HIRE_ID, P.hr.id)
  await scrollAndComplete('welcome')
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'culture-values' } })

  await signIn(page, P.hr.email)
  await page.goto(`/admin/onboarding/academy/modules/${module.id}`)
  const summary = page.getByLabel('Summary')
  await summary.fill('Our values, in fewer words.')

  // Unsaved work is not lost to a stray link.
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('link', { name: 'All modules' }).click()
  await expect(summary).toHaveValue('Our values, in fewer words.')

  await page.getByLabel('What changed?').fill('Shorter summary')
  await page.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(page.getByText('Live: version 2')).toBeVisible({ timeout: 30_000 })

  const context = await browser.newContext({ baseURL: page.url().split('/admin')[0] })
  const hire = await context.newPage()
  await signIn(hire, P.hire.email)
  await hire.goto('/onboarding/culture-values')
  await expect(hire.getByText('Our values, in fewer words.')).toBeVisible()
  await context.close()
})

// Fictional test key, not a real secret. The dev server gets the same default from playwright.config.ts.
process.env.ONBOARDING_FIELD_ENCRYPTION_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

async function openHireDrawer(page: Page): Promise<void> {
  await page.goto('/admin/onboarding/tracker')
  await page.getByRole('button', { name: `Open ${P.hire.name}` }).first().click()
  await page.getByRole('heading', { name: 'HR checklist' }).waitFor()
}

test('HR ticks a late checklist item with a reason and verifies LinkedIn from the tracker drawer', async ({ page }) => {
  await createReleasedHire()
  await giveLogins(P.hr.id)
  // HR opens the LinkedIn module early, the way the tracker does, so the hire can save a link.
  const linkedinModule = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'linkedin' } })
  await unlockModule(prisma, NEW_HIRE_ID, linkedinModule.id, P.hr.id)
  await saveLinkedinUrl(prisma, HIRE_ID, 'https://www.linkedin.com/in/cara-lindqvist')
  // A joining date well in the past makes every manual item overdue, so ticking one has to carry a reason.
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { onboardingDate: new Date(Date.now() - 30 * 86_400_000) } })
  const item = await prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId: NEW_HIRE_ID, templateItem: { key: 'contract-signed' } } })

  await signIn(page, P.hr.email)
  await openHireDrawer(page)

  await page.getByLabel('Signed contract on file').click()
  await page.getByLabel('Reason for missing this date').fill('Waiting on the countersigned copy')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Item ticked')).toBeVisible()
  const ticked = await prisma.onboardingChecklistItem.findUniqueOrThrow({ where: { id: item.id } })
  expect(ticked.doneAt).not.toBeNull()
  expect(ticked.missReason).toBe('Waiting on the countersigned copy')

  await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await expect(page.getByText('LinkedIn verified')).toBeVisible()
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  expect(hire.linkedinVerifiedAt).not.toBeNull()
})

test('OA sees only payment data in the tracker, and a reveal is logged', async ({ page }) => {
  test.setTimeout(120_000)
  await createReleasedHire()
  await prisma.user.create({ data: { ...P.oa, onboardingCompleted: true } })
  await giveLogins(P.oa.id)
  await setPersonAttributes(prisma, HIRE_ID, CONTRACTOR_ATTRIBUTES)
  await openPaymentModule()
  await savePayout(prisma, HIRE_ID, { method: 'WISE', accountHolderName: 'Cara', payoutEmail: 'cara@example.test', currency: 'USD' })

  await signIn(page, P.oa.email)
  const tracker = await page.request.get('/api/admin/onboarding/tracker')
  expect(tracker.status()).toBe(200)
  const rows = (await tracker.json()).data as Record<string, unknown>[]
  expect(rows.length).toBeGreaterThan(0)
  for (const row of rows) {
    expect(Object.keys(row).sort()).toEqual(['department', 'joiningDate', 'name', 'newHireId', 'paymentStatus'].sort())
  }
  // The full drawer is HR only.
  expect((await page.request.get(`/api/admin/onboarding/tracker/${NEW_HIRE_ID}`)).status()).toBe(403)

  await page.goto('/oa/payment-details')
  await page.getByRole('button', { name: /View details/ }).first().click()
  await expect(page.getByText('Revealing is logged')).toBeVisible()
  expect(await prisma.onboardingPaymentRevealLog.count({ where: { paymentUserId: HIRE_ID } })).toBe(0)
  await page.getByRole('button', { name: 'Reveal' }).click()
  await expect(page.getByRole('button', { name: 'Hide' })).toBeVisible()
  const logs = await prisma.onboardingPaymentRevealLog.findMany({ where: { paymentUserId: HIRE_ID } })
  expect(logs.map((l) => l.viewerId)).toEqual([P.oa.id])
})

const HR_ONLY_ROUTES = [
  { method: 'GET', url: '/api/admin/onboarding/tracker' },
  { method: 'GET', url: `/api/admin/onboarding/tracker/${NEW_HIRE_ID}` },
  { method: 'POST', url: `/api/admin/onboarding/tracker/${NEW_HIRE_ID}/unlock` },
  { method: 'POST', url: `/api/admin/onboarding/tracker/${NEW_HIRE_ID}/verify-linkedin` },
  { method: 'POST', url: `/api/admin/onboarding/tracker/${NEW_HIRE_ID}/clear-quiz` },
  { method: 'GET', url: `/api/admin/onboarding/tracker/${NEW_HIRE_ID}/acknowledgements` },
  { method: 'GET', url: '/api/admin/onboarding/checklist-template' },
  { method: 'POST', url: '/api/admin/onboarding/checklist-template' },
  { method: 'GET', url: '/api/admin/onboarding/content' },
  { method: 'POST', url: '/api/admin/onboarding/content/none/publish' },
  { method: 'POST', url: '/api/admin/onboarding/assign' },
  { method: 'GET', url: `/api/admin/onboarding/payout/${HIRE_ID}` },
  { method: 'POST', url: `/api/admin/onboarding/payout/${HIRE_ID}/reveal` },
] as const

test('a plain employee is refused with 403 at every new HR route', async ({ page }) => {
  await createReadyHire()
  await giveLogins(P.staff.id)
  await signIn(page, P.staff.email)
  for (const { method, url } of HR_ONLY_ROUTES) {
    const response = await page.request.fetch(url, { method, data: method === 'GET' ? undefined : {} })
    expect(response.status(), `${method} ${url}`).toBe(403)
  }
  expect(await prisma.onboardingPaymentRevealLog.count({ where: { paymentUserId: HIRE_ID } })).toBe(0)
})

test('a re-read leaves an existing employee unlocked and shows the module on their dashboard', async ({ page }) => {
  await createReadyHire()
  await giveLogins(P.staff.id)
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  await requestReread(prisma, module.id, P.hr.id)
  const row = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: P.staff.id, moduleId: module.id } })
  expect(row.source).toBe('REREAD')

  await signIn(page, P.staff.email)
  await page.goto('/dashboard')
  await expect(page.getByText('Assigned to you')).toBeVisible()
  await expect(page.getByText('Please read this again')).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/dashboard')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: P.staff.id }, select: { onboardingCompleted: true } })
  expect(user.onboardingCompleted).toBe(true)
})

test('the dashboard no longer shows the lost-or-stolen box', async ({ page }) => {
  await createReadyHire()
  await giveLogins(P.staff.id)
  await signIn(page, P.staff.email)
  await page.goto('/dashboard')
  await page.getByRole('heading', { name: /Welcome back/ }).waitFor()
  await expect(page.getByRole('heading', { name: 'If something is lost, stolen or damaged' })).toHaveCount(0)
})

test('Preview as renders the module for HR, and the facts can be changed', async ({ page }) => {
  await createReleasedHire()
  await giveLogins(P.hr.id)
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'culture-values' } })
  await signIn(page, P.hr.email)
  await page.goto(`/admin/onboarding/academy/modules/${module.id}`)

  await page.getByRole('button', { name: 'Preview as' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText(/Showing your saved draft\.|so this is live version \d+\.|Showing live version \d+\./)).toBeVisible({ timeout: 30_000 })
  // The real header and blocks, inert.
  await expect(sheet.getByText('Preview. Nothing here can be changed.')).toBeAttached()
  await expect(sheet.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(sheet.locator('fieldset[disabled]')).toBeVisible()

  // Changing a fact asks the server again and still renders.
  const again = page.waitForResponse((r) => r.url().includes('/preview') && r.request().method() === 'POST' && r.ok())
  await sheet.getByRole('combobox', { name: 'Work mode' }).click()
  await page.getByRole('option', { name: 'Remote' }).click()
  await again
  await expect(sheet.locator('fieldset[disabled]')).toBeVisible()
})

test('the most-missed panel lists the questions hires answer wrongly', async ({ page }) => {
  await createReleasedHire()
  await giveLogins(P.hr.id)
  await failQuizAttempt(3)

  await signIn(page, P.hr.email)
  await page.goto('/admin/onboarding/tracker')
  await expect(page.getByRole('heading', { name: 'Most-missed questions' })).toBeVisible()
  const panel = page.locator('section[aria-labelledby="most-missed-heading"]')
  await expect(panel.getByRole('columnheader', { name: 'First attempts' })).toBeVisible()
  // One person's attempt is too few answers to report a rate, and the panel says so.
  expect(await panel.getByRole('row').count()).toBeGreaterThan(1)
  await expect(panel.getByText('Not enough answers yet').first()).toBeVisible()
})

test('HR marks a video watched for a hire whose video will not load, with a reason on record', async ({ page }) => {
  await createReleasedHire()
  await giveLogins(P.hr.id)
  await prisma.onboardingConfig.update({
    where: { id: 'singleton' },
    data: {
      videos: {
        VIDEO_1: {
          youtubeId: 'AAAAAAAAAAA',
          durationSeconds: 40,
          chapters: [{ key: 'start', label: 'A fictional start', start: 0 }],
          transcripts: { en: 'A fictional transcript for the test run.' },
        },
      },
    },
  })
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })

  await signIn(page, P.hr.email)
  await openHireDrawer(page)
  await page.getByRole('button', { name: `Mark watched: ${module.title}` }).click()
  await page.getByLabel("Why the video couldn't be watched here").fill('Their network blocks YouTube')
  await page.getByRole('button', { name: 'Mark watched', exact: true }).click()
  await expect(page.getByText(/Marked watched by .* on .*: Their network blocks YouTube/)).toBeVisible()

  const row = await prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, moduleId: module.id } })
  expect(row.status).toBe('COMPLETED')
  expect(row.markedWatchedById).toBe(P.hr.id)
  expect(row.markedWatchedReason).toBe('Their network blocks YouTube')
})
