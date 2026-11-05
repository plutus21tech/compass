import test from 'node:test'
import assert from 'node:assert/strict'
import { progressEventSchema } from '../lib/academy/progress'
import type { Block } from '../lib/academy/blocks'
import { buildPlaceholderValues, eventKeysFor, renderBlocks, splitCardBody } from '../lib/academy/view'

const VALUES = { 'preferred name': 'Cara', title: 'Analyst' }

test('renderBlocks fills every text field, blanks unknown names and leaves ids alone', () => {
  const blocks: Block[] = [
    { type: 'video', videoKey: 'VIDEO_1', summary: 'Hi {preferred name}' },
    { type: 'richText', markdown: '{title}{nope}' },
    { type: 'peopleCards', source: 'lead', heading: '{title}' },
    { type: 'linkCards', heading: '{title}', links: [{ label: '{title}', linkKey: 'INCIDENT_FORM' }] },
    { type: 'tutorialCards', heading: '{title}' },
    { type: 'checklist', heading: '{title}', items: [{ key: 'id-{title}', label: '{title}' }] },
    { type: 'dataTable', headers: ['{title}'], rows: [['{title}']] },
    { type: 'warningBox', heading: '{title}', markdown: '{title}' },
    { type: 'inputField', target: 'bank', label: '{title}' },
    { type: 'acknowledgement', kind: 'SECURITY_SOPS', statement: '{title}' },
    { type: 'copyText', label: '{title}', text: '{title}' },
    { type: 'timeline', items: [{ label: '{title}', markdown: '{title}' }] },
    { type: 'toolTiles', heading: '{title}', tools: [{ name: '{title}', purpose: '{title}' }], includeTeamTools: false },
    { type: 'dashboardLink', label: '{title}' },
  ]
  const out = JSON.stringify(renderBlocks(blocks, VALUES))
  assert.ok(out.includes('"Hi Cara"'))
  assert.ok(out.includes('"id-{title}"'), 'a checklist key is an id, not text')
  assert.doesNotMatch(out.replace('id-{title}', ''), /[{](title|nope)[}]/)
})

test('splitCardBody splits around the commute token', () => {
  assert.deepEqual(splitCardBody('Rates vary. {commute rate table} Ask HR.', VALUES), [
    { kind: 'text', text: 'Rates vary. ' },
    { kind: 'commuteTable' },
    { kind: 'text', text: ' Ask HR.' },
  ])
  assert.deepEqual(splitCardBody('{commute rate table}', VALUES), [{ kind: 'commuteTable' }])
  assert.deepEqual(splitCardBody('For {preferred name}.', VALUES), [{ kind: 'text', text: 'For Cara.' }])
})

test('eventKeysFor returns only what the blocks define', () => {
  const blocks: Block[] = [
    { type: 'checklist', items: [{ key: 'one', label: 'x' }, { key: 'two', label: 'y' }] },
    { type: 'tutorialCards' },
    { type: 'dashboardLink', label: 'x' },
  ]
  assert.deepEqual(eventKeysFor(blocks, ['tutorial:abc']), {
    checks: ['one', 'two'],
    links: ['tutorial:abc', 'COMPANY_DASHBOARD'],
  })
  assert.deepEqual(eventKeysFor([{ type: 'richText', markdown: 'x' }], ['tutorial:abc']), { checks: [], links: [] })
})

const person = (name: string) => ({ id: name, name, title: null, discordUsername: null, photoUrl: null, email: null })

test('buildPlaceholderValues falls back for contacts and leaves unknown values empty', () => {
  const values = buildPlaceholderValues({
    name: 'Cara Lindqvist', preferredName: null, title: 'Analyst', department: null,
    attributes: { officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE', contractType: null, employmentStatus: null },
    lead: null, coreHoursStart: null, coreHoursEnd: null, goals: { day1Goal: null, week1Goal: null, month1Goal: null, month3Goal: null },
    blockersCallCt: 'WED 07:00', keyContacts: { HR: [], SECURITY_IT: [], ACCOUNTS: [], EXECUTION: [] },
  }, new Date('2026-12-01T00:00:00Z'))
  assert.equal(values['preferred name'], 'Cara')
  assert.equal(values['security contacts'], 'Security and IT')
  assert.equal(values['accounts contacts'], 'Accounts')
  assert.equal(values.department, '')
  assert.equal(values['lead first name'], '')
  assert.equal(values['core hours'], '')
  assert.equal(values.location, 'Indonesia')
  assert.equal(values['blockers local time'], '8:00 PM')
})

test('buildPlaceholderValues names key contacts and formats core hours', () => {
  const values = buildPlaceholderValues({
    name: 'Cara Lindqvist', preferredName: 'CJ', title: 'Analyst', department: 'Research',
    attributes: { officeLocation: 'KARACHI', remoteCountry: null, workMode: 'OFFICE', contractType: null, employmentStatus: null },
    lead: person('Layla Mercer'), coreHoursStart: '10:00', coreHoursEnd: '18:30',
    goals: { day1Goal: 'a', week1Goal: 'b', month1Goal: 'c', month3Goal: 'd' }, blockersCallCt: 'WED 07:00',
    keyContacts: {
      HR: [], EXECUTION: [], ACCOUNTS: [],
      SECURITY_IT: [{ ...person('Ana Torvik'), email: 'ana@example.test' }, person('IT desk')],
    },
  }, new Date('2026-12-01T00:00:00Z'))
  assert.equal(values['preferred name'], 'CJ')
  assert.equal(values['lead first name'], 'Layla')
  assert.equal(values['core hours'], '10:00 AM to 6:30 PM')
  assert.equal(values['security contacts'], 'Ana Torvik (ana@example.test), IT desk')
  assert.equal(values.location, 'Karachi')
  assert.equal(values['month 3 goal'], 'd')
})

test('progressEventSchema accepts the three events and rejects anything else', () => {
  assert.ok(progressEventSchema.safeParse({ type: 'CHECK', key: 'a', checked: true }).success)
  assert.ok(progressEventSchema.safeParse({ type: 'LINK_OPENED', key: 'a' }).success)
  assert.ok(progressEventSchema.safeParse({ type: 'SCROLLED_END' }).success)
  assert.ok(!progressEventSchema.safeParse({ type: 'CHECK', key: 'a' }).success)
  assert.ok(!progressEventSchema.safeParse({ type: 'CHECK', key: '', checked: true }).success)
  assert.ok(!progressEventSchema.safeParse({ type: 'CHECK', key: 'x'.repeat(201), checked: true }).success)
  assert.ok(!progressEventSchema.safeParse({ type: 'COMPLETE' }).success)
  assert.ok(!progressEventSchema.safeParse(null).success)
})
