import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summariseOutToday, type OutRow } from '../lib/home/out-today'

const row = (over: Partial<OutRow> & { employeeId: string }): OutRow => ({
  name: over.employeeId,
  department: 'Design',
  leaveType: 'CASUAL',
  isHalfDay: false,
  halfDaySession: null,
  status: 'APPROVED',
  ...over,
})

test('each person counts once; a full day beats a half day', () => {
  const { people } = summariseOutToday(
    [
      row({ employeeId: 'hom-pia', isHalfDay: true, halfDaySession: 'FIRST_HALF' }),
      row({ employeeId: 'hom-pia' }),
    ],
    { id: 'v', department: 'Design' }
  )
  assert.equal(people.length, 1)
  assert.equal(people[0].isHalfDay, false)
})

test('department count leaves the viewer out and ignores case', () => {
  const result = summariseOutToday(
    [
      row({ employeeId: 'v', department: 'Design' }),
      row({ employeeId: 'a', department: ' design ' }),
      row({ employeeId: 'b', department: 'Ops' }),
    ],
    { id: 'v', department: 'Design' }
  )
  assert.equal(result.departmentOutToday, 1)
})

test('no department, no department count', () => {
  const result = summariseOutToday([row({ employeeId: 'a' })], { id: 'v', department: null })
  assert.equal(result.departmentOutToday, null)
})

test('people are sorted by name', () => {
  const { people } = summariseOutToday(
    [row({ employeeId: 'b', name: 'Zed' }), row({ employeeId: 'a', name: 'Amy' })],
    { id: 'v', department: null }
  )
  assert.deepEqual(people.map((p) => p.name), ['Amy', 'Zed'])
})

test('the route is wired to session, rate limit and loader, and never touches reason', () => {
  const source = readFileSync('app/api/home/overview/route.ts', 'utf8')
  assert.match(source, /getSession\(/)
  assert.match(source, /checkRateLimit\(\s*`home-overview:/)
  assert.match(source, /loadHomeOverview\(/)
  assert.doesNotMatch(source, /reason/)
})
