import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AcademyError } from '../lib/academy/errors'
import {
  acknowledgementFileName,
  acknowledgementPdf,
  acknowledgementPdfFields,
  acknowledgementsCsv,
  pdfSafeStatement,
  type AcknowledgementRow,
} from '../lib/academy/acknowledgement-export'
import { moduleCardState } from '../lib/academy/progress'
import { setupSchema } from '../lib/academy/setup'
import { quizScoreLabel, shapeForRole, trackerFiltersSchema, type TrackerRow } from '../lib/academy/tracker'
import { toModuleCard } from '../lib/academy/view'
import { acknowledgementKindLabel } from '../lib/academy/view-labels'

const ROW: TrackerRow = {
  newHireId: 'nh1',
  name: 'Cara Lindqvist',
  title: 'Analyst',
  department: 'Research',
  location: 'Karachi',
  joiningDate: '2026-12-01T00:00:00.000Z',
  status: 'ONBOARDING',
  modulesDone: 4,
  modulesTotal: 14,
  overdueCount: 2,
  quizScore: '10 of 12',
  checklistDone: 3,
  checklistTotal: 17,
  finishedAt: null,
  paymentStatus: { userId: 'u1', saved: true, method: 'WISE', lastChangedAt: '2026-12-02T00:00:00.000Z' },
}

const ACK: AcknowledgementRow = {
  id: 'a1',
  name: 'Cara Lindqvist',
  email: 'cara@example.test',
  kind: 'SECURITY_SOPS',
  statementText: 'I have read the security rules.',
  typedName: 'Cara Lindqvist',
  signedOn: '4 December 2026',
}

test('shapeForRole gives OA the five payment-list keys and nothing else', () => {
  const shaped = shapeForRole(ROW, 'OA')
  assert.deepEqual(Object.keys(shaped).sort(), ['department', 'joiningDate', 'name', 'newHireId', 'paymentStatus'])
  const text = JSON.stringify(shaped)
  for (const hidden of ['modulesDone', 'quizScore', '10 of 12', 'checklist', 'overdue', 'Karachi', 'Analyst', 'ONBOARDING']) {
    assert.equal(text.includes(hidden), false, hidden)
  }
})

test('shapeForRole gives HR the whole row and refuses everyone else', () => {
  assert.deepEqual(shapeForRole(ROW, 'HR'), ROW)
  for (const role of ['EMPLOYEE', 'SECURITY', 'EXECUTION', '']) {
    assert.throws(() => shapeForRole(ROW, role), (e: unknown) => e instanceof AcademyError && e.status === 403)
  }
})

test('quizScoreLabel', () => {
  assert.equal(quizScoreLabel({ score: 10, totalQuestions: 12 }), '10 of 12')
  assert.equal(quizScoreLabel(null), null)
})

test('filters: blanks are ignored, a bad status is refused', () => {
  const blank = trackerFiltersSchema.parse({ location: ' ', department: '', status: '' })
  assert.deepEqual([blank.location, blank.department, blank.status], [undefined, undefined, undefined])
  const set = trackerFiltersSchema.parse({ location: 'Karachi', status: 'PENDING' })
  assert.deepEqual([set.location, set.status], ['Karachi', 'PENDING'])
  assert.equal(trackerFiltersSchema.safeParse({ status: 'NOPE' }).success, false)
})

const LOCKED = { status: 'LOCKED' as const, startedAt: null, dueAt: null, completedAt: null }
const NOW = new Date('2026-12-01T00:00:00.000Z')
const MODULE = { slug: 's', title: 'T', phase: 'DAY_1' as const, estimatedMinutes: 5, icon: null }

test('an early-unlocked LOCKED row reads as AVAILABLE; a plain one stays LOCKED', () => {
  assert.equal(moduleCardState({ ...LOCKED, unlockedEarlyById: 'hr' }, NOW).status, 'AVAILABLE')
  assert.equal(moduleCardState({ ...LOCKED, unlockedEarlyById: null }, NOW).status, 'LOCKED')
  assert.equal(moduleCardState(LOCKED, NOW).status, 'LOCKED')
  assert.equal(toModuleCard(MODULE, 2, { ...LOCKED, unlockedEarlyById: 'hr' }, NOW).status, 'AVAILABLE')
  assert.equal(toModuleCard(MODULE, 2, LOCKED, NOW).status, 'LOCKED')
})

test('the security call is optional and saved like the other calls', () => {
  const base = { title: 'Analyst', onboardingDate: '2026-12-01', attributes: {} }
  assert.equal(setupSchema.parse({ ...base, securityCallAt: '' }).securityCallAt, null)
  assert.equal(setupSchema.parse(base).securityCallAt, null)
  assert.equal(setupSchema.parse({ ...base, securityCallAt: '2026-11-25T09:00:00.000Z' }).securityCallAt?.toISOString(), '2026-11-25T09:00:00.000Z')
  assert.equal(setupSchema.safeParse({ ...base, securityCallAt: 'nope' }).success, false)
})

