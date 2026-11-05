import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCertificatePdf, pdfSafeName } from '../lib/academy/certificate'
import { certificateLogoBuffer } from '../lib/academy/certificate-assets'
import { formatCertificateDate } from '../lib/academy/view-labels'

const FALLBACK = 'Plutus21 team member'
const COMPLETED_ON = '4 December 2026'

const isSinglePagePdf = (pdf: Buffer): boolean =>
  pdf.subarray(0, 5).toString('latin1') === '%PDF-' && /\/Count 1\b/.test(pdf.toString('latin1'))

for (const name of ['Cara Lindqvist', 'Zoë Ñandú', 'زارا', '']) {
  test(`buildCertificatePdf gives a one-page PDF for ${JSON.stringify(name)}`, async () => {
    const pdf = await buildCertificatePdf({ name, completedOn: COMPLETED_ON })
    assert.ok(Buffer.isBuffer(pdf))
    assert.ok(isSinglePagePdf(pdf))
  })
}

test('a very long name still fits on one page', async () => {
  const pdf = await buildCertificatePdf({ name: 'Wolfeschlegelsteinhausenbergerdorff '.repeat(6), completedOn: COMPLETED_ON })
  assert.ok(isSinglePagePdf(pdf))
})

test('the page is A4 landscape', async () => {
  const pdf = await buildCertificatePdf({ name: 'Cara Lindqvist', completedOn: COMPLETED_ON })
  assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 841\.89 595\.28\]/)
})

test('pdfSafeName keeps Latin-1 and drops the rest', () => {
  assert.equal(pdfSafeName('Zoë'), 'Zoë')
  assert.equal(pdfSafeName('Zoë Ñandú'), 'Zoë Ñandú')
  assert.equal(pdfSafeName('Søren Ørsted'), 'Søren Ørsted')
})

test('pdfSafeName folds letters outside Latin-1 to their base letter', () => {
  assert.equal(pdfSafeName('Šimić'), 'Simic')
  assert.equal(pdfSafeName('Łukasz Dvořák'), 'Lukasz Dvorák')
  assert.equal(pdfSafeName('Nguyễn Văn'), 'Nguyen Van')
  assert.equal(pdfSafeName('Đorđe'), 'Dorde')
})

test('pdfSafeName keeps an apostrophe in either form', () => {
  assert.equal(pdfSafeName("O'Brien"), "O'Brien")
  assert.equal(pdfSafeName('O’Brien'), "O'Brien")
})

test('pdfSafeName never prints a fragment: a lost letter means the fallback', () => {
  assert.equal(pdfSafeName('Lind李qvist'), FALLBACK)
  assert.equal(pdfSafeName('زارا Khan'), FALLBACK)
  assert.equal(pdfSafeName('Cara 李 Lindqvist'), FALLBACK)
})

test('pdfSafeName drops what is not a letter without giving up the name', () => {
  assert.equal(pdfSafeName('Cara \u{1F600} Lindqvist'), 'Cara Lindqvist')
})

test('pdfSafeName composes accents that arrive as separate marks', () => {
  assert.equal(pdfSafeName('Zoë'), 'Zoë')
})

test('pdfSafeName removes control characters', () => {
  assert.equal(pdfSafeName('Cara\u0000\u0085 Lindqvist\n'), 'Cara Lindqvist')
})

test('pdfSafeName falls back when no letters are left', () => {
  assert.equal(pdfSafeName('زارا'), FALLBACK)
  assert.equal(pdfSafeName(''), FALLBACK)
  assert.equal(pdfSafeName('   '), FALLBACK)
  assert.equal(pdfSafeName('123 --'), FALLBACK)
})

test('the date reads like "4 December 2026"', () => {
  assert.equal(formatCertificateDate('2026-12-04T12:00:00.000Z', null), COMPLETED_ON)
})

test("the date is the day it was in the hire's own zone", () => {
  const lateUtc = '2026-12-04T20:00:00.000Z'
  assert.equal(formatCertificateDate(lateUtc, 'Asia/Karachi'), '5 December 2026')
  assert.equal(formatCertificateDate(lateUtc, null), COMPLETED_ON)
})

test('the logo asset is a JPEG and small', () => {
  const logo = certificateLogoBuffer()
  assert.equal(logo.subarray(0, 2).toString('hex'), 'ffd8')
  assert.ok(logo.length < 100 * 1024)
})
