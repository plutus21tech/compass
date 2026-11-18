import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RequestSummaryBox } from '@/components/leave/time-off/RequestSummaryBox'
import { DatesTypeStep } from '@/components/leave/time-off/DatesTypeStep'
import { HandoverStep, pickHandoverSuggestions } from '@/components/leave/time-off/HandoverStep'
import { HandoverItems } from '@/components/leave/time-off/HandoverItems'
import { isSuggestionAdded, toggleSuggestion } from '@/lib/time-off/handover'
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

test('step 1 warns inline and says days short when the balance is too small', () => {
  const over = { startDate: '2026-11-18', endDate: '2026-11-27' }
  const html = renderToStaticMarkup(
    createElement(DatesTypeStep, { form: form(over), onChange: noop, summary: summary(over), balance: BALANCE })
  )
  assert.match(html, /role="alert"[^>]*>You have 5 casual days left\. Choose another leave type or pick fewer days\./)
  assert.match(html, /text-red-600[^>]*>3 days short</)
  assert.doesNotMatch(html, /None left of 10/)
})

test('step 1 disables a leave type with nothing left, but not the one already chosen', () => {
  const render = (f: RequestForm) =>
    renderToStaticMarkup(createElement(DatesTypeStep, { form: f, onChange: noop, summary: summary(), balance: BALANCE }))
  const sickTile = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>(?:(?!<\/button>).)*Sick(?:(?!<\/button>).)*<\/button>/)?.[0] ?? ''
  assert.match(sickTile(render(form())), /disabled=""/)
  assert.match(sickTile(render(form())), /aria-disabled="true"/)
  assert.match(sickTile(render(form())), /None left/)
  assert.doesNotMatch(sickTile(render(form({ leaveType: 'SICK' }))), /disabled=""/)
  assert.equal(render(form()).match(/<button[^>]*role="radio"[^>]*disabled=""/g)?.length, 1)
})

test('step 1 offers a half day only for a single day', () => {
  const render = (f: RequestForm) =>
    renderToStaticMarkup(createElement(DatesTypeStep, { form: f, onChange: noop, summary: summary(), balance: BALANCE }))
  assert.doesNotMatch(render(form()), /Half-Day Leave/)
  assert.doesNotMatch(render(form({ startDate: '', endDate: '' })), /Half-Day Leave/)
  assert.match(render(form({ endDate: '2026-11-19' })), /Half-Day Leave/)
})

test('step 1 date inputs start at today for planned leave, not for Sick', () => {
  const render = (f: RequestForm) =>
    renderToStaticMarkup(
      createElement(DatesTypeStep, { form: f, onChange: noop, summary: summary(), balance: BALANCE, todayKey: '2026-11-10' })
    )
  assert.match(render(form()), /<input[^>]*id="leave-start"[^>]*min="2026-11-10"|<input[^>]*min="2026-11-10"[^>]*id="leave-start"/)
  assert.doesNotMatch(render(form({ leaveType: 'SICK' })), /min="2026-11-10"/)
})

test('the main button is disabled until the step is ready, and says why beside it', () => {
  const panel = (range: { start: string; end: string } | null) =>
    renderToStaticMarkup(
      createElement(RequestPanel, {
        open: true, mode: { kind: 'create' }, initialRange: range, balance: BALANCE, balanceYear: 2026,
        viewerDepartment: 'Design', viewerId: 'u12', users: USERS, holidayKeysFor: async () => new Set<string>(),
        onClose: noop, onSaved: noop,
      })
    )
  const nextButton = (html: string) => html.match(/<button[^>]*>Next: Handover<\/button>/)?.[0] ?? ''
  const empty = panel(null)
  assert.match(nextButton(empty), /disabled=""/)
  assert.match(nextButton(empty), /aria-describedby="request-panel-blocker"/)
  assert.match(empty, /id="request-panel-blocker"[^>]*>Pick your first day off</)
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
  assert.match(required, /Add item/)

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
  assert.doesNotMatch(html, /Add item/)
  assert.doesNotMatch(html, /needs a transition plan/)
})

