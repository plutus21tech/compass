import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { OnboardingCompletionRule } from '@prisma/client'
import { parseBlocks, type Block } from '../lib/academy/blocks'
import {
  ADDABLE_BLOCKS,
  blockLabel,
  describeCondition,
  fixedBlocksChanged,
  moduleDetailsSchema,
  newBlock,
  newItemKey,
  publishProblems,
  withoutDraft,
} from '../lib/academy/content-rules'
import { ACADEMY_MODULES } from '../prisma/seed-academy-data'
import { ACADEMY_MODULE_BLOCKS } from '../prisma/seed-academy-content'

const checklist = (key = 'a', label = 'Do the thing'): Block => ({ type: 'checklist', items: [{ key, label }] })
const field = (target: 'discordUsername' | 'linkedinUrl' | 'bank' | 'payout'): Block => ({ type: 'inputField', target, label: 'Your details' })
const ack: Block = { type: 'acknowledgement', kind: 'SECURITY_SOPS', statement: 'I agree.' }
const when = (...children: Block[]): Block => ({ type: 'conditional', when: { clientAccountSet: true }, children })
const rich = (markdown: string): Block => ({ type: 'richText', markdown })
const forContracts = (contractType: Array<'PK_EMPLOYMENT' | 'INDEPENDENT_CONTRACTOR' | 'OTHER_EMPLOYMENT'>, ...children: Block[]): Block => ({
  type: 'conditional', when: { contractType }, children,
})
const PK = ['PK_EMPLOYMENT'] as const
const OTHERS = ['INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT'] as const

const CASES: Array<{ rule: OnboardingCompletionRule; valid: Block[]; invalid: Block[]; names: RegExp }> = [
  { rule: 'BUDDY_HELLO', valid: [checklist('buddy-hello')], invalid: [checklist('other')], names: /buddy hello/i },
  { rule: 'CHECKLIST_AND_FIELD', valid: [checklist(), field('discordUsername')], invalid: [field('discordUsername')], names: /checklist/i },
  { rule: 'CHECKLIST_AND_FIELD', valid: [checklist(), field('discordUsername')], invalid: [checklist()], names: /discord/i },
  { rule: 'CHECKLIST_AND_ACK', valid: [checklist(), ack], invalid: [ack], names: /checklist/i },
  { rule: 'CHECKLIST_AND_ACK', valid: [checklist(), ack], invalid: [checklist()], names: /acknowledgement/i },
  { rule: 'FIELD_SUBMITTED', valid: [field('linkedinUrl')], invalid: [rich('Hello')], names: /linkedin/i },
  { rule: 'PAYMENT_SETUP', valid: [field('bank'), field('payout')], invalid: [field('payout')], names: /bank/i },
  { rule: 'PAYMENT_SETUP', valid: [field('bank'), field('payout')], invalid: [field('bank')], names: /payout/i },
  { rule: 'LINK_OPENED', valid: [{ type: 'dashboardLink', label: 'Open it' }], invalid: [rich('Hello')], names: /dashboard/i },
  { rule: 'VIDEO_95', valid: [{ type: 'video', videoKey: 'VIDEO_1', summary: 'Hello' }], invalid: [rich('Hello')], names: /video/i },
  { rule: 'ALL_LINKS_OPENED', valid: [{ type: 'tutorialCards' }], invalid: [rich('Hello')], names: /tutorial/i },
]

for (const { rule, valid, invalid, names } of CASES) {
  test(`${rule}: a missing block is named (${names.source})`, () => {
    assert.deepEqual(publishProblems(rule, valid), [])
    const problems = publishProblems(rule, invalid)
    assert.equal(problems.length, 1)
    assert.match(problems[0], names)
  })
}

test('a scroll module needs no particular block', () => {
  assert.deepEqual(publishProblems('SCROLL_END', [rich('Hello')]), [])
})

test('an empty checklist does not satisfy a rule that needs ticks', () => {
  const empty: Block = { type: 'checklist', items: [] }
  assert.match(publishProblems('CHECKLIST_AND_ACK', [empty, ack])[0], /checklist/i)
})

