import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HOLIDAY_TEAM_ALL,
  HOLIDAY_TEAM_MINE,
  holidayTeamFilterApplies,
  visibleBirthdays,
  visibleEvents,
  visibleHolidays,
  type HolidayTeamOption,
  type TeamHoliday,
} from '@/lib/time-off/calendar-filters'

const TEAMS: HolidayTeamOption[] = [
  { code: 'PAKISTAN', label: 'Pakistan Team' },
  { code: 'BOSNIA', label: 'Bosnia Team' },
]
const MINE = [{ id: 'h1', date: '2026-11-09', name: 'Iqbal Day' }]
const ALL: TeamHoliday[] = [
  { id: 'h1', date: '2026-11-09', name: 'Iqbal Day', teamTags: ['PAKISTAN'] },
  { id: 'h2', date: '2026-11-25', name: 'Statehood Day', teamTags: ['BOSNIA'] },
  { id: 'h3', date: '2026-11-30', name: 'Company Day', teamTags: ['PAKISTAN', 'BOSNIA'] },
]
const EVENTS = [{ id: 'e1' }, { id: 'e2' }]
const BIRTHDAYS = [{ userId: 'u1', name: 'Rhea Castillo', day: 4 }]

test('show everything: leave, holidays and birthdays all stay', () => {
  assert.equal(visibleEvents('ALL', EVENTS).length, 2)
  assert.equal(visibleBirthdays('ALL', BIRTHDAYS).length, 1)
  assert.deepEqual(visibleHolidays('ALL', HOLIDAY_TEAM_MINE, MINE, ALL, TEAMS), MINE)
})

test('show only public holidays: leave and birthdays are hidden', () => {
  assert.deepEqual(visibleEvents('HOLIDAYS', EVENTS), [])
  assert.deepEqual(visibleBirthdays('HOLIDAYS', BIRTHDAYS), [])
  assert.deepEqual(visibleHolidays('HOLIDAYS', HOLIDAY_TEAM_MINE, MINE, ALL, TEAMS), MINE)
})

test('show only birthdays: leave and holidays are hidden', () => {
  assert.deepEqual(visibleEvents('BIRTHDAYS', EVENTS), [])
  assert.deepEqual(visibleHolidays('BIRTHDAYS', HOLIDAY_TEAM_ALL, MINE, ALL, TEAMS), [])
  assert.equal(visibleBirthdays('BIRTHDAYS', BIRTHDAYS).length, 1)
})

test('show only leave: holidays and birthdays are hidden', () => {
  assert.equal(visibleEvents('LEAVE', EVENTS).length, 2)
  assert.deepEqual(visibleHolidays('LEAVE', HOLIDAY_TEAM_MINE, MINE, ALL, TEAMS), [])
  assert.deepEqual(visibleBirthdays('LEAVE', BIRTHDAYS), [])
})

test('holidays for one team: only the ones that team observes', () => {
  const shown = visibleHolidays('ALL', 'BOSNIA', MINE, ALL, TEAMS)
  assert.deepEqual(shown.map((h) => h.id), ['h2', 'h3'])
})

test('holidays for all teams: every holiday, labelled with who observes it', () => {
  const shown = visibleHolidays('HOLIDAYS', HOLIDAY_TEAM_ALL, MINE, ALL, TEAMS)
  assert.deepEqual(shown.map((h) => h.teams), ['Pakistan Team', 'Bosnia Team', 'All teams'])
})

test('a team code missing from the catalog falls back to the code itself', () => {
  const shown = visibleHolidays('ALL', HOLIDAY_TEAM_ALL, [], [{ id: 'h9', date: '2026-11-02', name: 'X', teamTags: ['OLD_TEAM'] }], TEAMS)
  assert.equal(shown[0].teams, 'OLD_TEAM')
})

test('the team picker only matters while holidays are on screen', () => {
  assert.equal(holidayTeamFilterApplies('ALL'), true)
  assert.equal(holidayTeamFilterApplies('HOLIDAYS'), true)
  assert.equal(holidayTeamFilterApplies('LEAVE'), false)
  assert.equal(holidayTeamFilterApplies('BIRTHDAYS'), false)
})
