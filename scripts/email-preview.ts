// Writes one HTML page showing sample Compass emails side by side, for checking the template by eye.
// Fictional people only. Sends nothing and reads no database.
//
//   npx tsx scripts/email-preview.ts <output.html>
import { readFileSync, writeFileSync } from 'node:fs'
import { compassUrl } from '../lib/compass-url'
import { applyEmailSubject, renderCompassEmail, type CompassEmail } from '../lib/email-template'
import { escapeHtml } from '../lib/sanitize'
import { renderMappingEmail, renderQuestionsEmail, renderSelfReviewSubmittedEmail } from '../lib/weekly/emails'
import { renderDueTodayEmail, renderHrReminderEmail, renderRoundOpenedEmail } from '../lib/weekly/emails-round'

const APP = 'https://compass.example'
const leave = [
  { label: 'Type', value: 'Casual' },
  { label: 'Dates', value: 'Thu 19 – Fri 20 Nov' },
  { label: 'Working days', value: '2 days' },
  { label: 'Back on', value: 'Mon 23 Nov' },
]

const SAMPLES: Array<{ name: string; email: CompassEmail }> = [
  {
    name: 'EM-1 Leave request',
    email: {
      subject: 'Leave request from Yusra Example: Thu 19 – Fri 20 Nov',
      preview: '2 days of casual leave. Review it in Compass.',
      section: 'Time off',
      banner: { tone: 'warning', text: 'No handover yet. A reminder goes out before the leave starts.' },
      name: null,
      paragraphs: ['Yusra Example asked for 2 days of casual leave.'],
      details: [...leave, { label: 'Covering', value: 'Omar Example' }, { label: 'Reason', value: 'Family event' }],
      button: { label: 'Review request', url: `${APP}/leave?requestId=r1` },
      after: 'If you need to sign in, Compass takes you back to this request afterwards.',
      reason: 'You got this because you approve, cover or were added to this leave request.',
    },
  },
  {
    name: 'EM-2 Approved',
    email: {
      subject: 'Your leave is approved: Thu 19 – Fri 20 Nov',
      preview: 'Approved by Omar Example. Casual balance: 3 days left of 10.',
      section: 'Time off',
      banner: { tone: 'success', text: 'Approved by Omar Example' },
      name: 'Yusra Example',
      paragraphs: ['Your casual leave is approved, and it is on the team calendar.'],
      details: [...leave, { label: 'Casual balance', value: '3 days left of 10' }],
      button: { label: 'View in Time off', url: `${APP}/leave#my-requests` },
      reason: 'You got this because you asked for this leave.',
    },
  },
  {
    name: 'EM-3 Not approved',
    email: {
      subject: 'Your leave request wasn’t approved',
      preview: 'Omar Example reviewed it. Your balance hasn’t changed.',
      section: 'Time off',
      banner: { tone: 'danger', text: 'Not approved by Omar Example' },
      name: 'Yusra Example',
      paragraphs: ['Your casual leave request for Thu 19 – Fri 20 Nov was not approved. Your balance hasn’t changed.'],
      details: leave,
      quote: { label: 'Note from Omar Example', text: 'We have a client launch that week. Could you move it to the week after?' },
      button: { label: 'Pick new dates', url: `${APP}/leave?request=1` },
      after: 'If you have questions about this decision, talk to your lead or HR.',
      reason: 'You got this because you asked for this leave.',
    },
  },
  {
    name: 'EM-4 Cancelled',
    email: {
      subject: 'Leave cancelled: Yusra Example, Thu 19 – Fri 20 Nov',
      preview: 'No action needed. The days are back in Yusra Example’s balance.',
      section: 'Time off',
      banner: { tone: 'neutral', text: 'Cancelled by Yusra Example' },
      name: null,
      paragraphs: ['Yusra Example’s casual leave is cancelled. The days are back in the balance and it is off the calendar.'],
      details: leave.slice(0, 3),
      button: { label: 'View team calendar', url: `${APP}/leave` },
      after: 'Contact HR with any questions.',
      reason: 'You got this because you asked for, approve or cover this leave.',
    },
  },
  {
    name: 'EM-6 Public holiday',
    email: {
      subject: 'Public holiday for the Pakistan Team: Quaid-e-Azam Day, Fri 25 Dec',
      preview: 'The Pakistan Team is off. Plan deadlines and handovers around this date.',
      section: 'Time off',
      banner: { tone: 'info', text: 'Public holiday · Pakistan Team' },
      name: null,
      paragraphs: ['A new public holiday has been added to the calendar for the Pakistan Team. It won’t count as leave.'],
      details: [{ label: 'Friday, December 25, 2026', value: 'Quaid-e-Azam Day' }],
      button: { label: 'See the calendar', url: `${APP}/leave` },
      after: 'A calendar invite has been sent separately. Please plan any deadlines or handovers around these dates.',
      reason: 'You got this because you are on the Pakistan Team.',
    },
  },
  {
    name: 'EM-15 Ticket resolved',
    email: {
      subject: 'Ticket resolved: Laptop battery drains in an hour',
      preview: 'Sam Example fixed it. Open a new ticket if the problem comes back.',
      section: 'Help & IT',
      banner: { tone: 'success', text: 'Resolved by Sam Example' },
      name: null,
      paragraphs: ['Yusra Example’s device support ticket is now resolved.'],
      details: [
        { label: 'Ticket', value: 'Laptop battery drains in an hour' },
        { label: 'Device', value: 'Laptop' },
        { label: 'Priority', value: 'High' },
        { label: 'Status', value: 'Resolved' },
      ],
      quote: { label: 'What IT did', text: 'Replaced the battery and updated the firmware.' },
      button: { label: 'View ticket', url: `${APP}/device-support` },
      after: 'If the problem comes back, open a new ticket in Help & IT.',
      reason: 'You got this because you raised or handle this ticket.',
    },
  },
  {
    name: 'Onboarding notice',
    email: {
      subject: 'Role expectations needed for Noor Example',
      section: 'Onboarding',
      name: null,
      paragraphs: ['Please describe what you expect from Noor Example’s role and set their goals for day 1, week 1, month 1 and month 3.'],
      details: [{ label: 'New hire', value: 'Noor Example' }, { label: 'Title', value: 'Analyst' }, { label: 'Joining', value: 'Mon 30 Nov' }],
      button: { label: 'Add role expectations', url: `${APP}/team-lead-form/h1` },
      reason: 'You got this because you help run onboarding at Plutus21.',
    },
  },
  {
    name: 'Project task',
    email: {
      subject: 'Compass task: Draft the Q4 client report',
      section: 'Projects',
      name: 'Yusra Example',
      blockHtml: '<p>Omar Example assigned you to <strong>Draft the Q4 client report</strong>.</p><p><strong>Project:</strong> Client reporting</p>',
      button: { label: 'Open task project', url: `${APP}/projects/p1` },
      reason: 'You got this because you are on this project.',
    },
  },
  {
    name: 'Security check (no links)',
    email: {
      subject: 'You have a task in Compass',
      section: 'Help & IT',
      name: null,
      paragraphs: ['You have a task in Compass.', 'Sign in to Compass the way you normally do to see it.'],
      after: 'This message never contains links, codes or attachments. If an email claiming to be from Compass asks you to click a link or share a code, report it to the Security team.',
      reason: 'You got this because you have security checks in Compass.',
      noLinks: true,
    },
  },
]

