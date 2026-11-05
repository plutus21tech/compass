import PDFDocument from 'pdfkit'
import type { AcknowledgementKind } from '@prisma/client'
import { toCsv } from '@/lib/security-checks/csv'
import { pdfSafeName } from './certificate'
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
const FOLDS: Readonly<Record<string, string>> = { Ł: 'L', ł: 'l', Đ: 'D', đ: 'd' }

function drawableForm(char: string): string {
  if (DRAWABLE.test(char) || WIN_ANSI_EXTRAS.includes(char)) return char
  if (FOLDS[char]) return FOLDS[char]
  const folded = char.normalize('NFD').replace(/\p{M}/gu, '')
  return Array.from(folded).every((c) => DRAWABLE.test(c)) && folded ? folded : UNDRAWABLE
}

/**
 * The signed wording, as near as the fonts allow. Unlike pdfSafeName this never falls back to other
 * words: a character that can't be drawn shows as "?", and the CSV keeps the exact text.
 */
export function pdfSafeStatement(statement: string): string {
  return Array.from(statement.normalize('NFC').replace(/\r\n?/g, '\n'), drawableForm).join('')
}

type Doc = PDFKit.PDFDocument

function drawField(doc: Doc, label: string, value: string, font: string = FONT_BOLD): void {
  doc.font(FONT).fontSize(10).fillColor(SLATE).text(label)
  doc.font(font).fontSize(13).fillColor(DEEP_NAVY).text(value).moveDown(0.9)
}

function drawAcknowledgement(doc: Doc, row: AcknowledgementRow): void {
  doc.font(FONT_BOLD).fontSize(20).fillColor(DEEP_NAVY).text('Signed acknowledgement').moveDown(1.2)
  drawField(doc, 'Acknowledgement', acknowledgementKindLabel(row.kind))
  drawField(doc, 'Statement', pdfSafeStatement(row.statementText), FONT)
  drawField(doc, 'Typed name', pdfSafeName(row.typedName), FONT_NAME)
  drawField(doc, 'Signed date', row.signedOn)
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
