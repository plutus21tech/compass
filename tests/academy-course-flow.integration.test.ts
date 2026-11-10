import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadHome, loadModule } from '../lib/academy/service/course'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { saveBankDetails, saveDiscordUsername, saveLinkedinUrl, signAcknowledgement } from '../lib/academy/service/fields'
import { savePayout } from '../lib/academy/service/payout'
import { setPersonAttributes } from '../lib/academy/service/attributes'
import { signValuesAcknowledgement } from '../lib/academy/service/completion'
import { submitQuiz } from '../lib/academy/service/quiz'
import { syncChecklist } from '../lib/academy/service/checklist'
import { verifyLinkedin } from '../lib/academy/service/tracker-actions'
import { shouldBlockSession } from '../lib/academy/lockout'
import type { Submission } from '../lib/academy/quiz'
import type { VideoConfig } from '../lib/academy/video'
import type { OnboardingCompletionRule } from '@prisma/client'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { CONTRACTOR_ATTRIBUTES, HIRE_ID, NEW_HIRE_ID, SLUGS, cleanCourse, createReleasedHire } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

// Fictional test key, not a real secret.
process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

// Fictional bank and payout details.
const BANK = { accountTitle: 'Cara Lindqvist', bankName: 'Example Bank', branch: 'Main Branch', iban: 'PK36SCBL0000001123456702' }
const WISE = { method: 'WISE', accountHolderName: 'Cara', payoutEmail: 'c@example.test', currency: 'USD' }

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

const benefitCounts = async () => ({
  benefits: await prisma.benefit.count(),
  categories: await prisma.benefitCategory.count(),
})

type Payee = 'PK' | 'CONTRACTOR'

const VIDEO_SECONDS = 100
const REPORT_EVERY_SECONDS = 10

/** Fictional ready videos for Modules 1 and 2; Module 2's chapter keys come from the quiz bank. */
const readyVideo = (youtubeId: string, chapters: VideoConfig['chapters']): VideoConfig => ({
  youtubeId, durationSeconds: VIDEO_SECONDS, chapters, transcripts: { en: 'A fictional transcript.' },
})
const READY_VIDEOS = {
  VIDEO_1: readyVideo('AAAAAAAAAAA', [{ key: 'start', label: 'A fictional start', start: 0 }]),
  VIDEO_2: readyVideo('BBBBBBBBBBB', [
    { key: 'innovation', label: 'A fictional first value', start: 0 },
    { key: 'integrity', label: 'A fictional second value', start: 50 },
  ]),
}

/**
 * Plays a ready video through the real service: a report every ten seconds of an injected clock,
 * each one asking for the whole video, until the server itself counts 95%. The clock starts when the
 * module was opened, so the server's pace limit is what holds the hire back.
 */
async function watchVideo(slug: string, startedAt: Date): Promise<void> {
  for (let elapsed = REPORT_EVERY_SECONDS; elapsed <= VIDEO_SECONDS * 2; elapsed += REPORT_EVERY_SECONDS) {
    const view = await recordEvent(
      prisma, HIRE_ID, slug, { type: 'VIDEO_PROGRESS', seconds: VIDEO_SECONDS }, new Date(startedAt.getTime() + elapsed * 1000),
    )
    if (view.completion.met) return
  }
  throw new Error(slug + ': the server never counted 95% of the video')
}

/**
 * Does what the page does for one module, through the services only, then completes it. The step comes
 * from the rule the hire is actually held to, so a fallback to SCROLL_END is followed too.
 */
