import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { completeTestUsers } from '../scripts/academy-cutover-complete-test-users'
import { ACADEMY_MODULES, ACADEMY_CARDS, ACADEMY_CHECKLIST } from '../prisma/seed-academy-data'
import { seedAcademy } from '../prisma/seed-academy'
import { ACADEMY_DB_TEST, P, resetAcademyFixtures } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const OLD_SLUG = 'act-seed-retired-old'
const OLD_QUESTION_TEXT = 'ACT seed old question'
const NEW_QUESTION_TEXT = 'ACT seed new question'
const slugs = ACADEMY_MODULES.map((m) => m.slug)

async function clean() {
  await prisma.onboardingModule.deleteMany({ where: { slug: { in: [...slugs, OLD_SLUG] } } })
  await prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { in: [OLD_QUESTION_TEXT, NEW_QUESTION_TEXT] } } })
  for (const c of ACADEMY_CARDS) await prisma.onboardingLibraryCard.deleteMany({ where: { kind: c.kind, title: c.title } })
  await prisma.onboardingChecklistTemplateItem.deleteMany({ where: { key: { in: ACADEMY_CHECKLIST.map((i) => i.key) } } })
  await prisma.onboardingConfig.deleteMany({ where: { id: 'singleton' } })
  await resetAcademyFixtures(prisma)
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await clean()
  await prisma.onboardingModule.create({ data: { slug: OLD_SLUG, title: 'ACT old module', orderIndex: 1 } })
  await prisma.onboardingQuizQuestion.create({ data: { questionText: OLD_QUESTION_TEXT, optionsJson: [], correctAnswer: 'a', orderIndex: 77 } })
})
after(async () => {
  if (WEEKLY_DB_READY) await clean()
  await prisma.$disconnect()
})

test('first run creates 14 modules and retires the old one', ACADEMY_DB_TEST, async () => {
  const expectedRetired = await prisma.onboardingModule.count({ where: { slug: { notIn: slugs }, orderIndex: { lt: 1000 } } })
  assert.ok(expectedRetired >= 1)
  const result = await seedAcademy(prisma)
  assert.equal(result.modulesCreated, 14)
  assert.equal(result.modulesRetired, expectedRetired)
  const mods = await prisma.onboardingModule.findMany({ where: { slug: { in: slugs } }, include: { versions: true } })
  assert.equal(mods.length, 14)
  for (const m of mods) {
    assert.equal(m.isActive, true)
    assert.equal(m.versions.length, 1)
    assert.equal(m.currentVersionId, m.versions[0].id)
    assert.deepEqual(m.versions[0].blocks, [])
  }
  assert.equal(mods.find((m) => m.slug === 'welcome')?.orderIndex, 1)
  const old = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: OLD_SLUG } })
  assert.equal(old.isActive, false)
  assert.equal(old.orderIndex, 1001)
  const q = await prisma.onboardingQuizQuestion.findFirstOrThrow({ where: { questionText: OLD_QUESTION_TEXT } })
  assert.equal(q.isActive, false)
  assert.equal(q.orderIndex, 1077)
  assert.ok(q.retiredAt)
})

test('questions with an explanation survive a re-run untouched', ACADEMY_DB_TEST, async () => {
  const keep = await prisma.onboardingQuizQuestion.create({
    data: { questionText: NEW_QUESTION_TEXT, optionsJson: [], correctAnswer: 'a', orderIndex: 78, explanation: 'ACT why' },
  })
  await seedAcademy(prisma)
  await seedAcademy(prisma)
  const row = await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: keep.id } })
  assert.equal(row.isActive, true)
  assert.equal(row.orderIndex, 78)
  assert.equal(row.retiredAt, null)
})

test('an HR deactivation of a seeded module sticks across re-runs', ACADEMY_DB_TEST, async () => {
  await seedAcademy(prisma)
  await prisma.onboardingModule.update({ where: { slug: 'discord' }, data: { isActive: false } })
  await seedAcademy(prisma)
  assert.equal((await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'discord' } })).isActive, false)
})

test('a null-valued link key is filled', ACADEMY_DB_TEST, async () => {
  await prisma.onboardingConfig.create({ data: { id: 'singleton', links: { LEAVE_POLICY: null } } })
  await seedAcademy(prisma)
  const links = (await prisma.onboardingConfig.findUniqueOrThrow({ where: { id: 'singleton' } })).links as Record<string, unknown>
  assert.deepEqual(links.LEAVE_POLICY, { kind: 'handbook', slug: 'leave-policy' })
})

