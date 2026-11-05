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
  'app/api/admin/onboarding/payout',
]
const PAYROLL_DIRS = ['app/api/payroll', 'lib/payroll']

const PAYROLL_IMPORT = /['"](?:@\/lib\/|(?:\.\.?\/)+(?:lib\/)?)payroll(?:\/[^'"]*)?['"]/
const PAYROLL_DATA = /\b(?:payroll[A-Z]\w*|isPayrollActive|PAYROLL_\w+)\b/
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

test('shared-reads.ts reads no person\u2019s pay or bank data, and selects only named columns', () => {
  const source = read(SHARED_READS)
  assert.equal(/\b(?:iban|branch|bankName|accountTitle|accountNumber|cnicNumber|salary\w*|payslip\w*)\b/i.test(source), false)
  const reads = source.match(/\.(?:findMany|findUnique|findFirst)\(/g) ?? []
  const selects = source.match(/\bselect: \{/g) ?? []
  assert.equal(reads.length > 0 && selects.length === reads.length, true)
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
  assert.ok(ACADEMY_IMPORT.test("from '@/lib/academy/service/fields'"))
})
