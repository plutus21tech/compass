import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import { prisma } from '../lib/db'
import { parseBlocks, type Block } from '../lib/academy/blocks'
import { publishProblems } from '../lib/academy/content-rules'
import { discardDraft, listContentModules, loadContent, publishModule, saveDraft } from '../lib/academy/service/content'
import { loadModule } from '../lib/academy/service/course'
import { signAcknowledgement } from '../lib/academy/service/fields'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { ACADEMY_MODULE_BLOCKS } from '../prisma/seed-academy-content'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import { HIRE_ID, cleanCourse, createReadyHire, createReleasedHire, progressRow, scrollAndComplete } from './helpers/academy-course-fixtures'

const HR = P.hr.id
const STALE = 'Someone else changed this. Reload to see their edits.'

const fails = (status: number, message?: string | RegExp) => (error: unknown) => {
  const { status: actual, message: text } = error as { status?: number; message: string }
  if (actual !== status) return false
  if (message === undefined) return true
  return typeof message === 'string' ? text === message : message.test(text)
}

const moduleIdOf = async (slug: string): Promise<string> => (await prisma.onboardingModule.findUniqueOrThrow({ where: { slug } })).id
const versionsOf = (moduleId: string) => prisma.onboardingModuleVersion.count({ where: { moduleId } })
const seeded = (slug: string): Block[] => parseBlocks(ACADEMY_MODULE_BLOCKS[slug])
const withNote = (blocks: Block[], markdown: string): Block[] => [...blocks, { type: 'richText', markdown }]
const texts = (blocks: readonly Block[]): string[] => blocks.flatMap((b) => (b.type === 'richText' ? [b.markdown] : []))
const statementOf = (blocks: readonly Block[]): string | undefined =>
  blocks.flatMap((b) => (b.type === 'acknowledgement' ? [b.statement] : []))[0]
const NOTE = { changeNote: 'Fictional change', askReread: false }

/** Finishes the module, with everything before it opened, as a hire's own page would. */
async function openModule(slug: string): Promise<void> {
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug } }, data: { status: 'IN_PROGRESS' } })
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await cleanCourse()
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

test('every module the seed creates can be published as it stands', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const modules = await prisma.onboardingModule.findMany({ where: { phase: { not: null } }, include: { versions: true } })
  assert.equal(modules.length, 14)
  for (const module of modules) {
    assert.deepEqual(publishProblems(module.completionRule ?? 'SCROLL_END', parseBlocks(module.versions[0].blocks)), [], module.slug)
  }
})

test('a draft never changes what hires see, and stays unresolved', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('how-we-work')
  await openModule('how-we-work')
  const before = await loadModule(prisma, HIRE_ID, 'how-we-work')

  await saveDraft(prisma, moduleId, withNote(seeded('how-we-work'), 'Draft for {preferred name}'), {
    details: { title: 'A draft title', estimatedMinutes: 99, headlineLead: 'DRAFT', headlineAccent: 'title' },
  })

  const after = await loadModule(prisma, HIRE_ID, 'how-we-work')
  assert.deepEqual(after.blocks, before.blocks)
  assert.equal(after.title, before.title)
  assert.equal(after.estimatedMinutes, before.estimatedMinutes)
  const stored = await loadContent(prisma, moduleId)
  assert.equal(stored.hasDraft, true)
  assert.equal(stored.details.title, 'A draft title')
  assert.ok(texts(stored.blocks).includes('Draft for {preferred name}'))
  assert.equal(await versionsOf(moduleId), 1)
})

test('with no draft the editor opens from the current version', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  const content = await loadContent(prisma, moduleId)
  assert.equal(content.hasDraft, false)
  assert.equal(content.version, 1)
  assert.equal(content.number, 1)
  assert.equal(content.rule, 'VIDEO_95')
  assert.deepEqual(content.blocks, seeded('welcome'))
})

test('the module list shows each course module once, in order, with its draft state', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('team-contacts')
  await saveDraft(prisma, moduleId, seeded('team-contacts'))
  const rows = await listContentModules(prisma)
  assert.equal(rows.length, 14)
  assert.deepEqual(rows.map((r) => r.number), Array.from({ length: 14 }, (_, i) => i + 1))
  assert.deepEqual(rows.filter((r) => r.hasDraft).map((r) => r.id), [moduleId])
})

test('a draft that is not a valid block list is refused', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await assert.rejects(saveDraft(prisma, moduleId, [{ type: 'nonsense' }]), ZodError)
  assert.equal((await loadContent(prisma, moduleId)).hasDraft, false)
})