test('checklist template is seeded with the lead-input row', ACADEMY_DB_TEST, async () => {
  const result = await seedAcademy(prisma)
  assert.equal(result.checklistItemsCreated, 17)
  const row = await prisma.onboardingChecklistTemplateItem.findUniqueOrThrow({ where: { key: 'lead-input' } })
  assert.equal(row.ownerRole, 'TEAM_LEAD')
  assert.equal(row.dueOffsetDays, -7)
  assert.equal(row.autoTickEvent, 'LEAD_INPUT_SUBMITTED')
})

test('second run is idempotent and keeps HR edits', ACADEMY_DB_TEST, async () => {
  const first = await seedAcademy(prisma)
  assert.equal(first.cardsCreated, ACADEMY_CARDS.length)
  const cardsBefore = await prisma.onboardingLibraryCard.count()
  await prisma.onboardingChecklistTemplateItem.update({ where: { key: 'contract-signed' }, data: { title: 'ACT edited title' } })
  const card = await prisma.onboardingLibraryCard.findFirstOrThrow({ where: { kind: 'BENEFIT', title: 'Flexibility' } })
  await prisma.onboardingLibraryCard.update({ where: { id: card.id }, data: { body: 'ACT edited body' } })
  const welcome = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  const v2 = await prisma.onboardingModuleVersion.create({ data: { moduleId: welcome.id, version: 2, blocks: [] } })
  await prisma.onboardingModule.update({ where: { id: welcome.id }, data: { currentVersionId: v2.id } })

  const second = await seedAcademy(prisma)
  assert.deepEqual(second, { modulesCreated: 0, modulesRetired: 0, cardsCreated: 0, checklistItemsCreated: 0 })
  assert.equal(await prisma.onboardingLibraryCard.count(), cardsBefore)
  assert.equal((await prisma.onboardingChecklistTemplateItem.findUniqueOrThrow({ where: { key: 'contract-signed' } })).title, 'ACT edited title')
  assert.equal((await prisma.onboardingLibraryCard.findUniqueOrThrow({ where: { id: card.id } })).body, 'ACT edited body')
  const after2 = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' }, include: { versions: true } })
  assert.equal(after2.currentVersionId, v2.id)
  assert.equal(after2.versions.length, 2)
})

test('config links fill only empty keys and other config is untouched', ACADEMY_DB_TEST, async () => {
  await prisma.onboardingConfig.create({
    data: { id: 'singleton', quizPassPercent: 55, links: { TRAVEL_POLICY: { kind: 'url', url: 'https://example.test/travel' } } },
  })
  await seedAcademy(prisma)
  const cfg = await prisma.onboardingConfig.findUniqueOrThrow({ where: { id: 'singleton' } })
  const links = cfg.links as Record<string, unknown>
  assert.deepEqual(links.TRAVEL_POLICY, { kind: 'url', url: 'https://example.test/travel' })
  assert.deepEqual(links.LEAVE_POLICY, { kind: 'handbook', slug: 'leave-policy' })
  assert.deepEqual(links.COMPANY_DASHBOARD, { kind: 'handbook', slug: '' })
  assert.equal(cfg.quizPassPercent, 55)
})

test('seed leaves benefits untouched', ACADEMY_DB_TEST, async () => {
  const counts = () => Promise.all([prisma.benefit.count(), prisma.benefitCategory.count()])
  const before = await counts()
  await seedAcademy(prisma)
  assert.deepEqual(await counts(), before)
})

test('cutover dry run changes nothing, apply completes exactly those users', ACADEMY_DB_TEST, async () => {
  await prisma.user.create({ data: { ...P.hire, onboardingCompleted: false } })
  await prisma.user.create({ data: { ...P.staff, onboardingCompleted: true } })
  const incomplete = await prisma.user.findMany({ where: { onboardingCompleted: false }, select: { id: true } })
  const incompleteIds = incomplete.map((u) => u.id)
  try {
    const dry = await completeTestUsers(prisma, { apply: false })
    assert.ok(dry.includes(P.hire.name))
    assert.ok(!dry.includes(P.staff.name))
    assert.deepEqual([...dry], [...dry].sort())
    assert.equal(dry.length, incompleteIds.length)
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: P.hire.id } })).onboardingCompleted, false)
    assert.equal(await prisma.user.count({ where: { onboardingCompleted: false } }), incompleteIds.length)

    const applied = await completeTestUsers(prisma, { apply: true })
    assert.deepEqual(applied, dry)
    assert.equal(await prisma.user.count({ where: { onboardingCompleted: false } }), 0)
  } finally {
    // restore users that were incomplete before (non-fixture ones survive resetAcademyFixtures)
    await prisma.user.updateMany({ where: { id: { in: incompleteIds } }, data: { onboardingCompleted: false } })
  }
})
