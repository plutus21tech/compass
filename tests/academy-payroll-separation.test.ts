import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const ROOT = join(__dirname, '..')
const SOURCE = /\.tsx?$/
const SHARED_READS = 'lib/academy/service/shared-reads.ts'

const ACADEMY_DIRS = [
  'lib/academy',
  'components/academy',
  'app/api/onboarding/academy',
  'app/api/onboarding/payout',
  'app/api/onboarding/new-hires',
  'app/api/admin/onboarding',
  'app/(hr)/admin/onboarding',
  'app/(evaluator)/onboarding',
  'app/(oa)/oa/payment-details',
  'app/api/cron/onboarding',
]
const PAYROLL_DIRS = ['app/api/payroll', 'lib/payroll']

const PAYROLL_IMPORT = /['"](?:@\/lib\/|(?:\.\.?\/)+(?:lib\/)?)payroll(?:\/[^'"]*)?['"]/i
// Any identifier built on "payroll", in any case. The plain English word, as in a comment, is fine.
const PAYROLL_DATA = /payroll\w/i

const ALLOWED_MODELS = ['payrollEmployeeProfile', 'payrollPublicHoliday', 'payrollTravelAllowanceTier']
const ALLOWED_COLUMNS = ['holidayDate', 'isPayrollActive', 'maxKm', 'minKm', 'monthlyRate', 'transportMode']
const ACADEMY_IMPORT = /['"](?:@\/lib\/|(?:\.\.?\/)+(?:lib\/)?)academy(?:\/[^'"]*)?['"]/

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(join(ROOT, path)).isDirectory()) return sourceFiles(path)
    return SOURCE.test(name) ? [path] : []
  })
}

const posix = (path: string): string => path.split(sep).join('/')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')
const seedFiles = (): string[] =>
  readdirSync(join(ROOT, 'prisma')).filter((name) => /^seed-academy.*\.ts$/.test(name)).map((name) => `prisma/${name}`)

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort()

const modelsUsed = (source: string): string[] => sorted([...source.matchAll(/\bdb\.([$\w]+)/g)].map((match) => match[1]))

/** Every key of every select. A nested select or a value other than true shows up as a key that isn't allowed. */
function columnsSelected(source: string): string[] {
  const bodies = [...source.matchAll(/\bselect: \{([^}]*)\}/g)].map((match) => match[1])
  return sorted(bodies.flatMap((body) => body.split(',').map((entry) => entry.trim()).filter(Boolean)).map((entry) => {
    const column = /^(\w+): true$/.exec(entry)
    return column ? column[1] : entry
  }))
}

const academyFiles = (): string[] => [...ACADEMY_DIRS.flatMap(sourceFiles), ...seedFiles()].map(posix)

test('no onboarding code imports payroll or reads payroll data, apart from shared-reads.ts', () => {
  const offenders = academyFiles()
    .filter((path) => path !== SHARED_READS)
    .filter((path) => PAYROLL_IMPORT.test(read(path)) || PAYROLL_DATA.test(read(path)))
  assert.deepEqual(offenders, [])
})

test('shared-reads.ts imports nothing from payroll and writes nothing', () => {
  const source = read(SHARED_READS)
  assert.equal(PAYROLL_IMPORT.test(source), false)
  assert.equal(/\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(source), false)
})

test('shared-reads.ts touches exactly the three allowed models', () => {
  assert.deepEqual(modelsUsed(read(SHARED_READS)), ALLOWED_MODELS)
})

test('shared-reads.ts selects only the allowed columns, on every read', () => {
  const source = read(SHARED_READS)
  assert.deepEqual(columnsSelected(source), ALLOWED_COLUMNS)
  const reads = source.match(/\.(?:findMany|findUnique|findFirst)\(/g) ?? []
  const selects = source.match(/\bselect: \{/g) ?? []
  assert.equal(selects.length, reads.length)
})

test('shared-reads.ts runs no raw SQL', () => {
  assert.equal(/\$(?:query|execute)Raw/.test(read(SHARED_READS)), false)
})

test('no payroll code imports the Academy', () => {
  const offenders = PAYROLL_DIRS.flatMap(sourceFiles).filter((path) => ACADEMY_IMPORT.test(read(path)))
  assert.deepEqual(offenders.map(posix), [])
})

test('the guard patterns catch what they are for', () => {
  assert.ok(PAYROLL_IMPORT.test("from '@/lib/payroll/sensitive-fields'"))
  assert.ok(PAYROLL_IMPORT.test("from '../../payroll/sensitive-fields'"))
  assert.ok(PAYROLL_DATA.test('db.payrollEmployeeProfile.findUnique'))
  assert.ok(PAYROLL_DATA.test('select: { payrollProfile: { select: { iban: true } } }'))
  assert.ok(PAYROLL_DATA.test('FROM "PayrollEmployeeProfile"'))
  assert.ok(PAYROLL_DATA.test("import type { PayrollEmployeeProfile } from '@prisma/client'"))
  assert.ok(PAYROLL_DATA.test('PAYROLL_FIELD_ENCRYPTION_KEY'))
  assert.equal(PAYROLL_DATA.test('OA enters them into payroll by hand.'), false)
  assert.ok(ACADEMY_IMPORT.test("from '@/lib/academy/service/fields'"))
})
