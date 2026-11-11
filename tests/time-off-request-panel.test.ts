import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RequestSummaryBox } from '@/components/leave/time-off/RequestSummaryBox'
import { DatesTypeStep } from '@/components/leave/time-off/DatesTypeStep'
import { HandoverStep } from '@/components/leave/time-off/HandoverStep'
import { PeopleReviewStep } from '@/components/leave/time-off/PeopleReviewStep'
import { MemberMultiSelect } from '@/components/leave/MemberMultiSelect'
import { RequestPanel } from '@/components/leave/time-off/RequestPanel'
import {
  SMALL_SCREEN_QUERY, shouldTrapFocus, trapTabKey, wrapFocusIndex, type TrapKeyEvent,
} from '@/components/leave/time-off/panel-modal'
import { TransitionPlanTable } from '@/components/leave/TransitionPlanTable'
import { summarizeLeaveRequest, type LeaveSummary } from '@/lib/time-off/request-summary'
import { EMPTY_REQUEST_FORM, type RequestForm } from '@/lib/time-off/request-form'
import { MAX_TRANSITION_TASKS, type TransitionTask } from '@/lib/leave-transition-plan'
import type { DirectoryUser, LeaveBalance } from '@/lib/time-off/types'

const noop = () => {}

const BALANCE: LeaveBalance = {
  casualDays: 10,
  sickDays: 6,
  annualDays: 14,
  casualUsed: 5,
  sickUsed: 6,
  annualUsed: 0,
  remaining: { casual: 5, sick: 0, annual: 14 },
}

function summary(o: Partial<Parameters<typeof summarizeLeaveRequest>[0]> = {}): LeaveSummary {
  return summarizeLeaveRequest({
    startDate: '2026-11-19',
    endDate: '2026-11-23',
    isHalfDay: false,
    holidayKeys: new Set(),
    remaining: 5,
    total: 10,
    balanceYear: 2026,
    ...o,
  })
}

function form(o: Partial<RequestForm> = {}): RequestForm {
  return { ...EMPTY_REQUEST_FORM, startDate: '2026-11-19', endDate: '2026-11-23', ...o }
}

const USERS: DirectoryUser[] = Array.from({ length: 12 }, (_, i) => ({
  id: `u${i + 1}`,
  name: `Teammate${i + 1} Example`,
  department: 'Design',
}))

const task = (details: string): TransitionTask => ({
  taskDetails: details, projectDept: '', assignedTo: '', accepted: null,
  deadline: null, completed: null, variance: '', links: '',
})

test('summary box reads like the mockup', () => {
  const html = renderToStaticMarkup(createElement(RequestSummaryBox, { summary: summary() }))
  assert.match(html, /Thu 19 – Mon 23 Nov/)
  assert.match(html, /3 working days/)
  assert.match(html, /2 weekend days not counted/)
  assert.match(html, /Back Tue 24 Nov/)
  assert.doesNotMatch(html, /holiday/)
})

test('summary box counts holidays and singular words', () => {
  const html = renderToStaticMarkup(
    createElement(RequestSummaryBox, {
      summary: summary({ startDate: '2026-11-18', endDate: '2026-11-20', holidayKeys: new Set(['2026-11-19']) }),
    })
  )
  assert.match(html, /2 working days/)
  assert.match(html, /1 holiday not counted/)
  assert.doesNotMatch(html, /weekend/)
})

test('half day summary says back the same day', () => {
  const html = renderToStaticMarkup(
    createElement(RequestSummaryBox, { summary: summary({ endDate: '2026-11-19', isHalfDay: true }) })
  )
  assert.match(html, /Back the same day/)
  assert.match(html, /0.5 working days/)
})

test('summary box renders nothing without dates', () => {
  const html = renderToStaticMarkup(createElement(RequestSummaryBox, { summary: summary({ startDate: '', endDate: '' }) }))
  assert.equal(html, '')
})

test('step 1 tiles show days left and None left', () => {
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, { form: form({ leaveType: 'ANNUAL' }), onChange: noop, summary: summary({ remaining: 14, total: 14 }), balance: BALANCE })
  )
  assert.match(html, /role="radiogroup"[^>]*aria-label="Leave type"/)
  assert.equal(html.match(/role="radio"/g)?.length, 3)
  assert.match(html, /None left/)
  assert.match(html, /5 left/)
  assert.match(html, /14 left/)
  assert.match(html, /aria-checked="true"[^>]*>(?:(?!role="radio").)*Annual/)
  assert.equal(html.match(/aria-checked="true"/g)?.length, 1)
  assert.match(html, /id="leave-start"/)
  assert.match(html, /id="leave-end"/)
  assert.match(html, /Drag on the calendar, or type the dates\./)
})

test('step 1 reason helper is truthful', () => {
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, { form: form(), onChange: noop, summary: summary(), balance: BALANCE })
  )
  assert.match(html, /Your lead, HR and the people you add in step 3 see this/)
  assert.doesNotMatch(html, /Only your lead and HR/)
  assert.match(html, /id="leave-reason"/)
  assert.match(html, /Brief description of why you need this leave\.\.\./)
})

