import test from 'node:test'
import assert from 'node:assert/strict'
import { filterBlocks, parseBlocks, type ConditionFacts } from '../lib/academy/blocks'

const attrs = { officeLocation: 'KARACHI', remoteCountry: null, workMode: 'OFFICE', contractType: null, employmentStatus: null } as const
const facts = (over: Partial<ConditionFacts> = {}): ConditionFacts => ({
  attributes: { ...attrs },
  clientAccount: null,
  companyWing: null,
  ...over,
})
const rich = (markdown: string) => ({ type: 'richText', markdown })

test('parseBlocks accepts valid blocks of several types', () => {
  const blocks = parseBlocks([
    rich('hello'),
    { type: 'video', videoKey: 'VIDEO_1', summary: 's' },
    { type: 'callTimes' },
    { type: 'linkCards', links: [{ label: 'Leave', linkKey: 'LEAVE_POLICY' }] },
  ])
  assert.equal(blocks.length, 4)
})

test('parseBlocks rejects an unknown type', () => {
  assert.throws(() => parseBlocks([{ type: 'confetti' }]))
})

test('parseBlocks rejects an unknown linkKey', () => {
  assert.throws(() => parseBlocks([{ type: 'linkCards', links: [{ label: 'x', linkKey: 'NOPE' }] }]))
})

test('parseBlocks rejects non-array input and bad nested children', () => {
  assert.throws(() => parseBlocks({ type: 'richText' }))
  assert.throws(() => parseBlocks([{ type: 'conditional', when: { clientAccountSet: true }, children: [{ type: 'nope' }] }]))
})

test('filterBlocks drops clientAccountSet when no client account, keeps it when set', () => {
  const blocks = parseBlocks([{ type: 'conditional', when: { clientAccountSet: true }, children: [rich('client')] }, rich('always')])
  assert.deepEqual(filterBlocks(blocks, facts()).map((b) => b.type), ['richText'])
  assert.deepEqual(filterBlocks(blocks, facts({ clientAccount: 'Acme' })), parseBlocks([rich('client'), rich('always')]))
})

test('filterBlocks drops contractType rule when contractType is null, and matches when listed', () => {
  const blocks = parseBlocks([{ type: 'conditional', when: { contractType: ['PK_EMPLOYMENT'] }, children: [rich('pk')] }])
  assert.equal(filterBlocks(blocks, facts()).length, 0)
  assert.equal(filterBlocks(blocks, facts({ attributes: { ...attrs, contractType: 'INDEPENDENT_CONTRACTOR' } })).length, 0)
  assert.equal(filterBlocks(blocks, facts({ attributes: { ...attrs, contractType: 'PK_EMPLOYMENT' } })).length, 1)
})

test('filterBlocks handles location and companyWing rules', () => {
  const blocks = parseBlocks([
    { type: 'conditional', when: { location: ['KARACHI', 'DALLAS'] }, children: [rich('office')] },
    { type: 'conditional', when: { companyWing: 'CAPITAL' }, children: [rich('capital')] },
  ])
  assert.equal(filterBlocks(blocks, facts()).length, 1)
  assert.equal(filterBlocks(blocks, facts({ companyWing: 'CAPITAL' })).length, 2)
  assert.equal(filterBlocks(blocks, facts({ companyWing: 'PARTNERS' })).length, 1)
})

test('filterBlocks resolves nested conditionals', () => {
  const blocks = parseBlocks([
    {
      type: 'conditional',
      when: { clientAccountSet: true },
      children: [rich('a'), { type: 'conditional', when: { location: ['DALLAS'] }, children: [rich('b')] }],
    },
  ])
  assert.equal(filterBlocks(blocks, facts({ clientAccount: 'Acme' })).length, 1)
  const dallas = facts({ clientAccount: 'Acme', attributes: { ...attrs, officeLocation: 'DALLAS' } })
  assert.equal(filterBlocks(blocks, dallas).length, 2)
})

test('filterBlocks does not mutate its input', () => {
  const blocks = parseBlocks([{ type: 'conditional', when: { clientAccountSet: true }, children: [rich('x')] }])
  const before = JSON.stringify(blocks)
  filterBlocks(blocks, facts({ clientAccount: 'Acme' }))
  assert.equal(JSON.stringify(blocks), before)
})