test('a draft for something that is not a course module is a 404', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await assert.rejects(saveDraft(prisma, 'act-no-such-module', []), fails(404))
  await assert.rejects(loadContent(prisma, 'act-no-such-module'), fails(404))
})

test('publishing makes version 2: a hire mid-module sees it, a completed row keeps version 1', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const finishedId = await moduleIdOf('welcome')
  const openId = await moduleIdOf('culture-values')
  await scrollAndComplete('welcome')
  const original = await loadModule(prisma, HIRE_ID, 'welcome')

  const summary = (slug: string, text: string): Block[] =>
    seeded(slug).map((b) => (b.type === 'video' ? { ...b, summary: text } : b))
  await saveDraft(prisma, finishedId, summary('welcome', 'New welcome'))
  assert.deepEqual(await publishModule(prisma, finishedId, NOTE, HR), { version: 2 })
  await saveDraft(prisma, openId, summary('culture-values', 'New culture'))
  await publishModule(prisma, openId, NOTE, HR)

  const mid = await loadModule(prisma, HIRE_ID, 'culture-values')
  assert.deepEqual(mid.blocks.flatMap((b) => (b.type === 'video' ? [b.summary] : [])), ['New culture'])
  const finished = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.deepEqual(finished.blocks, original.blocks)

  const row = await prisma.onboardingModuleVersion.findFirstOrThrow({ where: { moduleId: finishedId, version: 2 } })
  assert.equal(row.changeNote, 'Fictional change')
  assert.equal(row.publishedById, HR)
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { id: finishedId } })
  assert.equal(module.currentVersionId, row.id)
  assert.equal(module.draftBlocks, null)
})

test('a new title and headline take effect on publish, and the fixed fields never move', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('how-we-work')
  await openModule('how-we-work')
  const before = await prisma.onboardingModule.findUniqueOrThrow({ where: { id: moduleId } })
  await saveDraft(prisma, moduleId, seeded('how-we-work'), {
    details: { title: 'Working here', estimatedMinutes: 12, headlineLead: 'HOW WE', headlineAccent: 'really work' },
  })
  await publishModule(prisma, moduleId, NOTE, HR)

  const view = await loadModule(prisma, HIRE_ID, 'how-we-work')
  assert.equal(view.title, 'Working here')
  assert.equal(view.estimatedMinutes, 12)
  assert.equal(view.headlineAccent, 'really work')
  const after = await prisma.onboardingModule.findUniqueOrThrow({ where: { id: moduleId } })
  assert.equal(after.draftDetails, null)
  for (const field of ['slug', 'orderIndex', 'phase', 'completionRule', 'icon'] as const) assert.equal(after[field], before[field], field)
})

test('removing the acknowledgement from Module 7 is refused and no version is made', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('security')
  await saveDraft(prisma, moduleId, seeded('security').filter((b) => b.type !== 'acknowledgement'))
  await assert.rejects(publishModule(prisma, moduleId, NOTE, HR), fails(409, /acknowledgement/i))
  assert.equal(await versionsOf(moduleId), 1)
  assert.equal((await loadContent(prisma, moduleId)).hasDraft, true)
})

test('a statement change is a new version and a signed row keeps what it signed', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('security')
  await openModule('security')
  const original = statementOf(seeded('security'))
  await signAcknowledgement(prisma, HIRE_ID, { moduleSlug: 'security', kind: 'SECURITY_SOPS', typedName: P.hire.name })
  const signedBefore = await prisma.onboardingAcknowledgement.findFirstOrThrow({ where: { userId: HIRE_ID } })

  const changed = seeded('security').map((b) => (b.type === 'acknowledgement' ? { ...b, statement: 'A new statement.' } : b))
  await saveDraft(prisma, moduleId, changed)
  assert.deepEqual(await publishModule(prisma, moduleId, NOTE, HR), { version: 2 })

  const view = await loadModule(prisma, HIRE_ID, 'security')
  assert.equal(statementOf(view.blocks), 'A new statement.')
  assert.equal(view.securityAcknowledgement, null)
  const signedAfter = await prisma.onboardingAcknowledgement.findUniqueOrThrow({ where: { id: signedBefore.id } })
  assert.equal(signedAfter.statementText, signedBefore.statementText)
  assert.notEqual(signedAfter.statementText, 'A new statement.')
  assert.ok(original)
})

