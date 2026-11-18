// The one template every Compass email is built on (design handoff of 13 Nov 2026):
// a logo header, one white card, at most one button, and a footer that says why you got it.
// Tables and inline styles only, so it holds up in Gmail, Outlook and Apple Mail.
import { compassUrl } from '@/lib/compass-url'
import { escapeHtml } from '@/lib/sanitize'

export type BannerTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral'

/** Only the banner is coloured; everything else stays grey on white with one blue button. */
export const BANNER_COLOURS: Record<BannerTone, { background: string; text: string }> = {
  success: { background: '#DCFCE7', text: '#15803D' },
  danger: { background: '#FEE2E2', text: '#DC2626' },
  warning: { background: '#FEF3C7', text: '#B45309' },
  info: { background: '#EDFAFD', text: '#0E7490' },
  neutral: { background: '#EEF0F3', text: '#525D76' },
}

const FONT = "'Figtree',Arial,Helvetica,sans-serif"
const INK = '#2A2F40'
const BODY = '#525D76'
const SMALL = '#6B7590'
const BUTTON = '#1B76FF'
const DEFAULT_REASON = 'You got this because you use Compass at Plutus21.'

/** Stands in for the title until the subject is known; see applyEmailSubject. */
export const TITLE_PLACEHOLDER = '<!--compass-email-title-->'

/** One row of the details card: a small label above its value. `html` is used as written, so escape what goes in it. */
export type EmailDetail = { label: string; value: string } | { label: string; html: string }

export interface CompassEmail {
  /** The inbox subject, also the title unless `title` says otherwise. Leave out to fill it in at send time. */
  subject?: string
  title?: string
  /** The line inbox apps show after the subject; never put scores or other sensitive detail here. */
  preview?: string
  /** The area shown top right: Time off, Evaluations, Projects, Help & IT, Onboarding. */
  section: string
  banner?: { tone: BannerTone; text: string; detail?: string }
  /** The recipient's name; the greeting uses the first name only. Null when it goes to several people. */
  name?: string | null
  /** Plain-text paragraphs; escaped here. */
  paragraphs?: readonly string[]
  /** Paragraphs that are already safe HTML (the caller escaped every value in them). */
  paragraphsHtml?: readonly string[]
  details?: readonly EmailDetail[]
  /** A note, comment or reason from a person. */
  quote?: { label: string; text: string }
  list?: readonly string[]
  /** One bespoke block (a table, a score), already safe HTML. */
  blockHtml?: string
  button?: { label: string; url: string }
  /** One small grey sentence: what to do if something is wrong. */
  after?: string
  afterHtml?: string
  /** Why this person got the email. */
  reason?: string
  /** Security emails never carry a link, so that a real one can be told from phishing: drops the footer link too. */
  noLinks?: boolean
}

/** "Ana" from "Ana Torvik"; null when there is no name to greet. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  return first ? first : null
}

/** "Casual" from "CASUAL", "In progress" from "IN_PROGRESS": statuses and leave types are never shouted. */
export function sentenceCase(value: string): string {
  const words = value.trim().replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Keeps Gmail from running the preview on into the header text.
const PREVIEW_SPACER = '&#847;&zwnj;&nbsp;'.repeat(100)

const p = (html: string, top: number, size = 15, colour = BODY): string =>
  `<p style="margin:${top}px 0 0;font-family:${FONT};font-size:${size}px;line-height:1.6;color:${colour};font-weight:400;">${html}</p>`

/** Lists and tables cannot sit inside a paragraph, so those get a plain block. */
function paragraph(html: string, top: number): string {
  if (!/^\s*<(ul|ol|table|div)\b/i.test(html)) return p(html, top)
  return `<div style="margin:${top}px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${html}</div>`
}

function bannerHtml(banner: NonNullable<CompassEmail['banner']>): string {
  const colour = BANNER_COLOURS[banner.tone]
  const detail = banner.detail ? `<div style="font-weight:400;margin-top:2px;">${escapeHtml(banner.detail)}</div>` : ''
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>' +
    `<td style="background:${colour.background};border-radius:8px;padding:10px 14px;font-family:${FONT};font-size:14px;line-height:1.5;color:${colour.text};font-weight:600;">` +
    `${escapeHtml(banner.text)}${detail}</td></tr></table>`
  )
}

