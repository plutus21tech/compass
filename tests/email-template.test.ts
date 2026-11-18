import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEmailSubject, BANNER_COLOURS, emailTextFromHtml, firstNameOf, renderCompassEmail, sentenceCase, TITLE_PLACEHOLDER,
} from '../lib/email-template'

/** Fictional people only. */
const FULL = {
  subject: 'Your leave is approved: Thu 19 – Fri 20 Nov',
  preview: 'Approved by Omar Example. You have 3 casual days left.',
  section: 'Time off',
  banner: { tone: 'success' as const, text: 'Approved by Omar Example' },
  name: 'Ana Torvik',
  paragraphs: ['Your casual leave is approved.'],
  details: [{ label: 'Type', value: 'Casual' }, { label: 'Dates', value: 'Thu 19 – Fri 20 Nov' }],
  quote: { label: 'Note from Omar Example', text: 'Enjoy the break.' },
  button: { label: 'View in Time off', url: 'https://compass.example/leave#my-requests' },
  after: 'Something wrong? Reply to this email.',
  reason: 'You got this because you asked for this leave.',
}

test('one template: header with the area, a card, one button and a footer that says why', () => {
  const html = renderCompassEmail(FULL)
  assert.match(html, /<title>Your leave is approved: Thu 19 – Fri 20 Nov<\/title>/)
  assert.match(html, />Compass<\/td>/)
  assert.match(html, />Time off<\/td>/)
  assert.match(html, /<h1[^>]*>Your leave is approved: Thu 19 – Fri 20 Nov<\/h1>/)
  assert.match(html, /Hi Ana,/)
  assert.doesNotMatch(html, /Hi Ana Torvik/)
  assert.match(html, />Type<\/div><div[^>]*>Casual<\/div>/)
  assert.match(html, /Note from Omar Example/)
  assert.equal(html.match(/<a href="https:\/\/compass\.example\/leave#my-requests"/g)?.length, 1)
  assert.match(html, /bgcolor="#1B76FF"/)
  assert.match(html, /You got this because you asked for this leave\./)
  assert.match(html, /Manage email settings/)
  assert.match(html, /Compass · Plutus21/)
  assert.match(html, /\/email\/compass-logo\.png"/)
  assert.match(html, /max-width:600px/)
})

test('only the banner is coloured, in the five agreed tones', () => {
  const html = renderCompassEmail(FULL)
  assert.match(html, /background:#DCFCE7[^>]*color:#15803D[^>]*>Approved by Omar Example/)
  assert.deepEqual(Object.keys(BANNER_COLOURS), ['success', 'danger', 'warning', 'info', 'neutral'])
  const plain = renderCompassEmail({ section: 'Projects', subject: 'x', paragraphs: ['y'] })
  for (const colour of Object.values(BANNER_COLOURS)) assert.ok(!plain.includes(colour.background))
})

test('the preview text is hidden, followed by the spacer, and falls back to the first paragraph', () => {
  const html = renderCompassEmail(FULL)
  assert.match(html, /display:none[^>]*>Approved by Omar Example\. You have 3 casual days left\.&#847;&zwnj;&nbsp;/)
  const fallback = renderCompassEmail({ section: 'Evaluations', subject: 's', paragraphsHtml: ['<strong>Two</strong> questions are due.'] })
  assert.match(fallback, /display:none[^>]*>Two questions are due\.&#847;/)
})

test('every text value is escaped; only the Html fields are used as written', () => {
  const html = renderCompassEmail({
    section: '<b>Area</b>',
    subject: '<script>alert(1)</script>',
    name: '<img src=x>',
    paragraphs: ['<i>one</i>'],
    paragraphsHtml: ['<em>two</em>'],
    details: [{ label: '<u>L</u>', value: '<u>V</u>' }, { label: 'Status', html: '<s>To do</s> → Done' }],
    quote: { label: '<q>', text: '<q>text</q>' },
    list: ['<li>x</li>'],
    button: { label: '<b>Go</b>', url: 'https://compass.example/?a=1&b="2"' },
    after: '<a>after</a>',
    reason: '<p>reason</p>',
  })
  assert.doesNotMatch(html, /<script>|<img src=x>|<i>one<\/i>|<u>|<q>|<b>Go<\/b>|<a>after|<p>reason/)
  assert.match(html, /<em>two<\/em>/)
  assert.match(html, /<s>To do<\/s> → Done/)
  assert.match(html, /href="https:\/\/compass\.example\/\?a=1&amp;b=&quot;2&quot;"/)
})

test('a greeting without a name, and names cut to the first name', () => {
  assert.match(renderCompassEmail({ section: 'Time off', subject: 's', name: null, paragraphs: ['p'] }), />Hi,<\/p>/)
  assert.equal(firstNameOf('  Ana  Torvik '), 'Ana')
  assert.equal(firstNameOf(''), null)
  assert.equal(firstNameOf(undefined), null)
})

test('statuses and leave types are in sentence case', () => {
  assert.equal(sentenceCase('CASUAL'), 'Casual')
  assert.equal(sentenceCase('IN_PROGRESS'), 'In progress')
  assert.equal(sentenceCase('Annual'), 'Annual')
})

test('an email built before its subject is known gets its title from the subject when sent', () => {
  const html = renderCompassEmail({ section: 'Evaluations', name: 'Ana Torvik', paragraphs: ['p'] })
  assert.ok(html.includes(TITLE_PLACEHOLDER))
  const sent = applyEmailSubject(html, 'Your <questions> for this week')
  assert.ok(!sent.includes(TITLE_PLACEHOLDER))
  assert.match(sent, /<h1[^>]*>Your &lt;questions&gt; for this week<\/h1>/)
  assert.match(sent, /<title>Your &lt;questions&gt; for this week<\/title>/)
  // An email that already has its title is left alone.
  const titled = renderCompassEmail(FULL)
  assert.equal(applyEmailSubject(titled, 'Other'), titled)
})

test('the plain-text version has the same words and every link written out', () => {
  const text = emailTextFromHtml(renderCompassEmail(FULL))
  for (const line of [
    'Compass', 'Time off', 'Approved by Omar Example', 'Your leave is approved: Thu 19 – Fri 20 Nov', 'Hi Ana,',
    'Your casual leave is approved.', 'Type', 'Casual', 'Enjoy the break.',
    'View in Time off (https://compass.example/leave#my-requests)', 'You got this because you asked for this leave.',
  ]) {
    assert.ok(text.includes(line), line)
  }
  assert.doesNotMatch(text, /<[a-z]|&nbsp;|&#847;|\n\n\n/)
  // The hidden preview is not repeated in the text.
  assert.equal(text.split('You have 3 casual days left').length, 1)
})
