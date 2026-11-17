import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_DETAIL_MAX,
  PROFILE_LEAVE_SHOWN,
  hasProfileDetails,
  pickProfileLeave,
  profileDetailsSchema,
  profilePath,
  type ProfileLeaveRow,
} from '@/lib/people/profile-rules'

const TODAY = '2026-11-17'
let n = 0
function leave(start: string, end: string, o: Partial<ProfileLeaveRow> = {}): ProfileLeaveRow {
  n += 1
  return {
    id: `l${String(n).padStart(3, '0')}`,
    leaveType: 'CASUAL',
    status: 'APPROVED',
    startDate: new Date(`${start}T00:00:00Z`),
    endDate: new Date(`${end}T00:00:00Z`),
    isHalfDay: false,
    ...o,
  }
}

test('leave that has ended is left out; leave ending today still counts as ongoing', () => {
  const shown = pickProfileLeave([leave('2026-11-10', '2026-11-16'), leave('2026-11-14', '2026-11-17')], TODAY)
  assert.equal(shown.length, 1)
  assert.deepEqual([shown[0].startDate, shown[0].endDate, shown[0].ongoing], ['2026-11-14', '2026-11-17', true])
})

test('upcoming leave is not ongoing and comes soonest first', () => {
  const shown = pickProfileLeave([leave('2026-12-20', '2026-12-24'), leave('2026-11-25', '2026-11-25')], TODAY)
  assert.deepEqual(shown.map((l) => l.startDate), ['2026-11-25', '2026-12-20'])
  assert.deepEqual(shown.map((l) => l.ongoing), [false, false])
})

test('only approved leave appears', () => {
  const rows = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'REJECTED', 'CANCELLED'].map((status) =>
    leave('2026-11-20', '2026-11-21', { status })
  )
  assert.deepEqual(pickProfileLeave(rows, TODAY), [])
})

test('the list is capped', () => {
  const rows = Array.from({ length: PROFILE_LEAVE_SHOWN + 3 }, (_, i) => {
    const key = `2026-12-${String(i + 1).padStart(2, '0')}`
    return leave(key, key)
  })
  assert.equal(pickProfileLeave(rows, TODAY).length, PROFILE_LEAVE_SHOWN)
})

test('details are trimmed, and blank answers become null', () => {
  const parsed = profileDetailsSchema.parse({ bio: '  Builds reports.  ', hobbies: '   ', funFact: null })
  assert.deepEqual(parsed, { bio: 'Builds reports.', hobbies: null, funFact: null, askMeAbout: null })
})

test('an answer over the limit is refused', () => {
  assert.equal(profileDetailsSchema.safeParse({ bio: 'x'.repeat(PROFILE_DETAIL_MAX + 1) }).success, false)
  assert.equal(profileDetailsSchema.safeParse({ bio: 'x'.repeat(PROFILE_DETAIL_MAX) }).success, true)
  assert.equal(profileDetailsSchema.safeParse({ bio: 42 }).success, false)
})

test('hasProfileDetails and profilePath', () => {
  assert.equal(hasProfileDetails({ bio: null, hobbies: null, funFact: null, askMeAbout: null }), false)
  assert.equal(hasProfileDetails({ bio: null, hobbies: 'Chess', funFact: null, askMeAbout: null }), true)
  assert.equal(profilePath('abc 1'), '/people/abc%201')
})