function detailsHtml(details: readonly EmailDetail[]): string {
  const rows = details
    .map((detail, index) => {
      const value = 'html' in detail ? detail.html : escapeHtml(detail.value)
      const border = index === 0 ? '' : 'border-top:1px solid #EEF0F3;'
      return (
        `<tr><td style="${border}padding:10px 16px;font-family:${FONT};">` +
        `<div style="font-size:12px;line-height:1.5;color:${SMALL};">${escapeHtml(detail.label)}</div>` +
        `<div style="font-size:14px;line-height:1.5;color:${INK};font-weight:600;margin-top:1px;">${value}</div></td></tr>`
      )
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;background:#F8F9FB;border:1px solid #EEF0F3;border-radius:8px;">${rows}</table>`
}

function quoteHtml(quote: NonNullable<CompassEmail['quote']>): string {
  return (
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;"><tr>' +
    `<td style="border-left:3px solid #E4E6EB;padding:2px 0 2px 14px;font-family:${FONT};">` +
    `<div style="font-size:12px;line-height:1.5;color:${SMALL};font-weight:600;">${escapeHtml(quote.label)}</div>` +
    `<div style="font-size:15px;line-height:1.6;color:${INK};margin-top:2px;white-space:pre-wrap;">${escapeHtml(quote.text)}</div></td></tr></table>`
  )
}

function listHtml(items: readonly string[]): string {
  const rows = items.map((item) => `<li style="margin:4px 0 0;">${escapeHtml(item)}</li>`).join('')
  return `<ul style="margin:16px 0 0;padding:0 0 0 20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${rows}</ul>`
}

function buttonHtml(button: NonNullable<CompassEmail['button']>): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;"><tr><td bgcolor="${BUTTON}" style="border-radius:8px;">` +
    `<a href="${escapeHtml(button.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(button.label)}</a>` +
    '</td></tr></table>'
  )
}

/** The text of a block of HTML, on one line: used for the preview when none is given. */
function plainLine(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function previewOf(email: CompassEmail): string {
  if (email.preview) return email.preview
  const first = email.paragraphs?.[0] ?? (email.paragraphsHtml?.[0] ? plainLine(email.paragraphsHtml[0]) : '')
  return first.length > 90 ? `${first.slice(0, 87)}…` : first
}

/** The full HTML of one email. Every text value is escaped here; only the `*Html` fields are used as written. */
export function renderCompassEmail(email: CompassEmail): string {
  const title = email.title ?? email.subject
  const first = firstNameOf(email.name)
  const paragraphs = [...(email.paragraphs ?? []).map(escapeHtml), ...(email.paragraphsHtml ?? [])]
  const after = email.afterHtml ?? (email.after ? escapeHtml(email.after) : '')

  const card = [
    email.banner ? bannerHtml(email.banner) : '',
    title === undefined
      ? TITLE_PLACEHOLDER
      : `<h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};letter-spacing:-0.3px;">${escapeHtml(title)}</h1>`,
    p(first ? `Hi ${escapeHtml(first)},` : 'Hi,', 16),
    ...paragraphs.map((html, index) => paragraph(html, index === 0 ? 8 : 12)),
    email.details && email.details.length > 0 ? detailsHtml(email.details) : '',
    email.quote ? quoteHtml(email.quote) : '',
    email.list && email.list.length > 0 ? listHtml(email.list) : '',
    email.blockHtml ? `<div style="margin:20px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${INK};">${email.blockHtml}</div>` : '',
    email.button ? buttonHtml(email.button) : '',
    after ? p(after, 16, 13, SMALL) : '',
  ].join('')

  return (
    '<!DOCTYPE html><html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="x-apple-disable-message-reformatting">' +
    `<meta name="color-scheme" content="light only"><title>${escapeHtml(email.subject ?? title ?? 'Compass')}</title>` +
    '<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&display=swap" rel="stylesheet">' +
    '<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]--></head>' +
    '<body style="margin:0;padding:0;background:#F4F5F7;">' +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(previewOf(email))}${PREVIEW_SPACER}</div>` +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F5F7" style="background:#F4F5F7;">' +
    '<tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">' +
    '<tr><td style="padding:0 4px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    `<td valign="middle" width="24"><img src="${compassUrl('/email/compass-logo.png')}" width="16" height="25" alt="Compass" style="display:block;border:0;"></td>` +
    `<td valign="middle" style="padding-left:8px;font-family:${FONT};font-size:16px;font-weight:700;color:${INK};">Compass</td>` +
    `<td valign="middle" align="right" style="font-family:${FONT};font-size:13px;color:${SMALL};">${escapeHtml(email.section)}</td>` +
    '</tr></table></td></tr>' +
    `<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E4E6EB;border-radius:12px;padding:28px 24px;">${card}</td></tr>` +
    `<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${SMALL};">` +
    `${escapeHtml(email.reason ?? DEFAULT_REASON)}` +
    (email.noLinks ? '<br>' : ` <a href="${compassUrl('/profile')}" style="color:${SMALL};text-decoration:underline;">Manage email settings</a><br>`) +
    'Compass · Plutus21</td></tr></table></td></tr></table></body></html>'
  )
}

/**
 * Emails built before their subject is known carry a placeholder where the title goes.
 * Sending fills it with the subject, so the title and the inbox subject always agree.
 */
export function applyEmailSubject(html: string, subject: string): string {
  if (!html.includes(TITLE_PLACEHOLDER)) return html
  const title = `<h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${INK};letter-spacing:-0.3px;">${escapeHtml(subject)}</h1>`
  return html.replace(TITLE_PLACEHOLDER, title).replace('<title>Compass</title>', `<title>${escapeHtml(subject)}</title>`)
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&zwnj;': '', '&#847;': '' }

/** The plain-text version sent alongside the HTML: the same words, with each link's address written out. */
export function emailTextFromHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/i, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, label: string) => `${label} (${href})`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h1|h2|h3|tr|table|ul|ol)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, lines) => line !== '' || (index > 0 && lines[index - 1] !== ''))
    .join('\n')
    .trim()
}