test('CSV has the six columns, escapes quotes and defuses formulas', () => {
  const csv = acknowledgementsCsv([{ ...ACK, statementText: 'I said "yes", twice', typedName: '=SUM(1)' }])
  const [header, row] = csv.split('\r\n')
  assert.equal(header, 'Name,Email,Kind,Statement,Typed name,Signed date')
  assert.ok(row.includes('"I said ""yes"", twice"'), row)
  assert.ok(row.includes(",'=SUM(1),"), row)
  assert.ok(row.includes(',Security SOPs,'), row)
  for (const start of ['+1', '-1', '@x']) {
    assert.ok(acknowledgementsCsv([{ ...ACK, name: start }]).split('\r\n')[1].startsWith(`'${start},`), start)
  }
})

test('a CSV with no signatures is just the header', () => {
  assert.equal(acknowledgementsCsv([]), 'Name,Email,Kind,Statement,Typed name,Signed date')
})

test('the acknowledgement PDF is a PDF', async () => {
  const pdf = await acknowledgementPdf(ACK)
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
})

test('a long statement or a name the fonts cannot draw still gives a PDF', async () => {
  const pdf = await acknowledgementPdf({ ...ACK, name: '李小龙', typedName: '李小龙', statementText: 'Long words. '.repeat(2000) })
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
})

test('pdfSafeStatement never swaps the wording, it only replaces what cannot be drawn', () => {
  const statement = 'I’ll follow “the rules” — all of them.\nCafé.'
  assert.equal(pdfSafeStatement(statement), statement)
  assert.equal(pdfSafeStatement('Ação Łódź'), 'Ação Lódz')
  assert.equal(pdfSafeStatement('Sign 李 here'), 'Sign ? here')
})

test('pdfSafeStatement draws Unicode spaces as a space and Unicode hyphens as a hyphen', () => {
  assert.equal(pdfSafeStatement('a\u00A0b\u2003c\u202Fd\u3000e\u2028f'), 'a b c d e f')
  assert.equal(pdfSafeStatement('non\u2010breaking\u2011hyphen'), 'non-breaking-hyphen')
  assert.equal(pdfSafeStatement('line one\nline two'), 'line one\nline two')
})

test('the PDF prints only what the signer gave: no name is swapped for other words', () => {
  const fields = acknowledgementPdfFields({ ...ACK, name: 'Cara 李', typedName: '李小龙', statementText: 'Yes.' })
  assert.deepEqual(fields.map((f) => f.label), ['Acknowledgement', 'Name', 'Statement', 'Typed name', 'Signed date'])
  const value = (label: string) => fields.find((f) => f.label === label)?.value
  assert.equal(value('Name'), 'Cara ?')
  assert.equal(value('Typed name'), '???')
  assert.equal(JSON.stringify(fields).includes('team member'), false)
})

test('the PDF file name has the kind and the id, in ASCII', () => {
  assert.equal(acknowledgementFileName(ACK), 'academy-acknowledgement-security-sops-a1.pdf')
  assert.equal(
    acknowledgementFileName({ ...ACK, kind: 'VALUES_CODE_OF_CONDUCT', id: 'cm9"\r\nX-Bad: é1' }),
    'academy-acknowledgement-values-code-of-conduct-cm9XBad1.pdf',
  )
})

const route = (path: string) => readFileSync(join(__dirname, '..', 'app/api/admin/onboarding', path, 'route.ts'), 'utf8')

test('every drawer write is HR only and guarded', () => {
  for (const action of ['unlock', 'verify-linkedin', 'clear-quiz']) {
    const source = route(`tracker/[newHireId]/${action}`)
    assert.match(source, /export async function POST/)
    assert.ok(source.indexOf('requireAcademyHr()') < source.indexOf('guardAcademyMutation(request'), action)
    assert.match(source, /await guardAcademyMutation\(request, user\.id\)/, action)
  }
})

test('the drawer and the downloads are HR only', () => {
  for (const path of ['tracker/[newHireId]', 'tracker/[newHireId]/acknowledgements']) {
    assert.match(route(path), /await requireAcademyHr\(\)/, path)
  }
})

test('the list route gives OA the payment list only, and refuses anyone but HR after that', () => {
  const source = route('tracker')
  assert.match(source, /user\.role === 'OA'[\s\S]*loadPaymentTracker\(prisma, user\)/)
  assert.ok(source.indexOf("user.role !== 'HR'") < source.indexOf('loadTracker(prisma'))
})

test('a checklist tick is guarded and goes through the permission check', () => {
  const source = route('checklist/[itemId]')
  assert.match(source, /await guardAcademyMutation\(request, user\.id\)/)
  assert.match(source, /tickChecklistItem\(prisma, user, itemId, input\)/)
  assert.equal(source.includes('tickItem('), false)
})

test('the quiz reset is guarded', () => {
  const source = route('quiz-attempts/reset')
  assert.match(source, /await guardAcademyMutation\(request, user\.id\)/)
  assert.match(source, /error instanceof SameOriginError/)
})

test('every acknowledgement kind has a label', () => {
  assert.equal(acknowledgementKindLabel('SECURITY_SOPS'), 'Security SOPs')
  assert.equal(acknowledgementKindLabel('VALUES_CODE_OF_CONDUCT'), 'Values and code of conduct')
})
