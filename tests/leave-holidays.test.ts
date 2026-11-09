import test from 'node:test'
import assert from 'node:assert/strict'
import {
  birthdayDayInYear,
  birthdaysInMonth,
  isValidBirthday,
  leaveHolidayAppliesTo,
  leaveHolidayKeysForTeam,
  leaveHolidayTeamsError,
  normalizeLeaveHolidayTeams,
} from '../lib/leave-holidays'
import {
  birthdayInputSchema,
  leaveHolidayInputSchema,
  parseDateOnly,
  resolveLeaveHolidayTeams,
} from '../lib/leave-holiday-input'
import { holidayRecharges, type ChargedLeave } from '../lib/leave-holiday-store'
import { buildTeamCatalog } from '../lib/teams/catalog'
import { BOSNIA_DEFINITION, CURRENT_CATALOG, LEGACY_TEAM_DEFINITIONS } from './helpers/team-catalog'

const day = (d: number) => new Date(Date.UTC(2026, 9, d)) // October 2026; the 19th is a Monday

// Morocco archived, to check archived teams are kept but never newly chosen.
const WITH_ARCHIVED = buildTeamCatalog([
  ...LEGACY_TEAM_DEFINITIONS.map((d) => (d.code === 'MOROCCO' ? { ...d, archivedAt: '2026-11-01T00:00:00.000Z' } : d)),
  BOSNIA_DEFINITION,
])

test('holiday teams come from the catalog, so a team HR adds (Bosnia) can be chosen', () => {
  assert.equal(leaveHolidayTeamsError(CURRENT_CATALOG, ['PAKISTAN', 'BOSNIA']), null)
  assert.match(leaveHolidayTeamsError(CURRENT_CATALOG, ['ATLANTIS']) ?? '', /Unknown team tag\(s\): ATLANTIS/)
  assert.match(leaveHolidayTeamsError(CURRENT_CATALOG, ['pakistan']) ?? '', /Unknown/)
})

test('an archived team cannot be newly chosen, but a holiday that has it keeps it', () => {
  assert.match(leaveHolidayTeamsError(WITH_ARCHIVED, ['MOROCCO']) ?? '', /archived/)
  assert.equal(leaveHolidayTeamsError(WITH_ARCHIVED, ['MOROCCO', 'BOSNIA'], ['MOROCCO']), null)
  assert.deepEqual(resolveLeaveHolidayTeams(WITH_ARCHIVED, ['MOROCCO'], ['MOROCCO']), { ok: true, teamTags: ['MOROCCO'] })
  assert.equal(resolveLeaveHolidayTeams(WITH_ARCHIVED, ['MOROCCO']).ok, false)
})

test('choosing either Pakistan team selects both; Morocco stays apart from 3E Morocco', () => {
  assert.deepEqual(normalizeLeaveHolidayTeams(CURRENT_CATALOG, ['THREE_E_PAKISTAN']), ['PAKISTAN', 'THREE_E_PAKISTAN'])
  assert.deepEqual(normalizeLeaveHolidayTeams(CURRENT_CATALOG, ['MOROCCO']), ['MOROCCO'])
  assert.deepEqual(
    normalizeLeaveHolidayTeams(CURRENT_CATALOG, ['BOSNIA', 'COLOMBIA', 'PAKISTAN', 'PAKISTAN']),
    ['PAKISTAN', 'COLOMBIA', 'BOSNIA', 'THREE_E_PAKISTAN'],
    'catalog order'
  )
})

