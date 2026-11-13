import PDFDocument from 'pdfkit'
import type { AcknowledgementKind } from '@prisma/client'
import { toCsv } from '@/lib/security-checks/csv'
import { acknowledgementKindLabel } from './view-labels'

const DEEP_NAVY = '#2A2F40'
const SLATE = '#5B6275'
const FONT = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_NAME = 'Times-Italic'
const MARGIN = 64

const CSV_HEADER = ['Name', 'Email', 'Kind', 'Statement', 'Typed name', 'Signed date'] as const

/** One signature, ready to export: `signedOn` is already formatted for the hire. */
export interface AcknowledgementRow {
  id: string
  name: string
  email: string | null
  kind: AcknowledgementKind
  statementText: string
  typedName: string
  signedOn: string
}

export function acknowledgementsCsv(rows: readonly AcknowledgementRow[]): string {
  return toCsv(
    CSV_HEADER,
    rows.map((row) => [row.name, row.email, acknowledgementKindLabel(row.kind), row.statementText, row.typedName, row.signedOn]),
  )
}

/** Windows-1252 characters past Latin-1: PDFKit's built-in fonts draw these too. */
const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const DRAWABLE = /^[\n\x20-\x7E\xA0-\xFF]$/
const UNDRAWABLE = '?'
/** Common letters with no decomposition. */
const FOLDS: Readonly<Record<string, string>> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd', '\u2010': '-', '\u2011': '-' }

function drawableForm(char: string): string {
  if (char !== '\n' && /\s/.test(char)) return ' '
  if (DRAWABLE.test(char) || WIN_ANSI_EXTRAS.includes(char)) return char
  if (FOLDS[char]) return FOLDS[char]
  const folded = char.normalize('NFD').replace(/\p{M}/gu, '')
  return Array.from(folded).every((c) => DRAWABLE.test(c)) && folded ? folded : UNDRAWABLE
}

/**
 * What the signer gave, as near as the fonts allow. It never falls back to other words, as the
 * certificate's pdfSafeName does: a character that can't be drawn shows as "?", and the CSV keeps the exact text.
 */
export function pdfSafeStatement(statement: string): string {
  return Array.from(statement.normalize('NFC').replace(/\r\n?/g, '\n'), drawableForm).join('')
}

type Doc = PDFKit.PDFDocument

export interface PdfField { label: string; value: string; font: string }

/** Everything the PDF prints, in order. */
export function acknowledgementPdfFields(row: AcknowledgementRow): PdfField[] {
  return [
    { label: 'Acknowledgement', value: acknowledgementKindLabel(row.kind), font: FONT_BOLD },
    { label: 'Name', value: pdfSafeStatement(row.name), font: FONT_BOLD },
    { label: 'Statement', value: pdfSafeStatement(row.statementText), font: FONT },
    { label: 'Typed name', value: pdfSafeStatement(row.typedName), font: FONT_NAME },
    { label: 'Signed date', value: row.signedOn, font: FONT_BOLD },
  ]
}

function drawAcknowledgement(doc: Doc, row: AcknowledgementRow): void {
  doc.font(FONT_BOLD).fontSize(20).fillColor(DEEP_NAVY).text('Signed acknowledgement').moveDown(1.2)
  for (const { label, value, font } of acknowledgementPdfFields(row)) {
    doc.font(FONT).fontSize(10).fillColor(SLATE).text(label)
    doc.font(font).fontSize(13).fillColor(DEEP_NAVY).text(value).moveDown(0.9)
  }
}

/** ASCII only, so it is safe in a Content-Disposition header. */
export function acknowledgementFileName(row: Pick<AcknowledgementRow, 'id' | 'kind'>): string {
  const kind = row.kind.toLowerCase().replace(/_/g, '-')
  return `academy-acknowledgement-${kind}-${row.id.replace(/[^A-Za-z0-9]/g, '')}.pdf`
}

/** A4 portrait, with built-in fonts. A long statement runs onto further pages. */
export function acknowledgementPdf(row: AcknowledgementRow): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Signed acknowledgement' } })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      drawAcknowledgement(doc, row)
      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