async function finishModule(slug: string, payee: Payee, videoStart?: Date): Promise<OnboardingCompletionRule> {
  const view = await loadModule(prisma, HIRE_ID, slug, videoStart)
  const rule = view.progress.effectiveRule
  const checklistKeys = view.blocks.flatMap((b) => (b.type === 'checklist' ? b.items.map((i) => i.key) : []))
  const check = (key: string) => recordEvent(prisma, HIRE_ID, slug, { type: 'CHECK', key, checked: true })

  switch (rule) {
    case 'SCROLL_END':
      await recordEvent(prisma, HIRE_ID, slug, { type: 'SCROLLED_END' })
      break
    case 'VIDEO_95':
      assert.ok(videoStart, 'a video module needs the clock it was opened on')
      // Scrolling to the end counts for nothing here; only the reported watching does.
      await recordEvent(prisma, HIRE_ID, slug, { type: 'SCROLLED_END' })
      await assert.rejects(completeModule(prisma, HIRE_ID, slug), (e: unknown) => (e as { status?: number }).status === 409)
      await watchVideo(slug, videoStart)
      break
    case 'BUDDY_HELLO':
      await check('buddy-hello')
      break
    case 'ALL_LINKS_OPENED':
      for (const t of view.tutorials) await recordEvent(prisma, HIRE_ID, slug, { type: 'LINK_OPENED', key: t.key })
      break
    case 'LINK_OPENED':
      await recordEvent(prisma, HIRE_ID, slug, { type: 'LINK_OPENED', key: 'COMPANY_DASHBOARD' })
      break
    case 'CHECKLIST_AND_FIELD':
      for (const key of checklistKeys) await check(key)
      await saveDiscordUsername(prisma, HIRE_ID, 'cara.l')
      break
    case 'CHECKLIST_AND_ACK':
      for (const key of checklistKeys) await check(key)
      await signAcknowledgement(prisma, HIRE_ID, { kind: 'SECURITY_SOPS', typedName: P.hire.name, moduleSlug: slug })
      break
    case 'FIELD_SUBMITTED':
      await saveLinkedinUrl(prisma, HIRE_ID, 'https://www.linkedin.com/in/cara')
      break
    case 'PAYMENT_SETUP':
      if (payee === 'PK') {
        await saveBankDetails(prisma, HIRE_ID, BANK)
      } else {
        await savePayout(prisma, HIRE_ID, WISE)
        if (checklistKeys.includes('invoice-template')) await check('invoice-template')
      }
      break
  }
  await completeModule(prisma, HIRE_ID, slug)
  return rule
}

/** Runs all 14 modules. With ready videos, Modules 1 and 2 open on a clock in the past and are watched in injected time. */
async function runWholeCourse(payee: Payee, withVideos = false): Promise<OnboardingCompletionRule[]> {
  assert.equal(SLUGS.length, 14)
  const rules: OnboardingCompletionRule[] = []
  // Module 1 opens twenty minutes ago and Module 2 ten minutes later, so every report is in the past.
  const opened = Date.now() - 20 * 60_000
  for (const [i, slug] of SLUGS.entries()) {
    const videoStart = withVideos && i < 2 ? new Date(opened + i * 10 * 60_000) : undefined
    rules.push(await finishModule(slug, payee, videoStart))
  }

  const home = await loadHome(prisma, HIRE_ID)
  assert.ok(home.released)
  assert.equal(home.doneCount, 14)
  assert.equal(home.total, 14)
  // The quiz card state: every module is completed and nothing is left to open.
  assert.equal(home.nextModule, null)
  assert.ok(home.phases.flatMap((p) => p.modules).every((m) => m.status === 'COMPLETED'))
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID, status: 'COMPLETED' } }), 14)
  // Finishing the modules is not finishing onboarding: that waits for the quiz and the signature.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  assert.equal(user.onboardingCompleted, false)
  await runQuizAndSign()
  await checkChecklistAfterCourse()
  return rules
}

const itemFor = (key: string) =>
  prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId: NEW_HIRE_ID, templateItem: { key } } })

const AUTO_KEYS = [
  'lead-input', 'setup-complete', 'accounts-created', 'course-released', 'discord-account',
  'security-ack', 'payment-setup', 'academy-complete',
]

/** HR set the hire up, so the checklist exists; finishing the course ticks what the data proves. */
async function checkChecklistAfterCourse(): Promise<void> {
  assert.equal(await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } }), 17)
  await syncChecklist(prisma, NEW_HIRE_ID)
  for (const key of AUTO_KEYS) assert.ok((await itemFor(key)).doneAt, `${key} ticks on its own`)
  // The hire's own LinkedIn link does not stand in for HR's check.
  assert.equal((await itemFor('linkedin-update')).doneAt, null)
  assert.equal((await itemFor('manager-checklist')).doneAt, null)

  await verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id)
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.ok((await itemFor('linkedin-update')).doneAt)
  assert.equal((await itemFor('manager-checklist')).doneAt, null)
  assert.equal(await profiles(), 0)
}