test('step 1 balance after uses the words form', () => {
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, { form: form(), onChange: noop, summary: summary(), balance: BALANCE })
  )
  assert.match(html, /Casual after this request/)
  assert.match(html, /2 days left of 10/)
})

test('step 1 says next year applies for another year', () => {
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, {
      form: form({ startDate: '2027-01-05', endDate: '2027-01-06' }),
      onChange: noop,
      summary: summary({ startDate: '2027-01-05', endDate: '2027-01-06' }),
      balance: BALANCE,
    })
  )
  assert.match(html, /Next year(&#x27;|')s balance applies/)
  assert.doesNotMatch(html, /after this request/)
})

test('step 1 half day block keeps today copy and disables the last day', () => {
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, {
      form: form({ isHalfDay: true, endDate: '2026-11-19', halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }),
      onChange: noop,
      summary: summary({ endDate: '2026-11-19', isHalfDay: true }),
      balance: BALANCE,
    })
  )
  assert.match(html, /Available for Casual and Sick only\. Half-day leave counts as 0\.5 day\./)
  assert.match(html, /Unavailable From/)
  assert.match(html, /Unavailable To/)
  assert.match(html, /<input[^>]*id="leave-end"[^>]*disabled=""/)
})

test('step 2 says whether a plan is needed', () => {
  const required = renderToStaticMarkup(
    createElement(HandoverStep, { form: form(), onChange: noop, planRequired: true, mode: 'create' })
  )
  assert.match(required, /role="status"/)
  assert.match(required, /This leave needs a transition plan\. You can add it now or later from My requests, before your leave starts\./)
  assert.match(required, /id="leave-notes"/)
  assert.match(required, /Add task/)

  const optional = renderToStaticMarkup(
    createElement(HandoverStep, { form: form(), onChange: noop, planRequired: false, mode: 'create' })
  )
  assert.match(optional, /No transition plan is needed for this leave\. You can still add one\./)
})

test('step 2 in edit mode shows notes only', () => {
  const html = renderToStaticMarkup(
    createElement(HandoverStep, { form: form(), onChange: noop, planRequired: true, mode: 'edit' })
  )
  assert.match(html, /The structured transition plan is managed from the request details\./)
  assert.match(html, /id="leave-notes"/)
  assert.doesNotMatch(html, /Add task/)
  assert.doesNotMatch(html, /needs a transition plan/)
})

test('plan table hides Add task at the limit', () => {
  const full = Array.from({ length: MAX_TRANSITION_TASKS }, (_, i) => task(`Task ${i}`))
  const html = renderToStaticMarkup(createElement(TransitionPlanTable, { tasks: full, onChange: noop }))
  assert.doesNotMatch(html, /Add task/)
  assert.match(html, /Up to 50 tasks/)
  const one = renderToStaticMarkup(createElement(TransitionPlanTable, { tasks: [task('x')], onChange: noop }))
  assert.match(one, /Add task/)
})

test('member select without max keeps its behaviour', () => {
  const html = renderToStaticMarkup(
    createElement(MemberMultiSelect, { members: USERS, selectedIds: USERS.slice(0, 10).map((u) => u.id), onChange: noop })
  )
  assert.doesNotMatch(html, /Up to/)
  assert.doesNotMatch(html, /<input[^>]*disabled=""/)
})

test('step 3 lists cover and notify limits', () => {
  const html = renderToStaticMarkup(
    createElement(PeopleReviewStep, {
      form: form({ coverPersonIds: USERS.slice(0, 10).map((u) => u.id), reason: 'Family wedding' }),
      onChange: noop,
      users: USERS,
      viewerId: 'u12',
      summary: summary(),
      mode: 'create',
    })
  )
  assert.match(html, /Up to 10 people/)
  assert.match(html, /<input[^>]*disabled=""[^>]*placeholder="Up to 10 people"|<input[^>]*placeholder="Up to 10 people"[^>]*disabled=""/)
  assert.match(html, /Selected cover teammates will be notified by email\./)
  assert.match(html, /These people will receive an email notification\. Approval still goes to your lead and HR only\./)
  assert.doesNotMatch(html, /Teammate12 Example/) // the viewer is not in either pool
  assert.match(html, /Family wedding/)
  assert.match(html, /No plan yet/)
  assert.match(html, /3 working days/)
  assert.doesNotMatch(html, /Saving sends it back/)
})