test('a required block with a fallback may sit inside a conditional, at any depth', () => {
  assert.deepEqual(publishProblems('BUDDY_HELLO', [when(when(checklist('buddy-hello')))]), [])
  assert.deepEqual(publishProblems('LINK_OPENED', [when({ type: 'dashboardLink', label: 'Open it' })]), [])
  assert.deepEqual(publishProblems('CHECKLIST_AND_FIELD', [when(checklist()), when(field('discordUsername'))]), [])
  assert.deepEqual(publishProblems('ALL_LINKS_OPENED', [when({ type: 'tutorialCards' })]), [])
  assert.deepEqual(publishProblems('CHECKLIST_AND_ACK', [when(checklist()), ack]), [])
})

test('the acknowledgement has no fallback, so it can never be hidden from anyone', () => {
  const problems = publishProblems('CHECKLIST_AND_ACK', [checklist(), when(ack)])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /acknowledgement/i)
})

test('a PK hire shown only the payout box is refused', () => {
  const shownPayout = publishProblems('PAYMENT_SETUP', [forContracts([...PK], field('payout')), forContracts([...OTHERS], field('bank'))])
  assert.ok(shownPayout.some((problem) => /bank/i.test(problem)))
  assert.ok(publishProblems('PAYMENT_SETUP', [field('payout'), forContracts([...OTHERS], field('bank'))]).some((problem) => /bank/i.test(problem)))
})

test('a contractor shown only the bank box is refused', () => {
  const problems = publishProblems('PAYMENT_SETUP', [forContracts([...PK], field('bank')), forContracts(['OTHER_EMPLOYMENT'], field('payout'))])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /payout/i)
})

test('payment boxes in their own contract branches can be published', () => {
  assert.deepEqual(publishProblems('PAYMENT_SETUP', [forContracts([...PK], field('bank')), forContracts([...OTHERS], field('payout'))]), [])
})

test('the payment pair is checked across branches, as a pair', () => {
  assert.deepEqual(publishProblems('PAYMENT_SETUP', [when(field('bank')), when(when(field('payout')))]), [])
  assert.equal(publishProblems('PAYMENT_SETUP', [when(field('bank'))]).length, 1)
  assert.equal(publishProblems('PAYMENT_SETUP', []).length, 2)
})

test('an unknown placeholder is refused wherever it sits, each named once', () => {
  const problems = publishProblems('SCROLL_END', [
    rich('Hello {nonsense} and {nonsense}'),
    when({ type: 'dataTable', headers: ['{nonsense}'], rows: [['{other thing}']] }),
    { type: 'peopleCards', source: 'lead', heading: '{third}' },
  ])
  assert.equal(problems.length, 3)
  assert.match(problems[0], /\{nonsense\}/)
  assert.match(problems[1], /\{other thing\}/)
  assert.match(problems[2], /\{third\}/)
})

test('a known placeholder is fine', () => {
  assert.deepEqual(publishProblems('SCROLL_END', [rich('Hello {preferred name}')]), [])
})

test('a duplicate checklist key is refused, across checklists and branches', () => {
  assert.match(publishProblems('SCROLL_END', [checklist('a'), when(checklist('a'))])[0], /same/i)
  assert.match(
    publishProblems('SCROLL_END', [{ type: 'checklist', items: [{ key: 'a', label: 'One' }, { key: 'a', label: 'Two' }] }])[0],
    /same/i,
  )
})

test('blank text that a hire would see is refused', () => {
  const blanks: Block[] = [
    rich('  '),
    checklist('a', ''),
    { ...ack, statement: ' ' },
    { type: 'warningBox', heading: '', markdown: 'Body' },
    { type: 'copyText', label: 'Label', text: '' },
    { type: 'timeline', items: [{ label: '', markdown: 'Body' }] },
    { type: 'linkCards', links: [{ label: '', linkKey: 'LEAVE_POLICY' }] },
    { type: 'dataTable', headers: ['', ' '], rows: [] },
    { type: 'toolTiles', tools: [{ name: '', purpose: 'Body' }], includeTeamTools: false },
    { type: 'inputField', target: 'bank', label: '' },
    { type: 'dashboardLink', label: '' },
    { type: 'video', videoKey: 'VIDEO_1', summary: '' },
  ]
  for (const block of blanks) {
    const problems = publishProblems('SCROLL_END', [block])
    assert.equal(problems.length, 1, block.type)
    assert.ok(problems[0].includes(blockLabel(block)), problems[0])
  }
})

