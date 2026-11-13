import test from 'node:test'
import assert from 'node:assert/strict'
import { payoutSchema } from '../lib/academy/payout'
import type { ProgressEvent, ProgressState } from '../lib/academy/progress'
import type { ModuleCardView, ModuleProgressView, PersonView } from '../lib/academy/view'
import {
  commuteTable,
  completionToast,
  displayedState,
  footerState,
  formatAcademyDate,
  formatAcademyDateTime,
  initialsOf,
  isExternalHref,
  moduleNumberLabel,
  moduleStatusLabel,
  neighbourSlugs,
  payoutBody,
  payoutFieldsFor,
  peopleForBlock,
  splitUnavailableAction,
} from '../lib/academy/view-labels'

const EMPTY: ProgressState = { checks: {}, linksOpenedAt: {}, scrolledToEnd: false }

function progress(over: Partial<ModuleProgressView> = {}): ModuleProgressView {
  return {
    state: EMPTY,
    status: 'IN_PROGRESS',
    overdue: false,
    effectiveRule: 'SCROLL_END',
    completion: { met: true },
    dueAt: null,
    completedAt: null,
    ...over,
  }
}

function card(over: Partial<ModuleCardView> = {}): ModuleCardView {
  return {
    slug: 'discord',
    title: 'Discord',
    number: 6,
    phase: 'DAY_1',
    estimatedMinutes: 15,
    icon: null,
    status: 'IN_PROGRESS',
    overdue: false,
    dueAt: null,
    completedAt: null,
    ...over,
  }
}

const person = (id: string, name: string): PersonView => ({
  id, name, title: null, discordUsername: null, photoUrl: null, email: null,
})

test('moduleNumberLabel pads to two digits', () => {
  assert.equal(moduleNumberLabel(3, 14), 'MODULE 03 OF 14')
  assert.equal(moduleNumberLabel(14, 14), 'MODULE 14 OF 14')
})

test('footerState returns the server reason while the rule is not met', () => {
  const reason = 'Read to the end of this page first.'
  assert.deepEqual(footerState(progress({ completion: { met: false, reason } }), 0), { kind: 'blocked', reason })
})

test('footerState is ready once the rule is met and nothing is unsaved', () => {
  assert.deepEqual(footerState(progress(), 0), { kind: 'ready' })
})

test('footerState holds the button while an event is still being saved', () => {
  assert.equal(footerState(progress(), 1).kind, 'blocked')
})

test('a completed module has no disabled state, even with an old unmet result', () => {
  const finished = progress({ status: 'COMPLETED', completion: { met: false, reason: 'old' } })
  assert.deepEqual(footerState(finished, 0), { kind: 'done' })
})

test('displayedState lays unsaved events over the confirmed state, in order', () => {
  const now = new Date('2026-11-05T10:00:00Z')
  const pending: ProgressEvent[] = [
    { type: 'CHECK', key: 'a', checked: true },
    { type: 'CHECK', key: 'a', checked: false },
    { type: 'LINK_OPENED', key: 'tutorial' },
    { type: 'SCROLLED_END' },
  ]
  const shown = displayedState({ ...EMPTY, checks: { b: true } }, pending, now)
  assert.deepEqual(shown.checks, { a: false, b: true })
  assert.ok(shown.linksOpenedAt.tutorial)
  assert.equal(shown.scrolledToEnd, true)
})

test('displayedState never changes the confirmed state', () => {
  const confirmed: ProgressState = { ...EMPTY, checks: {} }
  displayedState(confirmed, [{ type: 'CHECK', key: 'a', checked: true }], new Date())
  assert.deepEqual(confirmed.checks, {})
})

test('moduleStatusLabel uses the plain statuses of design section 7', () => {
  assert.equal(moduleStatusLabel(card({ status: 'LOCKED' }), 'UTC'), 'Complete Module 5 first')
  assert.equal(moduleStatusLabel(card({ status: 'AVAILABLE' }), 'UTC'), 'Start')
  assert.equal(moduleStatusLabel(card({ status: 'IN_PROGRESS' }), 'UTC'), 'Continue')
  assert.equal(
    moduleStatusLabel(card({ status: 'COMPLETED', completedAt: '2026-11-04T12:00:00Z' }), 'UTC'),
    'Completed 4 Nov 2026',
  )
})

test('formatAcademyDate uses the time zone it is given, so server and browser agree', () => {
  const iso = '2026-11-04T22:00:00Z'
  assert.equal(formatAcademyDate(iso, 'UTC'), '4 Nov 2026')
  assert.equal(formatAcademyDate(iso, 'Asia/Karachi'), '5 Nov 2026')
  assert.equal(formatAcademyDate(iso, null), '4 Nov 2026')
})

test('formatAcademyDateTime shows a call in the hire\'s own time', () => {
  assert.match(formatAcademyDateTime('2026-11-25T09:00:00Z', 'Asia/Karachi'), /25 Nov, 2:00 pm/)
})

test('completionToast names the module and what comes next', () => {
  assert.equal(completionToast(4, 'How We Work'), 'Nice, Module 4 done — next up: How We Work')
  assert.equal(completionToast(14, null), 'Nice, Module 14 done')
})

test('completionToast uses the short name of a two-part title', () => {
  assert.equal(completionToast(4, 'How We Work: Tools and Rhythm'), 'Nice, Module 4 done — next up: How We Work')
})