test('asking for a re-read reopens finished rows on the new version, and hands back the notice', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('welcome')
  await scrollAndComplete('welcome')
  await saveDraft(prisma, moduleId, seeded('welcome'))

  const result = await publishModule(prisma, moduleId, { changeNote: 'Fictional', askReread: true }, HR)

  const row = await progressRow('welcome')
  assert.equal(row.status, 'IN_PROGRESS')
  assert.equal(result.version, 2)
  assert.ok((result.reopened ?? 0) >= 1)
  const current = await prisma.onboardingModule.findUniqueOrThrow({ where: { id: moduleId } })
  assert.equal(result.notice?.versionId, current.currentVersionId)
  assert.ok(result.notice?.userIds.includes(HIRE_ID))
  assert.equal(await prisma.onboardingProgressHistory.count({ where: { userId: HIRE_ID, moduleId } }), 1)
})

test('without a re-read finished rows are left alone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('welcome')
  await scrollAndComplete('welcome')
  const before = await progressRow('welcome')
  await saveDraft(prisma, moduleId, seeded('welcome'))

  const result = await publishModule(prisma, moduleId, NOTE, HR)

  const row = await progressRow('welcome')
  assert.equal(row.status, 'COMPLETED')
  assert.equal(row.versionId, before.versionId)
  assert.equal(result.notice, undefined)
})

test('a re-read that fails leaves the published version live and says so', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await saveDraft(prisma, moduleId, seeded('welcome'))
  const failing = async () => { throw new Error('fictional failure') }
  const result = await publishModule(prisma, moduleId, { changeNote: 'Fictional', askReread: true }, HR, { reread: failing })
  assert.equal(result.version, 2)
  assert.equal(result.rereadFailed, true)
  assert.equal(await versionsOf(moduleId), 2)
})

test('a change note is required', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await saveDraft(prisma, moduleId, seeded('welcome'))
  await assert.rejects(publishModule(prisma, moduleId, { changeNote: '  ', askReread: false }, HR), fails(400))
  assert.equal(await versionsOf(moduleId), 1)
})

test('with no draft there is nothing to publish', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await assert.rejects(publishModule(prisma, moduleId, NOTE, HR), fails(409, /nothing to publish/i))
})

test('discarding a draft goes back to the current version', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('how-we-work')
  await saveDraft(prisma, moduleId, withNote(seeded('how-we-work'), 'Discard me'), {
    details: { title: 'Discard me too', estimatedMinutes: 5, headlineLead: 'A', headlineAccent: 'B' },
  })
  const { updatedAt } = await loadContent(prisma, moduleId)
  await discardDraft(prisma, moduleId, { expectedUpdatedAt: updatedAt })
  const content = await loadContent(prisma, moduleId)
  assert.equal(content.hasDraft, false)
  assert.notEqual(content.details.title, 'Discard me too')
  assert.deepEqual(content.blocks, seeded('how-we-work'))
})

test('two people editing: a stale save, publish or discard gets the 409 and changes nothing', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('how-we-work')
  const { updatedAt: seen } = await loadContent(prisma, moduleId)

  const first = await saveDraft(prisma, moduleId, withNote(seeded('how-we-work'), 'First'), { expectedUpdatedAt: seen })
  assert.notEqual(first.updatedAt, seen)

  await assert.rejects(saveDraft(prisma, moduleId, withNote(seeded('how-we-work'), 'Second'), { expectedUpdatedAt: seen }), fails(409, STALE))
  await assert.rejects(publishModule(prisma, moduleId, { ...NOTE, expectedUpdatedAt: seen }, HR), fails(409, STALE))
  await assert.rejects(discardDraft(prisma, moduleId, { expectedUpdatedAt: seen }), fails(409, STALE))

  assert.ok(texts((await loadContent(prisma, moduleId)).blocks).includes('First'))
  assert.equal(await versionsOf(moduleId), 1)
  assert.deepEqual(await publishModule(prisma, moduleId, { ...NOTE, expectedUpdatedAt: first.updatedAt }, HR), { version: 2 })
})

test('two publishes at once make one version each or refuse, never a clash', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await saveDraft(prisma, moduleId, seeded('welcome'))
  const results = await Promise.allSettled([publishModule(prisma, moduleId, NOTE, HR), publishModule(prisma, moduleId, NOTE, HR)])
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
  assert.equal(await versionsOf(moduleId), 2)
})

test('a hire on a checklist module meets the new version, ticks and all', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('team-contacts')
  await openModule('team-contacts')
  const blocks = seeded('team-contacts').map((b) =>
    b.type === 'checklist' ? { ...b, items: [...b.items, { key: 'item-fictional', label: 'One more thing' }] } : b,
  )
  await saveDraft(prisma, moduleId, blocks)
  await publishModule(prisma, moduleId, NOTE, HR)

  await recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'CHECK', key: 'item-fictional', checked: true })
  await recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'CHECK', key: 'buddy-hello', checked: true })
  const done = await completeModule(prisma, HIRE_ID, 'team-contacts')
  assert.equal(done.alreadyCompleted, false)
})