test('a table may leave some headers blank, as long as one has text', () => {
  assert.deepEqual(publishProblems('SCROLL_END', [{ type: 'dataTable', headers: ['Rate', ''], rows: [['10', 'per km']] }]), [])
  assert.deepEqual(publishProblems('SCROLL_END', [{ type: 'dataTable', headers: ['', 'Amount'], rows: [['Car', '10']] }]), [])
})

test('every seeded module can be published', () => {
  assert.equal(ACADEMY_MODULES.length, 14)
  for (const module of ACADEMY_MODULES) {
    assert.deepEqual(publishProblems(module.completionRule, parseBlocks(ACADEMY_MODULE_BLOCKS[module.slug])), [], module.slug)
  }
})

test('a draft keeps every fixed block where the live version has it', () => {
  const video: Block = { type: 'video', videoKey: 'VIDEO_1', summary: 'Hello' }
  const live: Block[] = [video, ack, when(field('bank')), { type: 'dashboardLink', label: 'Open it' }]
  assert.equal(fixedBlocksChanged(live, live), false)
  assert.equal(fixedBlocksChanged(live, [...live].reverse()), false, 'reordering is free')
  assert.equal(fixedBlocksChanged(live, [ack]), false, 'deleting is free')
  assert.equal(fixedBlocksChanged(live, [{ ...video, summary: 'New' }, { ...ack, statement: 'New' }, rich('More')]), false, 'text is free')
})

test('a draft that changes or adds a fixed block is caught', () => {
  const live: Block[] = [{ type: 'video', videoKey: 'VIDEO_1', summary: 'Hello' }, when(field('bank'))]
  assert.equal(fixedBlocksChanged(live, [{ type: 'video', videoKey: 'VIDEO_2', summary: 'Hello' }]), true, 'videoKey')
  assert.equal(fixedBlocksChanged(live, [when(field('payout'))]), true, 'target')
  assert.equal(fixedBlocksChanged(live, [field('bank')]), true, 'moved out of its conditional')
  assert.equal(fixedBlocksChanged(live, [{ type: 'conditional', when: { location: ['KARACHI'] }, children: [] }]), true, 'when')
  assert.equal(fixedBlocksChanged(live, [ack]), true, 'added acknowledgement')
  assert.equal(fixedBlocksChanged(live, [when(field('bank'), field('bank'))]), true, 'a second copy')
  assert.equal(fixedBlocksChanged(live, [{ type: 'dashboardLink', label: 'Open' }]), true, 'added dashboard link')
})

test('the legacy module payload carries no draft', () => {
  const stripped = withoutDraft({ id: 'a', title: 'B', draftBlocks: [], draftDetails: {} })
  assert.deepEqual(stripped, { id: 'a', title: 'B' })
})

test('both legacy module routes strip the draft from everything they send', () => {
  const list = readFileSync(join(__dirname, '..', 'app/api/onboarding/modules/route.ts'), 'utf8')
  assert.match(list, /\.\.\.withoutDraft\(module\)/)
  assert.doesNotMatch(list, /\.\.\.module,/)
  const one = readFileSync(join(__dirname, '..', 'app/api/onboarding/modules/[id]/route.ts'), 'utf8')
  assert.match(one, /module: withoutDraft\(module\)/)
  assert.match(one, /module: withoutDraft\(updated\)/)
})

test('every kind of condition reads as plain words', () => {
  assert.equal(describeCondition({ clientAccountSet: true }), 'Only shown to people with a client account.')
  assert.equal(
    describeCondition({ contractType: ['INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT'] }),
    'Only shown to people on these contracts: Independent contractor, Other employment.',
  )
  assert.equal(describeCondition({ location: ['KARACHI'] }), 'Only shown to people in Karachi.')
  assert.equal(describeCondition({ location: ['KARACHI', 'REMOTE'] }), 'Only shown to people in Karachi or Remote.')
  assert.equal(describeCondition({ companyWing: 'CAPITAL' }), 'Only shown to people in Capital.')
  assert.equal(describeCondition({ companyWing: 'PARTNERS' }), 'Only shown to people in Partners.')
})

test('a new checklist key is unique and never one the rules read', () => {
  assert.match(newItemKey(['item-1']), /^item-[a-z0-9]+$/)
  const taken = new Set<string>()
  for (let i = 0; i < 200; i += 1) taken.add(newItemKey([...taken]))
  assert.equal(taken.size, 200)
})