test('step 2 items are one line each: the work, who covers it, a link or note', () => {
  const html = renderToStaticMarkup(
    createElement(HandoverItems, {
      tasks: [{ ...task('Weekly client report'), projectDept: 'Engine', assignedTo: 'Old Typed Name' }],
      onChange: noop,
      people: USERS.slice(0, 2),
      suggestions: [
        { id: 't1', title: 'Weekly client report', projectName: 'Engine' },
        { id: 't2', title: 'Brand identity', projectName: 'Studio' },
      ],
    })
  )
  assert.match(html, /aria-label="Item 1: what needs covering"[^>]*value="Weekly client report"|value="Weekly client report"[^>]*aria-label="Item 1: what needs covering"/)
  assert.match(html, /aria-label="Item 1: who covers it"/)
  assert.match(html, /<option value="Teammate1 Example">/)
  assert.match(html, /<option value="Old Typed Name"[^>]*>Old Typed Name<\/option>/) // a name typed earlier is kept
  assert.match(html, /aria-label="Item 1: link or notes"/)
  for (const gone of ['Accepted', 'Completed', 'Deadline']) assert.doesNotMatch(html, new RegExp(gone))
  // My work suggestions: the one already added is ticked.
  assert.match(html, /From My work/)
  assert.match(html, /id="handover-suggestion-t1"[^>]*aria-checked="true"|aria-checked="true"[^>]*id="handover-suggestion-t1"/)
  assert.match(html, /id="handover-suggestion-t2"[^>]*aria-checked="false"|aria-checked="false"[^>]*id="handover-suggestion-t2"/)
})

test('step 2 hides the suggestions block when My work has nothing to offer', () => {
  const html = renderToStaticMarkup(createElement(HandoverItems, { tasks: [], onChange: noop, people: [], suggestions: [] }))
  assert.doesNotMatch(html, /From My work/)
  assert.match(html, /Add item/)
})

test('ticking a My work suggestion adds it, unticking removes it; bad responses give none', () => {
  const s = { id: 't1', title: 'Weekly client report', projectName: 'Engine' }
  const added = toggleSuggestion([], s)
  assert.deepEqual(added.map((t) => [t.taskDetails, t.projectDept]), [['Weekly client report', 'Engine']])
  assert.equal(isSuggestionAdded(added, s), true)
  assert.deepEqual(toggleSuggestion(added, s), [])
  const picked = pickHandoverSuggestions({
    tasks: [
      { id: 'a', title: 'Open one', status: 'TODO', project: { name: 'Engine' } },
      { id: 'b', title: 'Finished', status: 'DONE', project: { name: 'Engine' } },
      { title: 'No id' },
    ],
  })
  assert.deepEqual(picked, [{ id: 'a', title: 'Open one', projectName: 'Engine' }])
  assert.deepEqual(pickHandoverSuggestions(null), [])
  assert.deepEqual(pickHandoverSuggestions({ tasks: 'nope' }), [])
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

test('step 3 pickers stay closed until you type, and suggest teammates', () => {
  const users: DirectoryUser[] = [
    ...USERS.slice(0, 3),
    { id: 'x1', name: 'Other Team Example', department: 'Finance' },
    { id: 'me', name: 'Viewer Example', department: 'Design' },
  ]
  const html = renderToStaticMarkup(
    createElement(PeopleReviewStep, { form: form(), onChange: noop, users, viewerId: 'me', summary: summary(), mode: 'create' })
  )
  // Two teammates from the viewer's department are one click away; other teams are not suggested.
  assert.equal(html.match(/aria-label="Add Teammate1 Example"/g)?.length, 2) // once per picker
  assert.match(html, /aria-label="Add Teammate2 Example"/)
  assert.doesNotMatch(html, /aria-label="Add Teammate3 Example"/)
  assert.doesNotMatch(html, /aria-label="Add Other Team Example"/)
  // The full list is not open before anything is typed.
  assert.equal(html.match(/<div hidden=""/g)?.length, 2)
  assert.match(html, /placeholder="Type a name or team\.\.\."/)
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

test('the docked panel fits below the 56px top bar: main scrolls under it, sticky at top-6 with 1.5rem below', () => {
  const src = readFileSync('components/leave/time-off/RequestPanel.tsx', 'utf8')
  assert.match(src, /lg:top-6 /)
  assert.match(src, /lg:max-h-\[calc\(100vh-3\.5rem-3rem\)\]/)
})