/** Answers `wrong` of the usable questions wrongly. */
async function submission(wrong: number): Promise<Submission> {
  const questions = await prisma.onboardingQuizQuestion.findMany({
    where: { isActive: true, retiredAt: null, explanation: { not: null } },
    orderBy: { orderIndex: 'asc' },
  })
  return {
    answers: questions.map((q, i) => {
      const options = q.optionsJson as string[]
      return { questionId: q.id, chosen: i < wrong ? (options.find((o) => o !== q.correctAnswer) as string) : q.correctAnswer }
    }),
  }
}

/** Moves every attempt back to the end of the 15-minute wait. */
const endCooldown = () =>
  prisma.quizAttempt.updateMany({ where: { userId: HIRE_ID }, data: { createdAt: new Date(Date.now() - 15 * 60_000) } })

async function runQuizAndSign(): Promise<void> {
  const profilesBefore = await profiles()
  for (let i = 0; i < 2; i++) {
    const { result } = await submitQuiz(prisma, HIRE_ID, await submission(3))
    assert.equal(result.passed, false)
    await assert.rejects(submitQuiz(prisma, HIRE_ID, await submission(0)), (e: unknown) => (e as { status?: number }).status === 409)
    await endCooldown()
  }
  const { result } = await submitQuiz(prisma, HIRE_ID, await submission(0))
  assert.equal(result.passed, true)
  assert.equal(await prisma.quizAttempt.count({ where: { userId: HIRE_ID } }), 3)

  const passedOnly = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  assert.equal(passedOnly.onboardingCompleted, false)
  const { completed } = await signValuesAcknowledgement(prisma, HIRE_ID, P.hire.name)
  assert.equal(completed, true)

  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  assert.equal(user.onboardingCompleted, true)
  const hire = await prisma.newHire.findFirstOrThrow({ where: { userId: HIRE_ID }, select: { status: true } })
  assert.equal(hire.status, 'COMPLETED')
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: user.onboardingCompleted, pathname: '/dashboard' }), false)
  assert.equal(await profiles(), profilesBefore)
}

const profiles = () => prisma.payrollEmployeeProfile.count({ where: { userId: HIRE_ID } })
const storedPayment = () => prisma.onboardingPaymentDetails.findUniqueOrThrow({ where: { userId: HIRE_ID } })

test('a PK hire finishes all 14 modules; bank details go to the onboarding store and no payroll profile appears', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const before = await benefitCounts()
  assert.equal(await profiles(), 0)
  await runWholeCourse('PK')
  assert.equal(await profiles(), 0)
  assert.equal((await storedPayment()).method, 'PK_BANK')
  assert.deepEqual(await benefitCounts(), before)
})

test('a contractor finishes all 14 modules; the payout is saved and no payroll profile exists at any point', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setPersonAttributes(prisma, HIRE_ID, CONTRACTOR_ATTRIBUTES)
  const before = await benefitCounts()
  assert.equal(await profiles(), 0)
  await runWholeCourse('CONTRACTOR')
  assert.equal(await profiles(), 0)
  assert.equal((await storedPayment()).method, 'WISE')
  assert.deepEqual(await benefitCounts(), before)
})

test('with ready videos, a hire completes Modules 1 and 2 by reported progress and finishes the course', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingConfig.update({ where: { id: 'singleton' }, data: { videos: READY_VIDEOS as object } })
  const rules = await runWholeCourse('PK', true)
  assert.deepEqual(rules.slice(0, 2), ['VIDEO_95', 'VIDEO_95'])
  assert.ok(rules.slice(2).every((r) => r !== 'VIDEO_95'))
  assert.equal(await profiles(), 0)
  assert.equal((await storedPayment()).method, 'PK_BANK')
})