test('step 3 summary covers half day, plan and notes; edit mode warns', () => {
  const html = renderToStaticMarkup(
    createElement(PeopleReviewStep, {
      form: form({
        leaveType: 'SICK', isHalfDay: true, endDate: '2026-11-19', halfDaySession: 'SECOND_HALF',
        unavailableStartTime: '14:00', unavailableEndTime: '18:00',
        tasks: [task('Hand over the report'), task('Reply to the client')],
        transitionPlan: 'First line of notes\nsecond line',
        additionalNotifyIds: ['u3'],
      }),
      onChange: noop,
      users: USERS,
      viewerId: 'u12',
      summary: summary({ endDate: '2026-11-19', isHalfDay: true }),
      mode: 'edit',
    })
  )
  assert.match(html, /Sick/)
  assert.match(html, /Second half/)
  assert.match(html, /14:00 - 18:00/)
  assert.match(html, /2 tasks/)
  assert.match(html, /First line of notes/)
  assert.doesNotMatch(html, /second line/)
  assert.match(html, /Teammate3 Example/)
  assert.match(html, /Saving sends it back for approval and emails your lead and HR again\./)
})

test('the panel is a labelled dialog at every size', () => {
  const html = renderToStaticMarkup(
    createElement(RequestPanel, {
      open: true,
      mode: { kind: 'create' },
      initialRange: { start: '2026-11-19', end: '2026-11-23' },
      balance: BALANCE,
      balanceYear: 2026,
      viewerDepartment: 'Design',
      viewerId: 'u12',
      users: USERS,
      holidayKeysFor: async () => new Set<string>(),
      onClose: noop,
      onSaved: noop,
    })
  )
  assert.match(html, /<section[^>]*role="dialog"[^>]*aria-labelledby="request-panel-title"/)
  assert.match(html, /id="request-panel-title"[^>]*>Request leave</)
  assert.doesNotMatch(html, /aria-modal/) // server render is the docked (non-modal) layout
  assert.match(html, /role="group"[^>]*aria-label="1\. Dates and type"/)
  assert.match(html, /aria-current="step"/)
  assert.match(html, /Next: Handover/)
  const closed = renderToStaticMarkup(
    createElement(RequestPanel, {
      open: false, mode: { kind: 'create' }, initialRange: null, balance: BALANCE, balanceYear: 2026,
      viewerDepartment: null, viewerId: 'u12', users: USERS, holidayKeysFor: async () => new Set<string>(),
      onClose: noop, onSaved: noop,
    })
  )
  assert.equal(closed, '')
})

test('focus is trapped only while open on a small screen', () => {
  assert.equal(shouldTrapFocus(true, true), true)
  assert.equal(shouldTrapFocus(true, false), false)
  assert.equal(shouldTrapFocus(false, true), false)
  assert.equal(shouldTrapFocus(false, false), false)
  assert.equal(SMALL_SCREEN_QUERY, '(max-width: 1023px)')
})

test('Tab wraps at the ends of the panel and nowhere else', () => {
  assert.equal(wrapFocusIndex(5, 4, false), 0) // Tab on the last item -> first
  assert.equal(wrapFocusIndex(5, 0, true), 4) // Shift+Tab on the first item -> last
  assert.equal(wrapFocusIndex(5, -1, true), 4) // Shift+Tab from the heading -> last
  assert.equal(wrapFocusIndex(5, -1, false), null) // Tab from the heading moves on normally
  assert.equal(wrapFocusIndex(5, 2, false), null)
  assert.equal(wrapFocusIndex(5, 2, true), null)
  assert.equal(wrapFocusIndex(0, 0, false), null)
})

function fakeTrap() {
  const focused: string[] = []
  const item = (name: string) => ({ name, getAttribute: () => null, focus: () => { focused.push(name) } })
  const items = [item('close'), item('reason'), item('next')]
  const inside = new Set<unknown>(items)
  const container = {
    contains: (node: unknown) => inside.has(node),
    querySelectorAll: () => items,
  } as unknown as HTMLElement
  const outside = { name: 'select-option' }
  const event = (o: Partial<TrapKeyEvent> = {}) => {
    const calls = { prevented: 0 }
    const e: TrapKeyEvent = {
      key: 'Tab', shiftKey: false, defaultPrevented: false, target: items[2] as unknown as EventTarget,
      preventDefault: () => { calls.prevented += 1 },
      ...o,
    } as TrapKeyEvent
    return { e, calls }
  }
  return { focused, items, container, outside, event }
}

test('the trap wraps Tab from the last item inside the panel', () => {
  const t = fakeTrap()
  const { e, calls } = t.event()
  trapTabKey(e, t.container, { activeElement: t.items[2] as unknown as Element })
  assert.equal(calls.prevented, 1)
  assert.deepEqual(t.focused, ['close'])
})

test('the trap leaves Tab alone when another layer already handled it', () => {
  const t = fakeTrap()
  const { e, calls } = t.event({ defaultPrevented: true })
  trapTabKey(e, t.container, { activeElement: t.outside as unknown as Element })
  assert.equal(calls.prevented, 0)
  assert.deepEqual(t.focused, [])
})

test('the trap leaves Tab alone for portalled content outside the panel (open Select)', () => {
  const t = fakeTrap()
  const { e, calls } = t.event({ target: t.outside as unknown as EventTarget })
  trapTabKey(e, t.container, { activeElement: t.outside as unknown as Element })
  assert.equal(calls.prevented, 0)
  assert.deepEqual(t.focused, [])
})