test('neighbourSlugs finds the module before this one', () => {
  const rail = [card({ slug: 'a' }), card({ slug: 'b' }), card({ slug: 'c' })]
  assert.equal(neighbourSlugs(rail, 'b').previous, 'a')
  assert.equal(neighbourSlugs(rail, 'a').previous, null)
})

test('neighbourSlugs gives the title of the next module, or nothing after the last', () => {
  const rail = [card({ slug: 'a' }), card({ slug: 'b', title: 'Second' })]
  assert.equal(neighbourSlugs(rail, 'a').nextTitle, 'Second')
  assert.equal(neighbourSlugs(rail, 'b').nextTitle, null)
})

test('initialsOf takes the first and last name, and copes with one or none', () => {
  assert.equal(initialsOf('Cara Ali Khan'), 'CK')
  assert.equal(initialsOf('cara'), 'C')
  assert.equal(initialsOf('   '), '?')
})

test('isExternalHref separates other sites from Compass pages', () => {
  assert.equal(isExternalHref('https://example.com/a'), true)
  assert.equal(isExternalHref('//example.com'), true)
  assert.equal(isExternalHref('mailto:hr@example.com'), false)
  assert.equal(isExternalHref('/handbook/leave'), false)
  assert.equal(isExternalHref('#end'), false)
})

test('splitUnavailableAction lifts the Leave line out of the copy', () => {
  const markdown = 'HR may decline requests.\n\n**Go to Leave in Compass** (Available after onboarding)'
  assert.deepEqual(splitUnavailableAction(markdown), {
    markdown: 'HR may decline requests.',
    action: { label: 'Go to Leave in Compass', note: 'Available after onboarding' },
  })
})

test('splitUnavailableAction leaves other copy alone', () => {
  const markdown = '**Bold text** (and an aside)\n\nMore.'
  assert.deepEqual(splitUnavailableAction(markdown), { markdown, action: null })
})

test('peopleForBlock reads the right source and skips missing people', () => {
  const lead = person('l', 'Lead')
  const hr = person('h', 'Hana')
  const it = person('i', 'Ivo')
  const people = {
    lead,
    team: [person('t', 'Tam')],
    buddy: null,
    keyContacts: { HR: [hr], SECURITY_IT: [it, hr], ACCOUNTS: [] },
  }
  assert.deepEqual(peopleForBlock('lead', undefined, people), [lead])
  assert.deepEqual(peopleForBlock('buddy', undefined, people), [])
  assert.deepEqual(peopleForBlock('keyContacts', 'HR', people), [hr])
  assert.deepEqual(peopleForBlock('keyContacts', 'NOPE', people), [])
  assert.deepEqual(peopleForBlock('keyContacts', undefined, people), [hr, it], 'one card per person')
})

test('payoutFieldsFor shows only the fields of the chosen method', () => {
  const names = (method: Parameters<typeof payoutFieldsFor>[0]) => payoutFieldsFor(method).map((f) => f.name)
  assert.deepEqual(names('WISE'), ['accountHolderName', 'payoutEmail', 'currency'])
  assert.deepEqual(names('PAYONEER'), ['accountHolderName', 'payoutEmail', 'currency'])
  assert.deepEqual(names('OTHER'), ['accountHolderName', 'instructions', 'currency'])
  assert.deepEqual(names('BANK_TRANSFER'), [
    'accountHolderName', 'bankName', 'accountNumberOrIban', 'swiftBic', 'bankCountry', 'bankAddress', 'currency',
  ])
})

test('payoutBody passes the server schema and drops fields of another method', () => {
  const body = payoutBody('WISE', {
    accountHolderName: ' Cara Khan ',
    payoutEmail: 'cara@example.com',
    currency: 'usd',
    swiftBic: 'left over',
  })
  assert.deepEqual(body, { method: 'WISE', accountHolderName: 'Cara Khan', payoutEmail: 'cara@example.com', currency: 'USD' })
  assert.equal(payoutSchema.safeParse(body).success, true)
})

test('payoutBody upper-cases the coded bank fields and leaves out an empty optional address', () => {
  const body = payoutBody('BANK_TRANSFER', {
    accountHolderName: 'Cara Khan',
    bankName: 'Example Bank',
    accountNumberOrIban: 'GB00 0000',
    swiftBic: 'abcdgb2l',
    bankCountry: 'gb',
    bankAddress: '  ',
    currency: 'gbp',
  })
  assert.equal(body.swiftBic, 'ABCDGB2L')
  assert.equal(body.bankCountry, 'GB')
  assert.equal('bankAddress' in body, false)
  assert.equal(payoutSchema.safeParse(body).success, true)
})

test('commuteTable gives readable rows for the shared table', () => {
  const table = commuteTable([
    { transportMode: 'BIKE', minKm: 0, maxKm: 5, monthlyRate: 7500 },
    { transportMode: 'PUBLIC_TRANSPORT', minKm: 5, maxKm: null, monthlyRate: 12000 },
  ])
  assert.deepEqual(table.headers, ['Transport', 'Distance', 'Monthly rate'])
  assert.deepEqual(table.rows, [
    ['Bike', '0 to 5 km', 'PKR 7,500'],
    ['Public transport', 'Over 5 km', 'PKR 12,000'],
  ])
})