const evaluations = [
  { name: 'EM-7 Round open', ...renderRoundOpenedEmail({ name: 'Yusra Example', periodName: 'Q4 2026', questionWeeks: 8, closesOn: 'Sun 3 Jan 2027', firstDueOn: 'Fri 30 Oct', appUrl: APP }) },
  { name: 'EM-8 Check your list', ...renderMappingEmail({ name: 'Yusra Example', periodName: 'Q4 2026', leads: ['Omar Example'], reports: [], peers: ['Noor Example', 'Sam Example'], deadline: 'Fri 23 Oct', appUrl: APP }) },
  { name: 'EM-9 Weekly questions', ...renderQuestionsEmail({ name: 'Yusra Example', newCount: 3, openCount: 3, appUrl: APP }) },
  { name: 'EM-10 Due today', ...renderDueTodayEmail({ name: 'Yusra Example', openCount: 2, appUrl: APP }) },
  { name: 'HR reminder, overdue', ...renderHrReminderEmail({ name: 'Yusra Example', openCount: 5, overdueCount: 3, appUrl: APP }) },
  { name: 'EM-11 Self-evaluation to lead', ...renderSelfReviewSubmittedEmail({ name: 'Omar Example', personName: 'Yusra Example', monthName: 'October', appUrl: APP }) },
]

const logo = `data:image/png;base64,${readFileSync('public/email/compass-logo.png').toString('base64')}`
// The logo is only on the live site after a deploy, so the preview carries it inline.
const withLogo = (html: string): string => html.split(compassUrl('/email/compass-logo.png')).join(logo)

const frames = [
  ...SAMPLES.map(({ name, email }) => ({ name, subject: email.subject ?? '', html: renderCompassEmail(email) })),
  ...evaluations.map(({ name, subject, html }) => ({ name, subject, html: applyEmailSubject(html, subject) })),
]

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Compass email preview</title>
<style>
  body { margin: 0; padding: 24px; font-family: system-ui, sans-serif; background: #e9ebef; color: #2a2f40; }
  h1 { font-size: 20px; } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(640px, 1fr)); gap: 24px; }
  figure { margin: 0; } figcaption { margin-bottom: 8px; font-size: 13px; } figcaption b { display: block; font-size: 14px; }
  iframe { width: 100%; height: 760px; border: 1px solid #d5d8de; border-radius: 8px; background: #fff; }
</style></head><body>
<h1>Compass email preview (${frames.length} samples, fictional data)</h1>
<div class="grid">
${frames
  .map(
    (f) => `<figure><figcaption><b>${escapeHtml(f.name)}</b>Subject: ${escapeHtml(f.subject)}</figcaption><iframe title="${escapeHtml(f.name)}" srcdoc="${escapeHtml(withLogo(f.html))}"></iframe></figure>`
  )
  .join('\n')}
</div></body></html>`

const out = process.argv[2]
if (!out) throw new Error('Usage: npx tsx scripts/email-preview.ts <output.html>')
writeFileSync(out, page)
process.stdout.write(`Wrote ${frames.length} emails to ${out}\n`)
