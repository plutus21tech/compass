import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadHome, loadModule } from '../lib/academy/service/course'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { saveBankDetails, saveDiscordUsername, saveLinkedinUrl, signAcknowledgement } from '../lib/academy/service/fields'
import { savePayout } from '../lib/academy/service/payout'
import { setPersonAttributes } from '../lib/academy/service/attributes'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { CONTRACTOR_ATTRIBUTES, HIRE_ID, SLUGS, cleanCourse, createReleasedHire } from './helpers/academy-course-fixtures'
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

/**
 * Does what the page does for one module, through the services only, then completes it. The step comes
 * from the rule the hire is actually held to, so a fallback to SCROLL_END is followed too.
 */
async function finishModule(slug: string, payee: Payee): Promise<void> {
  const view = await loadModule(prisma, HIRE_ID, slug)
  const checklistKeys = view.blocks.flatMap((b) => (b.type === 'checklist' ? b.items.map((i) => i.key) : []))
  const check = (key: string) => recordEvent(prisma, HIRE_ID, slug, { type: 'CHECK', key, checked: true })

  switch (view.progress.effectiveRule) {
    case 'SCROLL_END':
    case 'VIDEO_95':
      await recordEvent(prisma, HIRE_ID, slug, { type: 'SCROLLED_END' })
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
}

async function runWholeCourse(payee: Payee): Promise<void> {
  assert.equal(SLUGS.length, 14)
  for (const slug of SLUGS) await finishModule(slug, payee)

  const home = await loadHome(prisma, HIRE_ID)
  assert.ok(home.released)
  assert.equal(home.doneCount, 14)
  assert.equal(home.total, 14)
  // The quiz card state: every module is completed and nothing is left to open.
  assert.equal(home.nextModule, null)
  assert.ok(home.phases.flatMap((p) => p.modules).every((m) => m.status === 'COMPLETED'))
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID, status: 'COMPLETED' } }), 14)
  // Finishing the course is not finishing onboarding: that waits for the quiz, in a later stage.
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  assert.equal(user.onboardingCompleted, false)
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
