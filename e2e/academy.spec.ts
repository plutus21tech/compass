import { test, expect, type Page } from '@playwright/test'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/db'
import { P } from '../tests/helpers/academy-test-db'
import { HIRE_ID, NEW_HIRE_ID, cleanCourse, createReadyHire, createReleasedHire, scrollAndComplete } from '../tests/helpers/academy-course-fixtures'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
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
