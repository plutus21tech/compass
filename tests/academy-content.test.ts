import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBlocks, type Block } from '../lib/academy/blocks'
import { findUnknownPlaceholders } from '../lib/academy/placeholders'
import { ACADEMY_MODULES } from '../prisma/seed-academy-data'
import { ACADEMY_MODULE_BLOCKS } from '../prisma/seed-academy-content'

type Conditional = Extract<Block, { type: 'conditional' }>

function walk(blocks: Block[]): Block[] {
  return blocks.flatMap((b) => (b.type === 'conditional' ? [b, ...walk(b.children)] : [b]))
}

function texts(blocks: Block[]): string[] {
  return walk(blocks).flatMap((b): string[] => {
    switch (b.type) {
      case 'video': return [b.summary]
      case 'richText': return [b.markdown]
      case 'peopleCards': return [b.heading ?? '', b.group ?? '']
      case 'linkCards': return [b.heading ?? '', ...b.links.map((l) => l.label)]
      case 'tutorialCards': return [b.heading ?? '']
      case 'checklist': return [b.heading ?? '', ...b.items.flatMap((i) => [i.key, i.label])]
      case 'dataTable': return [...b.headers, ...b.rows.flat()]
      case 'warningBox': return [b.heading, b.markdown]
      case 'inputField': return [b.label]
      case 'acknowledgement': return [b.statement]
      case 'copyText': return [b.label, b.text]
      case 'timeline': return b.items.flatMap((i) => [i.label, i.markdown])
      case 'toolTiles': return [b.heading ?? '', ...b.tools.flatMap((t) => [t.name, t.purpose])]
      case 'dashboardLink': return [b.label]
      default: return []
    }
  })
}

const slugs = ACADEMY_MODULES.map((m) => m.slug)
const blocksOf = (slug: string) => ACADEMY_MODULE_BLOCKS[slug]
const rule = (slug: string) => ACADEMY_MODULES.find((m) => m.slug === slug)?.completionRule

test('every module has non-empty content that passes parseBlocks', () => {
  assert.deepEqual(Object.keys(ACADEMY_MODULE_BLOCKS).sort(), [...slugs].sort())
  for (const slug of slugs) {
    assert.ok(blocksOf(slug).length > 0, slug)
    assert.deepEqual(parseBlocks(JSON.parse(JSON.stringify(blocksOf(slug)))), blocksOf(slug), slug)
  }
})

test('every placeholder used is known', () => {
  for (const slug of slugs) {
    for (const t of texts(blocksOf(slug))) assert.deepEqual(findUnknownPlaceholders(t), [], `${slug}: ${t}`)
  }
})

test('content contains no KPI wording and only hr@ and acct@ addresses', () => {
  const all = slugs.flatMap((s) => texts(blocksOf(s))).join('\n')
  assert.doesNotMatch(all, /kpi/i)
  const addresses = all.match(/[\w.+-]+@plutus21\.com/gi) ?? []
  assert.ok(addresses.length > 0)
  for (const a of addresses) assert.match(a, /^(hr|acct)@plutus21\.com$/i)
})

test('modules 1 and 2 are a single video block', () => {
  assert.deepEqual(blocksOf('welcome').map((b) => b.type), ['video'])
  assert.deepEqual(blocksOf('culture-values').map((b) => b.type), ['video'])
})

test('each module holds what its completion rule needs', () => {
  for (const slug of slugs) {
    const r = rule(slug)
    const bs = walk(blocksOf(slug))
    if (r === 'CHECKLIST_AND_FIELD') {
      assert.ok(bs.some((b) => b.type === 'checklist'), slug)
      assert.ok(bs.some((b) => b.type === 'inputField' && b.target === 'discordUsername'), slug)
    }
    if (r === 'CHECKLIST_AND_ACK') {
      assert.ok(bs.some((b) => b.type === 'checklist'), slug)
      assert.ok(bs.some((b) => b.type === 'acknowledgement'), slug)
    }
    if (r === 'LINK_OPENED') assert.ok(bs.some((b) => b.type === 'dashboardLink'), slug)
    if (r === 'FIELD_SUBMITTED') assert.ok(bs.some((b) => b.type === 'inputField' && b.target === 'linkedinUrl'), slug)
    if (r === 'ALL_LINKS_OPENED') assert.ok(bs.some((b) => b.type === 'tutorialCards'), slug)
    if (r === 'BUDDY_HELLO') {
      const items = bs.flatMap((b) => (b.type === 'checklist' ? b.items : []))
      assert.ok(items.some((i) => i.key === 'buddy-hello'), slug)
    }
  }
})

test('payment setup has bank and payout fields in separate branches', () => {
  const branches = blocksOf('getting-paid').filter((b): b is Conditional => b.type === 'conditional')
  assert.equal(branches.length, 2)
  const targets = branches.map((br) => walk(br.children).flatMap((b) => (b.type === 'inputField' ? [b.target] : [])))
  assert.deepEqual(targets[0], ['bank'])
  assert.deepEqual(targets[1], ['payout'])
  assert.ok(walk(branches[1].children).some((b) => b.type === 'checklist' && b.items.some((i) => i.key === 'invoice-template')))
})

test('stable checklist keys', () => {
  const keys = (slug: string) => walk(blocksOf(slug)).flatMap((b) => (b.type === 'checklist' ? b.items.map((i) => i.key) : []))
  assert.deepEqual(keys('discord'), Array.from({ length: 8 }, (_, i) => `discord-${i + 1}`))
  assert.deepEqual(keys('security'), ['twofa-google', 'twofa-discord', 'device-password'])
})

test('module 9 uses the client rule and the overlap time, module 5 the blockers time', () => {
  const bs = blocksOf('time-off')
  assert.ok(bs.some((b) => b.type === 'conditional' && 'clientAccountSet' in b.when))
  assert.match(texts(bs).join('\n'), /\{overlap local time\}/)
  assert.match(texts(blocksOf('how-we-work')).join('\n'), /\{blockers local time\}/)
})
