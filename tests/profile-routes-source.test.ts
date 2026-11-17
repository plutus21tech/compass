import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canViewProfile } from '@/lib/people/profile'

const read = (path: string): string => readFileSync(path, 'utf8')
const PROFILE_ROUTE = read('app/api/people/[id]/route.ts')
const PAY_ROUTE = read('app/api/people/[id]/compensation/route.ts')
const DETAILS_ROUTE = read('app/api/people/me/details/route.ts')
const PROFILE_LIB = read('lib/people/profile.ts')
const PROFILE_RULES = read('lib/people/profile-rules.ts')

test('the profile itself never touches pay', () => {
  for (const source of [PROFILE_ROUTE, PROFILE_LIB, PROFILE_RULES]) {
    assert.doesNotMatch(source, /payrollReceipt|profile-compensation|salary/i)
  }
})

test('pay is refused to everyone but HR and OA before anything is loaded', () => {
  const check = PAY_ROUTE.indexOf('canManagePayroll(user.role)')
  assert.ok(check > 0)
  assert.match(PAY_ROUTE.slice(check, check + 120), /status: 403/)
  assert.ok(check < PAY_ROUTE.indexOf('loadPersonProfile('))
  assert.ok(check < PAY_ROUTE.indexOf('loadProfileCompensation('))
})

test('pay answers are never cached', () => {
  assert.match(PAY_ROUTE, /employee360Json/)
  assert.doesNotMatch(PAY_ROUTE, /NextResponse\.json/)
  assert.match(read('app/api/admin/analytics/employee-360/_http.ts'), /private, no-store/)
})

test('the pay loader only reads', () => {
  const source = read('lib/people/profile-compensation.ts')
  assert.doesNotMatch(source, /\.(create|update|upsert|delete)(Many)?\(/)
})

test('about-me answers are saved for the signed-in person only', () => {
  assert.match(DETAILS_ROUTE, /saveProfileDetails\(user\.id, parsed\.data\)/)
  assert.match(DETAILS_ROUTE, /profileDetailsSchema\.safeParse/)
})

test('who may open a profile', () => {
  const plutus = { id: 'p1', department: 'Product' }
  const threeE = { id: 'e1', department: ' 3E ' }
  const employee = (department: string | null) => ({ id: 'v1', role: 'EMPLOYEE', department })
  assert.equal(canViewProfile(employee('Design'), plutus), true)
  assert.equal(canViewProfile(employee(null), plutus), true)
  assert.equal(canViewProfile(employee('Design'), threeE), false)
  assert.equal(canViewProfile(employee('3E'), threeE), true)
  assert.equal(canViewProfile(employee('3E'), plutus), false)
  assert.equal(canViewProfile({ id: 'e1', role: 'EMPLOYEE', department: 'Design' }, threeE), true)
  assert.equal(canViewProfile({ id: 'h1', role: 'HR', department: 'Human Resources' }, threeE), true)
  assert.equal(canViewProfile({ id: 'o1', role: 'OA', department: 'Operations' }, threeE), true)
})
