import PDFDocument from 'pdfkit'
import { certificateLogoBuffer } from './certificate-assets'

const PLUTUS_BLUE = '#3463EC'
const DEEP_NAVY = '#2A2F40'
/** Matches the logo's own background, which would otherwise show as a box. */
const PAPER = '#FCFCFC'

const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_NAME = 'Times-Italic'

const PAGE_WIDTH = 841.89
const PAGE_HEIGHT = 595.28
const FRAME_INSET = 24
const FRAME_WIDTH = 2
const LOGO_SIZE = 84
const LOGO_TOP = 107
const TITLE_TOP = 211
const LEAD_IN_TOP = 277
const NAME_BASELINE_TOP = 313
const NAME_MAX_SIZE = 46
const NAME_MAX_WIDTH = 640
const RULE_TOP = 375
const RULE_WIDTH = 360
const COURSE_TOP = 395
const DATE_TOP = 441

const FALLBACK_NAME = 'Plutus21 team member'
const DATE_LOCALE = 'en-GB'
const DEFAULT_TIME_ZONE = 'UTC'

type Doc = PDFKit.PDFDocument

export interface CertificateInput {
  name: string
  completedOn: string
}

/**
 * PDFKit's built-in fonts draw Latin-1 only, so anything else is removed. A name with no letters
 * left falls back to a generic one, so a PDF always results.
 */
export function pdfSafeName(name: string): string {
  const safe = name
    .normalize('NFC')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /\p{L}/u.test(safe) ? safe : FALLBACK_NAME
}

/** "4 December 2026", on the day it was for the hire. An unknown zone prints UTC. */
export function formatCertificateDate(iso: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
  }).format(new Date(iso))
}

/** One centred line. No line breaking, so nothing can spill onto a second page. */
function drawCentred(doc: Doc, text: string, top: number, font: string, size: number, color: string): void {
  doc.font(font).fontSize(size).fillColor(color)
  doc.text(text, (PAGE_WIDTH - doc.widthOfString(text)) / 2, top, { lineBreak: false })
}

/** The largest size, up to the maximum, at which the name fits on one line. */
function nameFontSize(doc: Doc, name: string): number {
  const width = doc.font(FONT_NAME).fontSize(NAME_MAX_SIZE).widthOfString(name)
  return width > NAME_MAX_WIDTH ? (NAME_MAX_SIZE * NAME_MAX_WIDTH) / width : NAME_MAX_SIZE
}

function drawCertificate(doc: Doc, { name, completedOn }: CertificateInput): void {
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(PAPER)
  doc
    .rect(FRAME_INSET, FRAME_INSET, PAGE_WIDTH - FRAME_INSET * 2, PAGE_HEIGHT - FRAME_INSET * 2)
    .lineWidth(FRAME_WIDTH)
    .strokeColor(PLUTUS_BLUE)
    .stroke()
  doc.image(certificateLogoBuffer(), (PAGE_WIDTH - LOGO_SIZE) / 2, LOGO_TOP, { width: LOGO_SIZE, height: LOGO_SIZE })

  drawCentred(doc, 'Certificate of Completion', TITLE_TOP, FONT_BOLD, 34, DEEP_NAVY)
  drawCentred(doc, 'This certifies that', LEAD_IN_TOP, FONT, 15, DEEP_NAVY)

  const safeName = pdfSafeName(name)
  const size = nameFontSize(doc, safeName)
  // Smaller names sit lower in the line, so they stay on the rule under them.
  drawCentred(doc, safeName, NAME_BASELINE_TOP + (NAME_MAX_SIZE - size) * 0.8, FONT_NAME, size, PLUTUS_BLUE)
  doc
    .moveTo((PAGE_WIDTH - RULE_WIDTH) / 2, RULE_TOP)
    .lineTo((PAGE_WIDTH + RULE_WIDTH) / 2, RULE_TOP)
    .lineWidth(0.75)
    .strokeColor(DEEP_NAVY)
    .stroke()

  drawCentred(doc, 'has completed the Plutus21 Onboarding Academy', COURSE_TOP, FONT, 17, DEEP_NAVY)
  drawCentred(doc, completedOn, DATE_TOP, FONT_BOLD, 14, DEEP_NAVY)
}

/** A4 landscape, with built-in fonts: the date comes already formatted for the hire. */
export function buildCertificatePdf(input: CertificateInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: 'Certificate of Completion' } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      drawCertificate(doc, input)
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