test('a holiday applies only to the teams it lists, and never to someone without a team', () => {
  const holiday = { teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'] }
  assert.equal(leaveHolidayAppliesTo(holiday, 'PAKISTAN'), true)
  assert.equal(leaveHolidayAppliesTo(holiday, 'MOROCCO'), false)
  assert.equal(leaveHolidayAppliesTo(holiday, null), false)
})

test('holiday keys are the UTC days of the holidays that apply', () => {
  const keys = leaveHolidayKeysForTeam(
    [
      { date: day(21), teamTags: ['PAKISTAN'] },
      { date: '2026-10-22T00:00:00.000Z', teamTags: ['MOROCCO'] },
    ],
    'PAKISTAN'
  )
  assert.deepEqual([...keys], ['2026-10-21'])
})

test('holiday input: needs a real date, a name and at least one team', () => {
  const ok = leaveHolidayInputSchema.safeParse({ date: '2026-10-21', name: ' Founders Day ', teamTags: ['PAKISTAN'] })
  assert.ok(ok.success)
  assert.equal(ok.data.date.toISOString(), '2026-10-21T00:00:00.000Z')
  assert.equal(ok.data.name, 'Founders Day')
  assert.deepEqual(resolveLeaveHolidayTeams(CURRENT_CATALOG, ok.data.teamTags), {
    ok: true,
    teamTags: ['PAKISTAN', 'THREE_E_PAKISTAN'],
  })

  assert.equal(leaveHolidayInputSchema.safeParse({ date: '2026-02-30', name: 'X', teamTags: ['PAKISTAN'] }).success, false)
  assert.equal(leaveHolidayInputSchema.safeParse({ date: '2026-10-21', name: '  ', teamTags: ['PAKISTAN'] }).success, false)
  assert.equal(leaveHolidayInputSchema.safeParse({ date: '2026-10-21', name: 'X', teamTags: [] }).success, false)
})

test('parseDateOnly rejects days that do not exist', () => {
  assert.equal(parseDateOnly('2028-02-29')?.toISOString(), '2028-02-29T00:00:00.000Z')
  assert.equal(parseDateOnly('2026-02-29'), null)
  assert.equal(parseDateOnly('21/10/2026'), null)
})

test('birthdays: month and day only, Feb 29 allowed and shown on Feb 28 in other years', () => {
  assert.equal(isValidBirthday(2, 29), true)
  assert.equal(isValidBirthday(2, 30), false)
  assert.equal(isValidBirthday(4, 31), false)
  assert.equal(isValidBirthday(13, 1), false)
  assert.equal(birthdayDayInYear(2, 29, 2027), 28)
  assert.equal(birthdayDayInYear(2, 29, 2028), 29)
  assert.equal(birthdayDayInYear(2, 29, 2100), 28, 'centuries are not leap years unless divisible by 400')

  assert.equal(birthdayInputSchema.safeParse({ userId: 'u1', month: 2, day: 29 }).success, true)
  assert.equal(birthdayInputSchema.safeParse({ userId: 'u1', month: 6, day: 31 }).success, false)
})

test('birthdaysInMonth keeps the month, moves Feb 29 and sorts by day then name', () => {
  const list = [
    { userId: 'a', name: 'Zed Quill', month: 2, day: 29 },
    { userId: 'b', name: 'Ava Stone', month: 2, day: 28 },
    { userId: 'c', name: 'Moe Park', month: 3, day: 1 },
  ]
  assert.deepEqual(birthdaysInMonth(list, 2027, 1), [
    { userId: 'b', name: 'Ava Stone', day: 28 },
    { userId: 'a', name: 'Zed Quill', day: 28 },
  ])
  assert.deepEqual(birthdaysInMonth(list, 2028, 1).map((b) => b.day), [28, 29])
})

test('holidayRecharges: the new count minus the old, per employee, year and leave type', () => {
  const leave = (over: Partial<ChargedLeave>): ChargedLeave => ({
    employeeId: 'e1',
    startDate: day(19),
    endDate: day(23),
    isHalfDay: false,
    leaveType: 'ANNUAL',
    teamTag: 'PAKISTAN',
    ...over,
  })
  const none = new Map<string, Set<string>>()
  const withHoliday = new Map([['PAKISTAN', new Set(['2026-10-21'])]])

  assert.deepEqual(holidayRecharges([leave({})], none, withHoliday), [
    { employeeId: 'e1', year: 2026, usedField: 'annualUsed', delta: -1 },
  ])
  assert.deepEqual(holidayRecharges([leave({})], withHoliday, none), [
    { employeeId: 'e1', year: 2026, usedField: 'annualUsed', delta: 1 },
  ])
  assert.deepEqual(
    holidayRecharges([leave({ startDate: day(21), endDate: day(21), isHalfDay: true, leaveType: 'CASUAL' })], none, withHoliday),
    [{ employeeId: 'e1', year: 2026, usedField: 'casualUsed', delta: -0.5 }]
  )
  assert.deepEqual(holidayRecharges([leave({ teamTag: 'MOROCCO' })], none, withHoliday), [], 'other teams are untouched')
  assert.deepEqual(
    holidayRecharges([leave({}), leave({ startDate: day(20), endDate: day(21) })], none, withHoliday),
    [{ employeeId: 'e1', year: 2026, usedField: 'annualUsed', delta: -2 }],
    'two leaves on the same balance are summed'
  )
})
