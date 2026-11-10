import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { parseBlocks, type Block } from '../lib/academy/blocks'
import { AcademyError } from '../lib/academy/errors'
import { isCardEligible } from '../lib/academy/eligibility'
import { saveDraft } from '../lib/academy/service/content'
import { previewModule } from '../lib/academy/service/preview'
import type { ModuleBlockView } from '../lib/academy/view'
import { ACADEMY_MODULE_BLOCKS } from '../prisma/seed-academy-content'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import { cleanCourse, createReadyHire, createReleasedHire } from './helpers/academy-course-fixtures'

const HR = { id: P.hr.id, role: 'HR' as const }

const fails = (status: number) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  return true
}

const moduleIdOf = async (slug: string): Promise<string> => (await prisma.onboardingModule.findUniqueOrThrow({ where: { slug } })).id
const inputTargets = (blocks: readonly ModuleBlockView[]): string[] =>
  blocks.flatMap((b) => (b.type === 'inputField' ? [b.target] : []))
const richTexts = (blocks: readonly ModuleBlockView[]): string[] => blocks.flatMap((b) => (b.type === 'richText' ? [b.markdown] : []))

/** Everything a preview could write to, for one count before and after. */
async function writeCounts(): Promise<number[]> {
  return Promise.all([
    prisma.onboardingProgress.count(),
    prisma.onboardingProgressHistory.count(),
    prisma.onboardingAcknowledgement.count(),
    prisma.quizAttempt.count(),
    prisma.onboardingPaymentDetails.count(),
  ])
}

beforeEach(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

test('preview writes no progress row, before a release and after one', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  const before = await writeCounts()
  await previewModule(prisma, HR, moduleId, { source: 'live' })
  assert.deepEqual(await writeCounts(), before)
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: P.hire.id } }), 0)

  await createReleasedHire()
  const released = await writeCounts()
  for (const slug of ['welcome', 'team-contacts', 'getting-paid']) {
    await previewModule(prisma, HR, await moduleIdOf(slug), { source: 'draft' })
  }
  assert.deepEqual(await writeCounts(), released)
})

test('an employee, OA or security user gets 403', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  for (const viewer of [{ id: P.staff.id, role: 'EMPLOYEE' as const }, { id: P.oa.id, role: 'OA' as const }, { id: 'act-sec', role: 'SECURITY' as const }]) {
    await assert.rejects(previewModule(prisma, viewer, moduleId, { source: 'live' }), fails(403))
  }
})

test('an unknown module is 404 and a bad body is refused', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await assert.rejects(previewModule(prisma, HR, 'act-no-such-module', { source: 'live' }), fails(404))
  await assert.rejects(previewModule(prisma, HR, await moduleIdOf('welcome'), { source: 'neither' }))
})

test('a PK preview of Module 11 shows bank, a contractor preview shows payout', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('getting-paid')
  const pk = await previewModule(prisma, HR, moduleId, { source: 'live', facts: { contractType: 'PK_EMPLOYMENT' } })
  assert.deepEqual(inputTargets(pk.module.blocks), ['bank'])
  assert.equal(pk.module.progress.effectiveRule, 'PAYMENT_SETUP')
  const contractor = await previewModule(prisma, HR, moduleId, {
    source: 'live',
    facts: { officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE', contractType: 'INDEPENDENT_CONTRACTOR' },
  })
  assert.deepEqual(inputTargets(contractor.module.blocks), ['payout'])
  assert.equal(contractor.module.number, 11)
})

test('a REMOTE preview with no country shows universal cards only', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const cards = await prisma.onboardingLibraryCard.findMany({ where: { isActive: true } })
  const universal = (kind: string) =>
    cards.filter((c) => c.kind === kind && c.countries.length + c.workModes.length + c.contractTypes.length + c.employmentStatuses.length === 0)
  assert.ok(cards.length > universal('BENEFIT').length + universal('REIMBURSEMENT').length, 'the seed has restricted cards')

  const { module } = await previewModule(prisma, HR, await moduleIdOf('your-benefits'), {
    source: 'live',
    facts: { officeLocation: 'REMOTE', remoteCountry: null, workMode: 'REMOTE', contractType: 'INDEPENDENT_CONTRACTOR' },
  })
  for (const kind of ['BENEFIT', 'REIMBURSEMENT'] as const) {
    assert.deepEqual(module.library[kind].map((c) => c.id).sort(), universal(kind).map((c) => c.id).sort(), kind)
  }

  const karachi = await previewModule(prisma, HR, await moduleIdOf('your-benefits'), { source: 'live' })
  const pk = { officeLocation: 'KARACHI', remoteCountry: null, workMode: 'OFFICE', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT' } as const
  const eligible = cards.filter((c) => c.kind === 'BENEFIT' && isCardEligible(c, pk)).map((c) => c.id).sort()
  assert.deepEqual(karachi.module.library.BENEFIT.map((c) => c.id).sort(), eligible)
})

test('no real person\'s name or detail appears in any module\'s preview', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ clientAccount: 'Fictional Client Co' })
  const modules = await prisma.onboardingModule.findMany({ where: { phase: { not: null } }, select: { id: true } })
  assert.equal(modules.length, 14)
  const real = [P.hire, P.lead, P.buddy, P.staff].flatMap((p) => [p.name, p.email, p.name.split(' ')[0], p.name.split(' ')[1]])
  const hireDetails = ['Cara', 'Analyst', 'Own the weekly research note.', 'Tableau', 'example.test/handbook', 'Fictional Client Co']
  // Whole words only: "Ben" is a person, "Benefits" is a module.
  const asWord = (text: string) => new RegExp(`\\b${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  for (const { id } of modules) {
    const json = JSON.stringify(await previewModule(prisma, HR, id, { source: 'live', facts: { clientAccount: true } }))
    for (const text of [...real, ...hireDetails]) assert.equal(asWord(text).test(json), false, `${id}: ${text}`)
  }
})

test('people and per-hire data show labelled samples', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const { module } = await previewModule(prisma, HR, await moduleIdOf('team-contacts'), { source: 'live' })
  assert.equal(module.lead?.name, 'Your team lead')
  assert.equal(module.buddy?.name, 'Your buddy')
  assert.ok(module.team.length > 0 && module.team.every((person) => person.email === null))
  assert.match(module.roleExpectations ?? '', /^\[.+\]$/)
})

test('draft or live, and unknown placeholders are listed as a warning', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('how-we-work')
  const seeded: Block[] = parseBlocks(ACADEMY_MODULE_BLOCKS['how-we-work'])
  await saveDraft(prisma, moduleId, [...seeded, { type: 'richText', markdown: 'Draft line {favourite colour} for {preferred name}' }])

  const draft = await previewModule(prisma, HR, moduleId, { source: 'draft' })
  assert.equal(draft.showing, 'draft')
  assert.deepEqual(draft.unknownPlaceholders, ['favourite colour'])
  const line = richTexts(draft.module.blocks).find((text) => text.startsWith('Draft line'))
  assert.ok(line && !line.includes('{'), line)

  const live = await previewModule(prisma, HR, moduleId, { source: 'live' })
  assert.equal(live.showing, 'live')
  assert.deepEqual(live.unknownPlaceholders, [])
  assert.equal(richTexts(live.module.blocks).some((text) => text.startsWith('Draft line')), false)

  // No draft saved: the draft preview is the live version, and says so.
  const other = await previewModule(prisma, HR, await moduleIdOf('welcome'), { source: 'draft' })
  assert.equal(other.showing, 'live')
})