test('nothing HR can add collects data, signs, or changes who sees what', () => {
  for (const type of ['inputField', 'acknowledgement', 'video', 'conditional', 'dashboardLink'] as const) {
    assert.equal(ADDABLE_BLOCKS.includes(type as never), false, type)
  }
})

test('every addable block starts valid, so a draft can always be saved', () => {
  for (const type of ADDABLE_BLOCKS) assert.equal(parseBlocks([newBlock(type)]).length, 1, type)
})

test('a new checklist comes with its first item and a key already set', () => {
  const block = newBlock('checklist')
  assert.ok(block.type === 'checklist' && block.items.length === 1 && block.items[0].key.startsWith('item-'))
})

test('module details need a title, sensible minutes and short headline parts', () => {
  const good = { title: ' Welcome ', estimatedMinutes: 10, headlineLead: 'WELCOME TO', headlineAccent: 'Plutus21' }
  assert.equal(moduleDetailsSchema.parse(good).title, 'Welcome')
  assert.equal(moduleDetailsSchema.safeParse({ ...good, title: ' ' }).success, false)
  assert.equal(moduleDetailsSchema.safeParse({ ...good, estimatedMinutes: 0 }).success, false)
  assert.equal(moduleDetailsSchema.safeParse({ ...good, estimatedMinutes: 1.5 }).success, false)
  assert.equal(moduleDetailsSchema.safeParse({ ...good, headlineLead: 'x'.repeat(200) }).success, false)
  assert.equal(moduleDetailsSchema.safeParse({ ...good, slug: 'moved' }).success, false)
})

test('with the flag on the legacy PUT refuses before it reads or writes, and off it is unchanged', () => {
  const source = readFileSync(join(__dirname, '..', 'app/api/onboarding/modules/[id]/route.ts'), 'utf8')
  const put = source.slice(source.indexOf('export async function PUT'))
  const flag = put.indexOf('isAcademyEnabled()')
  assert.ok(flag > 0)
  assert.ok(flag > put.indexOf('canManageOnboarding'))
  assert.ok(flag < put.indexOf('findModuleByIdOrSlug'))
  assert.match(put, /Use the new module editor\./)
  assert.match(put, /blocksModuleSwitch\(module, isActive\)/)
})

test('with the flag on the old modules page redirects to the new editor', () => {
  const source = readFileSync(join(__dirname, '..', 'app/(hr)/admin/onboarding/modules/page.tsx'), 'utf8')
  assert.match(source, /isAcademyEnabled\(\)/)
  assert.match(source, /redirect\('\/admin\/onboarding\/academy\/modules'\)/)
  assert.match(source, /force-dynamic/)
})

test('the publish route mails a re-read after the commit and has time to', () => {
  const source = readFileSync(join(__dirname, '..', 'app/api/admin/onboarding/content/[moduleId]/publish/route.ts'), 'utf8')
  assert.match(source, /export const maxDuration = 300/)
  assert.match(source, /after\(\(\) => notifyAssigned\(prisma, notice\)\)/)
})

test('a refusal that only repeats the problems already listed is not shown again', async () => {
  const { repeatsProblems } = await import('../lib/academy/content-rules')
  const problems = ['Rich text is missing some text. Fill it in or delete it.']
  assert.equal(repeatsProblems(`This can't be published yet. ${problems[0]}`, problems), true)
  assert.equal(repeatsProblems('Someone else saved this module. Reload to see their changes.', problems), false)
  assert.equal(repeatsProblems(`This can't be published yet. ${problems[0]}`, []), false)
  assert.equal(repeatsProblems(null, problems), false)
})

test('a module may hold one video only, wherever the second one sits', () => {
  const video = (videoKey: 'VIDEO_1' | 'VIDEO_2'): Block => ({ type: 'video', videoKey, summary: 'Watch this.' })
  assert.deepEqual(publishProblems('VIDEO_95', [video('VIDEO_1')]), [])
  const twice = publishProblems('VIDEO_95', [video('VIDEO_1'), video('VIDEO_2')])
  assert.deepEqual(twice, ['A module can show one video. Delete the extra one.'])
  const nested = publishProblems('VIDEO_95', [
    video('VIDEO_1'),
    { type: 'conditional', when: { clientAccountSet: true }, children: [video('VIDEO_1')] } as Block,
  ])
  assert.deepEqual(nested, ['A module can show one video. Delete the extra one.'])
})
