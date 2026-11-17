import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PersonProfileView } from '@/components/people/profile/PersonProfile'
import { PayHistory, formatMoney } from '@/components/people/profile/ProfilePay'
import { ProfileAvatarFigure } from '@/components/people/profile/ProfileAvatarFigure'
import { PersonLink } from '@/components/people/PersonLink'
import { resolveAvatarLook } from '@/lib/avatar-pixels'
import type { PersonProfile, ProfileCompensation } from '@/lib/people/profile-rules'

const NO_AVATAR = {
  skinTone: null, bodyFrame: null, outfitType: null, outfitColor: null, outfitAccentColor: null,
  hairCategory: null, hairColor: null, headCoveringType: null, headCoveringColor: null, accessories: [],
}

function profile(o: Partial<PersonProfile> = {}): PersonProfile {
  return {
    id: 'p1',
    name: 'Rhea Castillo',
    position: 'Designer',
    department: 'Design',
    teamLabel: 'Pakistan Team',
    email: 'rhea@example.test',
    discordId: '123456',
    discordUsername: 'rhea#0001',
    linkedinUrl: null,
    avatar: NO_AVATAR,
    leave: [],
    projects: [],
    details: { bio: null, hobbies: null, funFact: null, askMeAbout: null },
    isSelf: false,
    canSeeCompensation: false,
    ...o,
  }
}

const render = (p: PersonProfile): string =>
  renderToStaticMarkup(createElement(PersonProfileView, { profile: p, onDetailsSaved: () => {} }))

test('a profile shows the basics: name, title, department, team, email and Discord', () => {
  const html = render(profile())
  assert.match(html, /<h1[^>]*>Rhea Castillo<\/h1>/)
  assert.match(html, />Designer</)
  assert.match(html, /Design · Pakistan Team/)
  assert.match(html, /href="mailto:rhea@example\.test"/)
  assert.match(html, />rhea#0001</)
  assert.match(html, /ID 123456/)
})

test('leave shows dates and type, and marks leave running now', () => {
  const html = render(
    profile({
      leave: [
        { id: 'a', leaveType: 'CASUAL', startDate: '2026-11-16', endDate: '2026-11-18', isHalfDay: false, ongoing: true },
        { id: 'b', leaveType: 'ANNUAL', startDate: '2026-12-01', endDate: '2026-12-01', isHalfDay: true, ongoing: false },
      ],
    })
  )
  assert.match(html, /Out now/)
  assert.match(html, /Casual/)
  assert.match(html, /Annual · Half day/)
  assert.equal(html.match(/Out now/g)?.length, 1)
})

test('projects list with the person\'s role; empty lists say so', () => {
  const html = render(profile({ projects: [{ id: 'x', name: 'Atlas', role: 'LEAD' }] }))
  assert.match(html, />Atlas</)
  assert.match(html, />Lead</)
  const empty = render(profile())
  assert.match(empty, /Rhea is not on any active projects/)
  assert.match(empty, /Rhea has no leave coming up/)
})

test('about-me answers show for everyone, but only the owner gets an edit button', () => {
  const details = { bio: 'Draws things.', hobbies: null, funFact: 'Left-handed', askMeAbout: null }
  const other = render(profile({ details }))
  assert.match(other, /Draws things\./)
  assert.match(other, /Fun fact/)
  assert.doesNotMatch(other, /Outside work/)
  assert.doesNotMatch(other, />Edit</)
  const own = render(profile({ details, isSelf: true }))
  assert.match(own, />Edit</)
  assert.match(own, /href="\/profile"/)
  assert.match(render(profile({ isSelf: true })), />Add</)
})

test('the pay section exists only for HR and OA, and starts hidden', () => {
  assert.doesNotMatch(render(profile()), /profile-pay-heading/)
  const html = render(profile({ canSeeCompensation: true }))
  assert.match(html, /profile-pay-heading/)
  assert.match(html, /Only HR and OA can see this section/)
  assert.match(html, /Show pay history/)
  assert.doesNotMatch(html, /Current basic salary/)
})

test('a LinkedIn value that is not a web address is never rendered as a link', () => {
  assert.doesNotMatch(render(profile({ linkedinUrl: 'javascript:alert(1)' })), /javascript:/)
  assert.match(render(profile({ linkedinUrl: 'https://www.linkedin.com/in/example' })), /href="https:\/\/www\.linkedin\.com\/in\/example"/)
})

const PAY: ProfileCompensation = {
  currency: 'PKR',
  currentBasic: 120000,
  currencies: ['PKR'],
  history: [
    { effectiveFrom: '2026-08-01T00:00:00.000Z', amount: 100000, currency: 'PKR', periodId: 'a', periodName: 'Aug' },
    { effectiveFrom: '2026-10-01T00:00:00.000Z', amount: 120000, currency: 'PKR', periodId: 'b', periodName: 'Oct' },
  ],
  changeEvents: [
    { effectiveFrom: '2026-10-01T00:00:00.000Z', previousAmount: 100000, amount: 120000, delta: 20000, percentChange: 20, currency: 'PKR', periodId: 'b', periodName: 'Oct' },
  ],
  growth: null,
}

test('pay history shows the current figure, the change and the trajectory', () => {
  const html = renderToStaticMarkup(createElement(PayHistory, { pay: PAY }))
  assert.match(html, /PKR 120,000/)
  assert.match(html, /PKR 100,000/)
  assert.match(html, /\+20\.0%/)
  assert.match(html, /first recorded/)
  assert.match(html, /Read-only/)
  assert.equal(formatMoney(1234567.4, 'USD'), 'USD 1,234,567')
})

test('no payroll yet reads as such', () => {
  const html = renderToStaticMarkup(
    createElement(PayHistory, { pay: { ...PAY, currency: null, currentBasic: null, currencies: [], history: [], changeEvents: [] } })
  )
  assert.match(html, /No finalized payroll for this person yet/)
})

test('the avatar is drawn, moves, and stops moving for reduced motion', () => {
  const html = renderToStaticMarkup(
    createElement(ProfileAvatarFigure, { look: resolveAvatarLook('p1', NO_AVATAR), name: 'Rhea Castillo' })
  )
  assert.match(html, /aria-label="Rhea Castillo&#x27;s office avatar"/)
  assert.match(html, /class="pa-upper"/)
  assert.match(html, /class="pa-eyes"/)
  assert.match(html, /prefers-reduced-motion: reduce/)
  assert.ok((html.match(/<rect /g)?.length ?? 0) > 20)
})

test('a person link opens their profile', () => {
  const html = renderToStaticMarkup(createElement(PersonLink, { personId: 'p 1', children: 'Rhea' }))
  assert.match(html, /href="\/people\/p%201"/)
  assert.match(html, />Rhea</)
})
