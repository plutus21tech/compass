# Employee UX refresh, part 4: Time off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/leave` as the "Time off" page from mockup slide 7: balance cards ("5 days left" of 10), a Monday-first team calendar with type-coloured chips for everyone and drag/click range select, a docked 3-step request panel (Dates and type → Handover → People and review), then My requests, the approval queue, Out today and the 3E WFH section. Nothing the page does today is lost.

**Architecture:** The 2,592-line client component `app/(evaluator)/leave/page.tsx` is split into pure, tested modules under `lib/time-off/` (types, request rules, live summary, form model, balance-card model, calendar grid, range-select reducer, fetch client) and small client components under `components/leave/time-off/`. `page.tsx` becomes a thin orchestrator. The server API is not changed: every fetch the page makes today is made the same way with the same body (pinned by a source test). Browser `confirm`/`prompt` become `ConfirmDialog` and a reason dialog.

**Tech Stack:** Next.js 16 App Router (client components), React 18, Tailwind with the existing tokens and the leave palette already used on this page (amber = Casual, red = Sick, emerald = Annual, violet = holiday, pink = birthday), Radix-based `components/ui/*` (`dialog`, `confirm-dialog`, `select`, `checkbox`, `input`, `textarea`, `badge`, `button`, `card`), sonner, Node test runner (`node --import tsx --test`), `react-dom/server` `renderToStaticMarkup` for component tests, Playwright 1.58 (already installed, browsers in `%LOCALAPPDATA%\ms-playwright`).

**Spec:** `docs/superpowers/specs/2026-11-11-employee-ux-refresh-design.md` — Decision 5 (Time off), Decision 7 (container, header, dates, numbers), Non-goals (no rebrand; leave visibility stays as today), and the appendix "Time off" checklist, which is binding. Mockup: slide 7 of the UX deck (Time off page with the Request leave panel docked right of the calendar).

## Global Constraints

- Work only in the worktree `C:\Users\PC\Desktop\PE Portal\.worktrees\ux-refresh` (branch `feat/ux-refresh`). Commit after each task; never push.
- Commit messages: conventional (`feat:`, `fix:`, `test:`, `refactor:`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No rebrand.** Current colours, fonts (DM Sans, Instrument Serif) and dark mode. Use existing tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `bg-muted` …) and the leave palette the page already uses; no new hex colours. Every coloured class has a `dark:` pair.
- **Leave visibility stays as today** (owner, 2026-11-11): colleagues' chips show their leave type by colour; nothing about leave becomes more or less visible than today's tooltip/day dialog/Out today already show.
- **Server APIs stay as they are.** Do not edit anything under `app/api/leave/**`, `app/api/wfh/**`, `lib/email.ts`, `lib/google-calendar*.ts`, `lib/leave-auto-cancel.ts`, `lib/leave-transition-plan-job.ts`. Part 2 Task 7 edits those routes (bell calls `notifyLeave` / `notifyLeaveFor` / `notifyWfh` from `lib/notifications/leave.ts`); if an executor finds a server change essential, stop and ask, and keep those calls intact.
- **Do not touch files Parts 2 or 3 own:** `components/layout/**` (consume `PageContainer` from `components/layout/page-container.tsx` and `PageHeader` from `components/layout/page-header.tsx` only, as Part 2 defines them), `app/(evaluator)/dashboard/**`, `components/dashboard/**`, `lib/notifications/**`, `tests/helpers/page-frame.ts`.
- Part 2 Interfaces consumed: `PageContainer({ children, width?: 'default' | 'wide' | 'reading', className? })`; `PageHeader({ title, subtitle?, dateLine?, actions?, className? })`. If Part 2 has not landed when this part runs, stop: do not create stand-ins.
- Files stay under 800 lines; target under 300 for components. `page.tsx` under 300.
- No browser `alert`, `confirm` or `prompt` anywhere in the new files.
- Dates use `lib/format-date.ts` (`formatDate`, `formatDateRange`, `formatMonthYear`, `localDayKey`); counts use `lib/format-count.ts` (`formatDays`, `formatDaysLeft`, `daysLeftSuffix`). No bare slashes in numbers ("5 days left of 10", never "5 / 10").
- Native `<input type="date">` / `type="time"` stay (browser format allowed); the summary next to them uses the helpers.
- **Never run anything against the root `.env` database (production).** The worktree has no `.env`; keep it that way. Local test DB only: embedded Postgres on port 5433, user/password `compass`, database `compass_weekly_test`, started with
  `"C:/Users/PC/Desktop/PE Portal/.worktrees/ai-evaluations-archive/.pilot-tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe" -D "C:/Users/PC/Desktop/PE Portal/.worktrees/.academy-pg" -o "-p 5433" start`.
- Unit tests: `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — baseline is **19 known failures (18 api-integration, 1 rate-limit)**; it must stay exactly at that baseline (new tests all pass).
- Single test files: `node --import tsx --test tests/<file>.test.ts`.
- Disk is nearly full: no package installs, no full `next build`. Type-check with `npx tsc --noEmit`.
- Test data is fictional (public repo). Reuse invented names in the style of `tests/helpers/weekly-test-db.ts`.
- A GateGuard hook may block the first Write of a new file and ask for facts. Answer with the callers, that no duplicate exists, the data it handles, and the user's instruction: "lets finish all parts and open a PR alltogether". Then retry the identical call.

## Rulings made while planning (the spec left these open or the mockup disagrees with today)

1. **Reason helper text.** The mockup says "Only your lead and HR see this." That is false today: the request email (`sendLeaveRequestNotification`) goes to HR, leads, cover people and the people to notify, and shows the reason. Copy: `Your lead, HR and the people you add in step 3 see this in the request email.`
2. **Calendar weeks start on Monday** (mockup). Weekend columns are muted. Rows = only the weeks the month touches (5 or 6). Padding days show no chips (the API loads one month), as today.
3. **Chips:** up to 3 per day, then `+N more` (opens the day dialog, as today's "+N more"). Every chip is coloured by its leave type; your own chips say `You` and carry `ring-1 ring-primary` (legend "Your requests"). Pending (PENDING / LEAD_APPROVED / HR_APPROVED) chips stay faded (`opacity-60`). Half days add ` ½` to the chip and "(First half)" / "(Second half)" to its tooltip.
4. **"N out"** per day = distinct people with a leave chip that day after the department filter (pending included, as the chips are). It turns `font-semibold text-amber-700 dark:text-amber-300` at `BUSY_DAY_THRESHOLD = 5` or more.
5. **Department filter:** a segmented pair `Everyone` / `{your department}` (mockup) plus a `Select` "Other department" listing every department (today's filter). Your own leave always shows, as today.
6. **Panel placement:** at `lg` and up the panel is docked in a right column beside the calendar (grid `lg:grid-cols-[minmax(0,1fr)_400px]`); below `lg` the same element is a full-screen layer (`fixed inset-0 z-50 overflow-y-auto bg-background`, `role="dialog" aria-modal="true"`). One DOM tree, CSS only, no media-query hook. `Escape` closes (via the discard check below).
7. **Dragging while the panel is open** changes its dates and keeps everything else ("Drag again to change the dates").
8. **Closing a filled panel** asks `Discard this request?` (ConfirmDialog, confirm `Discard`, cancel `Keep editing`). An untouched panel closes at once.
9. **Edit uses the same panel** in `mode: 'edit'` (title `Edit request`, final button `Save changes`). Step 2 in edit mode shows only the general handover notes with today's line "The structured transition plan is managed from the request details." Step 3 says `Saving sends it back for approval and emails your lead and HR again.` (today's server behaviour: edit resets to PENDING and re-emails).
10. **Live summary holidays:** the summary counts the viewer's team holidays for every month the range touches by fetching `/api/leave/calendar?month&year` for months not yet cached (the same call the calendar makes; it returns only the viewer's team holidays). Ranges over 12 months are not summarised (`Pick a shorter range`); the server still decides at submit.
11. **Balance after** is shown only when the leave starts in the balance year (the year `/api/leave/balance` returned, i.e. this year). Otherwise: `Next year's balance applies`. Over-balance blocks "Next" with `You have {formatDays(left)} of {type} leave left.` — the server would refuse it anyway.
12. **Pending on balance cards** = sum of your own PENDING / LEAD_APPROVED / HR_APPROVED requests of that type starting in the balance year (`leaveDays` from the API, else `calculateLeaveDuration`). Copy: `Nothing pending` / `{formatDays(n)} pending`. Zero left: big `None` in `text-red-600 dark:text-red-400` with `Talk to HR if you need more`.
13. **"Your next leave" card:** your earliest own request with status PENDING / LEAD_APPROVED / HR_APPROVED / APPROVED whose last day is today or later. Shows type, `formatDateRange`, and `Approved` or `Waiting for approval`. Empty: `Nothing booked` / `Drag across days on the calendar to plan some.`
14. **Disapprove of an approved leave now asks first** (ConfirmDialog, danger): it cancels approved leave, so a one-click mistake is costly. Plain Reject keeps one click, as today.
15. **Out today stays** (today's sidebar card) as a card below the calendar: approved, not you, filtered by department.
16. **`/leave?request=1`** opens the panel on step 1 with no dates; `?requestId=` keeps today's behaviour. After handling, the `request` param is removed with `router.replace` (so a refresh does not reopen); `requestId` is left as today. Part 3's "History" link may use `/leave#my-requests` (the My requests card has `id="my-requests"`).
17. **Client-side limits mirror the server:** cover ≤ 10, notify ≤ 20 (`MemberMultiSelect` gains an optional `max`), plan ≤ 50 rows (`TransitionPlanTable` hides "Add task" at the limit, using a newly exported `MAX_TRANSITION_TASKS = 50` from `lib/leave-transition-plan.ts`, which renames the private `MAX_ROWS` with no behaviour change).
18. **A plan that fails to save after a successful submit** now says so (`toast.warning('Leave submitted. The transition plan did not save — add it from My requests.')`) instead of being silently ignored.
19. **Header date line** uses the house style (`formatDate(localDayKey(new Date()))`, e.g. `Wed 11 Nov`), not the mockup's "Tuesday 10 November".

## Review Focus

1. **A colleague's leave that spans two months** must show in both months and count in "N out" on each day, and a range dragged across a month boundary must be summarised with holidays from both months. → Task 4 `events spanning months appear on both months' days`, Task 2 `holidays from every touched month are counted` (via `monthsBetween`), Task 4 `monthsBetween crosses a year`.
2. **Time-zone drift on date-only values** (a leave stored `2026-11-19T00:00:00.000Z` viewed from UTC−5 must still sit on Thu 19). → Task 1 `toDateKey keeps the stored calendar day`, Task 4 `day keys never pass through local Date for stored values`.
3. **Half day on a weekend or holiday** must not be submittable (server: no working days) and must not show "0.5 working days". → Task 2 `a half day on a Saturday has no working days`.
4. **Dragging backwards** (from the 23rd to the 19th) must give start 19, end 23; releasing the mouse outside the grid must still finish the drag. → Task 4 `dragging backwards orders the range`, Task 8 (window `pointerup` listener) and Task 12 e2e drag.
5. **A deep link to a request that is in both lists** (HR's own pending request is also in the HR queue) must keep today's precedence: approval queue first. → Task 6 `approval queue wins over own list`.

---

## File map

| File | Responsibility |
|---|---|
| `lib/time-off/types.ts` | Client shapes returned by the leave/WFH APIs (`LeaveType`, `LeaveRequest`, `ApprovalRequest`, `CalendarEvent`, `WfhRequest`, `LeaveBalance`, `DirectoryUser`), `toDateKey` |
| `lib/time-off/request-rules.ts` | Status sets, edit/cancel rules, plan required/editable/reminders, approval actions, request day count |
| `lib/time-off/request-summary.ts` | Live summary: working days, weekend days, holidays, return date, balance after |
| `lib/time-off/request-form.ts` | Request form model, field transitions, step validation, API payloads |
| `lib/time-off/balance-cards.ts` | Balance card and "Your next leave" models |
| `lib/time-off/calendar-grid.ts` | Monday-first month grid, day cells, department filtering, `monthsBetween` |
| `lib/time-off/range-select.ts` | Drag/click range reducer |
| `lib/time-off/page-params.ts` | `?request=1` / `?requestId=` parsing and deep-link target |
| `lib/time-off/api.ts` | Typed fetch wrappers for every call the page makes |
| `components/leave/time-off/leave-style.ts` | Type/status labels, icons and chip/card classes |
| `components/leave/time-off/useTimeOffData.ts` | Loading, reloading, calendar month, holiday-key cache |
| `components/leave/time-off/BalanceCards.tsx` | Three balance cards + "Your next leave" |
| `components/leave/time-off/TeamCalendar.tsx` | Toolbar (month nav, filter, hint, legend) + grid + pointer wiring |
| `components/leave/time-off/CalendarDayCell.tsx` | One day: number, N out, markers, chips, +N more |
| `components/leave/time-off/DayLeaveDialog.tsx` | "+N more" list for a day |
| `components/leave/time-off/RequestPanel.tsx` | Panel frame, stepper, footer, submit/save |
| `components/leave/time-off/DatesTypeStep.tsx` | Step 1 |
| `components/leave/time-off/HandoverStep.tsx` | Step 2 |
| `components/leave/time-off/PeopleReviewStep.tsx` | Step 3 |
| `components/leave/time-off/RequestSummaryBox.tsx` | The summary block (used in steps 1 and 3) |
| `components/leave/time-off/MyRequests.tsx` | My requests list |
| `components/leave/time-off/RequestDetailsDialog.tsx` | Details, plan draft/submit/resubmit, edit/cancel entry points |
| `components/leave/time-off/ApprovalQueue.tsx` | Team approval queue incl. plan review |
| `components/leave/time-off/PlanDisapproveDialog.tsx` | Reason dialog replacing `window.prompt` |
| `components/leave/time-off/OutTodayCard.tsx` | Out today |
| `components/leave/time-off/WfhSection.tsx` | My WFH requests + WFH approval queue |
| `components/leave/time-off/WfhRequestDialog.tsx` | WFH request form |
| `app/(evaluator)/leave/page.tsx` | Orchestrator (rewritten) |
| `components/leave/MemberMultiSelect.tsx`, `components/leave/TransitionPlanTable.tsx`, `lib/leave-transition-plan.ts` | Small limit additions (ruling 17) |
| `e2e/leave.spec.ts`, `playwright.config.ts` | Browser test; blank mail/calendar credentials for the dev server |

---

### Task 1: Shared types, styles and request rules

**Files:**
- Create: `lib/time-off/types.ts`, `lib/time-off/request-rules.ts`, `components/leave/time-off/leave-style.ts`
- Test: `tests/time-off-request-rules.test.ts`

**Interfaces:**
- Produces (`lib/time-off/types.ts`): the interfaces exactly as today's page declares them (`LeaveBalance`, `LeaveRequest`, `ApprovalRequest`, `CalendarEvent`, `WfhRequest`, page lines 65–148) exported, plus `type LeaveType = 'CASUAL' | 'SICK' | 'ANNUAL'`, `type HalfDaySession = 'FIRST_HALF' | 'SECOND_HALF'`, `interface DirectoryUser { id: string; name: string; department?: string | null }`, `const LEAVE_TYPES: readonly LeaveType[] = ['CASUAL', 'SICK', 'ANNUAL']`, and `toDateKey(value: string): string` (today's lines 206–213, unchanged: leading `YYYY-MM-DD` wins, else the UTC day, `''` when invalid).
- Produces (`lib/time-off/request-rules.ts`):
  - `EDITABLE_STATUSES`, `CANCELLABLE_STATUSES`, `PENDING_STATUSES` (`PENDING`, `LEAD_APPROVED`, `HR_APPROVED`) as `ReadonlySet<string>`; editable = pending set; cancellable = pending set + `APPROVED`.
  - `canEditRequest(r: Pick<LeaveRequest,'status'>): boolean`
  - `canCancelRequest(r: Pick<LeaveRequest,'status'|'endDate'>, now?: Date): boolean` — cancellable status and `toDateKey(endDate) > localDayKey(now)`.
  - `canCancelWfhRequest(r: Pick<WfhRequest,'status'|'endDate'>, now?: Date): boolean` — cancellable status and `!hasWfhEnded(new Date(endDate), now)`.
  - `isLeaveNotStarted(startDate: string, now?: Date): boolean` — `toDateKey(startDate) >= localDayKey(now)`; `true` when the key is empty (today's fallback).
  - `requestCoverPeople(r): Array<{ id: string; name: string }>` — today's `getRequestCoverPeople`.
  - `requestDays(r): number` — `leaveDays ?? calculateLeaveDuration(...)`.
  - `planRequiredFor(r, viewerDepartment: string | null | undefined): boolean` — `transitionPlanRequired` with `r.employee?.department` when present, else `viewerDepartment`.
  - `planEditable(r, now?: Date): boolean` — not REJECTED/CANCELLED, `isLeaveNotStarted`, and (not submitted or lead status DISAPPROVED).
  - `planReminderRequests(requests, viewerDepartment, now?: Date): LeaveRequest[]` — today's lines 484–498: status editable or APPROVED, not submitted, plan required, start 0–3 days away (whole local days).
  - `type PlanReviewState = 'review' | 'approved' | 'missing' | 'not-needed'`; `planReviewState(r: ApprovalRequest): PlanReviewState` — submitted and lead status ≠ APPROVED → `review`; submitted and APPROVED → `approved`; not submitted and required → `missing`; else `not-needed`.
  - `approvalActions(r: Pick<LeaveRequest,'status'>): { showApprove: boolean; reject: 'reject' | 'disapprove'; rejectLabel: 'Reject' | 'Disapprove' }` — APPROVED → no approve, `disapprove`.
  - `decisionToast(action: 'approve' | 'reject', resultStatus?: string): string` — `Leave approved` / `Leave cancelled` (status CANCELLED) / `Leave rejected`.
- Produces (`components/leave/time-off/leave-style.ts`): `LEAVE_TYPE_STYLE: Record<LeaveType, { label; icon: LucideIcon; dot; text; bgLight; chip; bar }>` — today's colours (Sun/amber, Thermometer/red, Palmtree/emerald); `chip` = `bg-amber-100 text-amber-900 border-l-2 border-amber-500 dark:bg-amber-500/15 dark:text-amber-100` and the red/emerald equivalents; `STATUS_STYLE` = today's `STATUS_CONFIG` (lines 162–169); `halfDaySessionLabel(session)` and `halfDayWindowLabel(start, end)` (today's lines 181–190).

- [ ] **Step 1: Write the failing tests** in `tests/time-off-request-rules.test.ts`. Use a fixed `now = new Date(2026, 10, 11, 10)` (local Wed 11 Nov 2026) and a `leave(overrides)` builder.

```ts
test('toDateKey keeps the stored calendar day', () => {
  assert.equal(toDateKey('2026-11-19T00:00:00.000Z'), '2026-11-19')
  assert.equal(toDateKey('2026-11-19'), '2026-11-19')
  assert.equal(toDateKey('not a date'), '')
})
test('a leave can be cancelled until the day before its last day', () => {
  assert.equal(canCancelRequest(leave({ status: 'APPROVED', endDate: '2026-11-12T00:00:00.000Z' }), now), true)
  assert.equal(canCancelRequest(leave({ status: 'APPROVED', endDate: '2026-11-11T00:00:00.000Z' }), now), false)
  assert.equal(canCancelRequest(leave({ status: 'REJECTED', endDate: '2026-12-01T00:00:00.000Z' }), now), false)
})
test('only pending statuses are editable', () => {
  for (const s of ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED']) assert.equal(canEditRequest({ status: s }), true)
  for (const s of ['APPROVED', 'REJECTED', 'CANCELLED']) assert.equal(canEditRequest({ status: s }), false)
})
test('plan rule: 3E, half days and single sick days need none', () => {
  assert.equal(planRequiredFor(leave({ leaveType: 'ANNUAL' }), 'Product'), true)
  assert.equal(planRequiredFor(leave({ leaveType: 'ANNUAL' }), '3E'), false)
  assert.equal(planRequiredFor(leave({ leaveType: 'CASUAL', isHalfDay: true }), 'Product'), false)
  assert.equal(planRequiredFor(leave({ leaveType: 'SICK', startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z' }), 'Product'), false)
  // a lead's queue row uses the applicant's department, not the viewer's
  assert.equal(planRequiredFor({ ...leave({ leaveType: 'ANNUAL' }), employee: { id: 'x', name: 'X', department: '3E', position: null } }, 'Product'), false)
})
test('reminders cover leave starting in 0 to 3 days without a plan', () => {
  const rows = [
    leave({ id: 'today', startDate: '2026-11-11T00:00:00.000Z', endDate: '2026-11-13T00:00:00.000Z' }),
    leave({ id: 'in3', startDate: '2026-11-14T00:00:00.000Z', endDate: '2026-11-16T00:00:00.000Z' }),
    leave({ id: 'in4', startDate: '2026-11-15T00:00:00.000Z', endDate: '2026-11-17T00:00:00.000Z' }),
    leave({ id: 'done', startDate: '2026-11-12T00:00:00.000Z', transitionPlanSubmittedAt: '2026-11-10T09:00:00.000Z' }),
    leave({ id: 'rejected', status: 'REJECTED', startDate: '2026-11-12T00:00:00.000Z' }),
  ]
  assert.deepEqual(planReminderRequests(rows, 'Product', now).map((r) => r.id), ['today', 'in3'])
})
test('plan is editable before the leave starts unless submitted and not sent back', () => { /* not submitted → true; submitted+PENDING → false; submitted+DISAPPROVED → true; started → false; CANCELLED → false */ })
test('approval actions: approved leave can only be disapproved', () => {
  assert.deepEqual(approvalActions({ status: 'APPROVED' }), { showApprove: false, reject: 'disapprove', rejectLabel: 'Disapprove' })
  assert.deepEqual(approvalActions({ status: 'LEAD_APPROVED' }), { showApprove: true, reject: 'reject', rejectLabel: 'Reject' })
})
test('plan review states', () => { /* review / approved / missing / not-needed, one case each */ })
test('decision toasts', () => {
  assert.equal(decisionToast('approve'), 'Leave approved')
  assert.equal(decisionToast('reject', 'CANCELLED'), 'Leave cancelled')
  assert.equal(decisionToast('reject', 'REJECTED'), 'Leave rejected')
})
test('WFH can be cancelled until it has ended', () => { /* endDate today → true; yesterday → false; REJECTED → false */ })
```

- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/time-off-request-rules.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** the three files with the signatures above. Rules come from today's page lines noted; `localDayKey` from `lib/format-date.ts`; `transitionPlanRequired` from `lib/leave-transition-plan.ts`; `calculateLeaveDuration` from `lib/leave-utils.ts`; `hasWfhEnded` from `lib/wfh-utils.ts`. No React in `lib/time-off/*`.
- [ ] **Step 4: Run to verify they pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add lib/time-off/types.ts lib/time-off/request-rules.ts components/leave/time-off/leave-style.ts tests/time-off-request-rules.test.ts` · `refactor: extract time off request rules from the leave page`

---

### Task 2: Live summary and request form model

**Files:**
- Create: `lib/time-off/request-summary.ts`, `lib/time-off/request-form.ts`
- Modify: `lib/leave-transition-plan.ts` (rename private `MAX_ROWS` to exported `MAX_TRANSITION_TASKS = 50`; no other change)
- Test: `tests/time-off-request-summary.test.ts`, `tests/time-off-request-form.test.ts`

**Interfaces:**
- Consumes: Task 1 types and `LEAVE_TYPE_STYLE` labels are **not** used here (lib stays React-free); type labels come from `LEAVE_TYPE_LABEL: Record<LeaveType, string>` exported from `request-form.ts` (`Casual`, `Sick`, `Annual`); `leave-style.ts` should import that constant for its labels.
- Produces (`request-summary.ts`):
  - `interface LeaveSummaryInput { startDate: string; endDate: string; isHalfDay: boolean; holidayKeys: ReadonlySet<string>; remaining: number | null; total: number | null; balanceYear: number }` (dates are `YYYY-MM-DD`; `holidayKeys` are `leaveDateKey` values)
  - `type SummaryProblem = 'missing-dates' | 'end-before-start' | 'too-long' | 'no-working-days'`
  - `interface LeaveSummary { problem: SummaryProblem | null; workingDays: number; weekendDays: number; holidayDays: number; startKey: string; endKey: string; returnKey: string | null; sameDayReturn: boolean; balanceAfter: number | null; otherYear: boolean; overBalance: boolean }`
  - `summarizeLeaveRequest(input: LeaveSummaryInput): LeaveSummary` — `workingDays = calculateLeaveDuration(start, end, isHalfDay, holidayKeys)` (half day: end forced to start); `weekendDays` / `holidayDays` count the range's Sat/Sun and Mon–Fri holiday days (0 for half day unless that day is one); `returnKey` = `getNextBusinessDay(end)` as `YYYY-MM-DD` (half day: `startKey`, `sameDayReturn: true`) — same rule as today's `getReturnDateLabel`; `too-long` when the range exceeds 366 days; `balanceAfter = remaining - workingDays` only when `Number(startKey.slice(0,4)) === balanceYear` and `remaining !== null`, else `null` with `otherYear` true for a different year; `overBalance = balanceAfter !== null && balanceAfter < 0`.
- Produces (`request-form.ts`):
  - `interface RequestForm { leaveType: LeaveType; isHalfDay: boolean; halfDaySession: '' | HalfDaySession; unavailableStartTime: string; unavailableEndTime: string; startDate: string; endDate: string; reason: string; transitionPlan: string; tasks: TransitionTask[]; coverPersonIds: string[]; additionalNotifyIds: string[] }`
  - `EMPTY_REQUEST_FORM: RequestForm` (`CASUAL`, everything empty)
  - `isHalfDayEligible(type: LeaveType): boolean` — CASUAL or SICK
  - `withLeaveType(form, type)` — ANNUAL clears half day, session and times
  - `withHalfDay(form, on)` — on: `endDate = startDate` when start set; off: clears session and times
  - `withSession(form, session)` — fills empty times with `09:00`–`13:00` (FIRST_HALF) or `14:00`–`18:00` (SECOND_HALF); keeps typed times
  - `withDates(form, start, end)` — half day forces `endDate = start`
  - `formFromRequest(r: LeaveRequest): RequestForm` — today's `openEditModal` mapping (lines 849–866); `tasks` from `validateTransitionTasks` (empty on throw)
  - `isFormDirty(form: RequestForm): boolean` — differs from `EMPTY_REQUEST_FORM` in any field (used for the discard check)
  - `halfDayError(form): string | null` — today's three messages verbatim: `Select first half or second half`, `Enter unavailable start and end time for half-day leave`, `Unavailable end time must be after start time`
  - `type RequestStep = 1 | 2 | 3`; `stepError(step: RequestStep, form: RequestForm, summary: LeaveSummary): string | null` (exact copy below)
  - `toLeavePayload(form: RequestForm, timeZone: string)` — same keys and values as today's POST body (lines 651–664, `transitionPlan: form.transitionPlan || undefined`)
  - `toLeaveUpdatePayload(id: string, form: RequestForm, timeZone: string)` — today's PUT body (lines 894–908)

Step error copy (first failing check wins, in this order):

| Step | Check | Message |
|---|---|---|
| 1 | no start | `Pick your first day off` |
| 1 | no end (not half day) | `Pick your last day off` |
| 1 | `end-before-start` | `Your last day off is before your first day off` |
| 1 | `halfDayError` | (its message) |
| 1 | `too-long` | `Pick a shorter range` |
| 1 | `no-working-days` | `These dates have no working days to take off` |
| 1 | `overBalance` | `You have {formatDays(balanceAfter + workingDays)} of {label lower-case} leave left.` |
| 1 | reason empty after trim | `Add a reason` |
| 1 | reason > 4000 | `Keep the reason under 4,000 characters` |
| 2 | notes > 6000 | `Keep handover notes under 6,000 characters` |
| 2 | tasks > 50 | `A plan can have up to 50 tasks` |
| 3 | cover > 10 | `Choose up to 10 cover people` |
| 3 | notify > 20 | `Choose up to 20 people to notify` |

- [ ] **Step 1: Write the failing summary tests** (`tests/time-off-request-summary.test.ts`), base input `{ isHalfDay: false, holidayKeys: new Set(), remaining: 5, total: 10, balanceYear: 2026 }`:

```ts
test('Thu 19 to Mon 23 Nov: 3 working days, 2 weekend days, back Tue 24', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '2026-11-23' })
  assert.deepEqual([s.problem, s.workingDays, s.weekendDays, s.holidayDays, s.returnKey, s.balanceAfter], [null, 3, 2, 0, '2026-11-24', 2])
})
test('holidays from every touched month are counted', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-30', endDate: '2026-12-02', holidayKeys: new Set(['2026-11-30', '2026-12-01']) })
  assert.deepEqual([s.workingDays, s.holidayDays], [1, 2])
})
test('a half day counts 0.5 and returns the same day', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '2026-11-25', isHalfDay: true })
  assert.deepEqual([s.workingDays, s.endKey, s.returnKey, s.sameDayReturn, s.balanceAfter], [0.5, '2026-11-19', '2026-11-19', true, 4.5])
})
test('a half day on a Saturday has no working days', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-21', endDate: '2026-11-21', isHalfDay: true }).problem, 'no-working-days')
})
test('a weekend-only range has no working days', () => { /* 2026-11-21..22 → 'no-working-days', weekendDays 2 */ })
test('end before start and missing dates', () => { /* '2026-11-23'..'2026-11-19' → 'end-before-start'; ''..'' → 'missing-dates' */ })
test('over balance is flagged; next year shows no balance after', () => {
  assert.equal(summarizeLeaveRequest({ ...base, remaining: 2, startDate: '2026-11-19', endDate: '2026-11-23' }).overBalance, true)
  const next = summarizeLeaveRequest({ ...base, startDate: '2027-01-04', endDate: '2027-01-05' })
  assert.deepEqual([next.balanceAfter, next.otherYear, next.overBalance], [null, true, false])
})
test('ranges over a year are refused', () => { /* '2026-11-19'..'2027-12-01' → 'too-long' */ })
```

- [ ] **Step 2: Write the failing form tests** (`tests/time-off-request-form.test.ts`): `withLeaveType(…,'ANNUAL')` clears half-day fields; `withHalfDay(on)` copies start to end; `withSession('SECOND_HALF')` on empty times gives `14:00`/`18:00` and keeps `10:00` if typed; `withDates` under half day forces end = start; `halfDayError` returns each of the three messages; `stepError` returns each row of the table above (one assertion per row, built from `summarizeLeaveRequest`); `toLeavePayload` for a half-day Casual equals

```ts
{ leaveType: 'CASUAL', startDate: '2026-11-19', endDate: '2026-11-19', isHalfDay: true, requestTimezone: 'Asia/Karachi',
  halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00', reason: 'Clinic visit',
  transitionPlan: undefined, coverPersonIds: [], additionalNotifyIds: [] }
```
and for Annual sends `isHalfDay: false` with the three half-day keys `undefined` even if the form still holds stale values; `formFromRequest` maps a request with a legacy single `coverPerson` to `coverPersonIds: [id]`; `isFormDirty(EMPTY_REQUEST_FORM) === false` and `true` after `withDates`.

- [ ] **Step 3: Run both** → FAIL. `node --import tsx --test tests/time-off-request-summary.test.ts tests/time-off-request-form.test.ts`
- [ ] **Step 4: Implement** both modules (use `calculateLeaveDuration`, `getNextBusinessDay`, `isWeekendDate`, `leaveDateKey` from `lib/leave-utils.ts`; build dates with `new Date(Date.UTC(y, m - 1, d))` from the keys, never `new Date('YYYY-MM-DD')` local parsing) and the `MAX_TRANSITION_TASKS` export.
- [ ] **Step 5: Run** both plus `tests/leave-transition-plan.test.ts` → PASS.
- [ ] **Step 6: Commit** · `feat: add the time off live summary and request form model`

---

### Task 3: Balance cards

**Files:**
- Create: `lib/time-off/balance-cards.ts`, `components/leave/time-off/BalanceCards.tsx`
- Test: `tests/time-off-balance-cards.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `PENDING_STATUSES`, `requestDays`; Task 2 `LEAVE_TYPE_LABEL`; `formatDays`, `formatDateRange`.
- Produces (`balance-cards.ts`):
  - `interface BalanceCardModel { type: LeaveType; label: string; left: number; total: number; pendingDays: number; fraction: number /* 0..1 */; isEmpty: boolean; note: string }` — `note` = `Talk to HR if you need more` when `left <= 0`, else `Nothing pending` / `{formatDays(pendingDays)} pending`.
  - `buildBalanceCards(balance: LeaveBalance, requests: LeaveRequest[], balanceYear: number): BalanceCardModel[]` — order CASUAL, SICK, ANNUAL (ruling 12).
  - `interface NextLeaveModel { type: LeaveType; label: string; range: string; status: 'Approved' | 'Waiting for approval'; requestId: string }`
  - `nextLeave(requests: LeaveRequest[], now?: Date): NextLeaveModel | null` (ruling 13).
- Produces (`BalanceCards.tsx`): `BalanceCards({ cards, next, onOpenRequest }: { cards: BalanceCardModel[]; next: NextLeaveModel | null; onOpenRequest: (id: string) => void }): JSX.Element` — 4-column grid at `lg`, 2 at `sm`, 1 below. Each card: dot + label, `of {formatDays(total)}` top right, big number (`None` when empty) + `day left`/`days left` (via `daysLeftSuffix`'s first word), a 6px bar (`bg-muted` track, type colour fill, width `fraction * 100%`), note. Decimals shown as today (`4.5`). "Your next leave" card: label, type and range, status; clicking it calls `onOpenRequest(requestId)`; empty copy from ruling 13.

- [ ] **Step 1: Failing tests:**

```ts
test('casual 5 left of 10 with nothing pending', () => {
  const [casual] = buildBalanceCards(balance({ casualDays: 10, casualUsed: 5 }), [], 2026)
  assert.deepEqual([casual.left, casual.total, casual.note, casual.fraction], [5, 10, 'Nothing pending', 0.5])
})
test('no sick left asks the person to talk to HR', () => { /* sickDays 6, sickUsed 6 → isEmpty, note 'Talk to HR if you need more' */ })
test('pending counts only this year and only waiting statuses', () => {
  // two PENDING casual (2 and 0.5 days via leaveDays), one APPROVED, one PENDING in 2027 → '2.5 days pending'
})
test('next leave is the earliest one not yet over', () => { /* ended → skipped; CANCELLED → skipped; picks earliest; status label */ })
test('the cards read "5 days left" and "of 10 days"', () => {
  const html = renderToStaticMarkup(createElement(BalanceCards, { cards: buildBalanceCards(balance({ casualUsed: 5 }), [], 2026), next: null, onOpenRequest: () => {} }))
  assert.match(html, />5<\/span>\s*<span[^>]*>days left/)
  assert.match(html, /of 10 days/)
  assert.match(html, /Nothing booked/)
  assert.doesNotMatch(html, /\d+ \/ \d+/)
})
```
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-balance-cards.test.ts` → FAIL.
- [ ] **Step 3: Implement** model and component (no framer-motion needed; `app/(evaluator)/template.tsx` animates pages).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** · `feat: show time off balances as days left cards`

---

### Task 4: Calendar grid and range selection (pure)

**Files:**
- Create: `lib/time-off/calendar-grid.ts`, `lib/time-off/range-select.ts`
- Test: `tests/time-off-calendar-grid.test.ts`, `tests/time-off-range-select.test.ts`

**Interfaces:**
- Produces (`calendar-grid.ts`):
  - `BUSY_DAY_THRESHOLD = 5`, `MAX_CHIPS = 3`
  - `interface GridDay { key: string /* YYYY-MM-DD */; day: number; inMonth: boolean; isWeekend: boolean }`
  - `buildMonthGrid(year: number, monthIndex: number): GridDay[]` — Monday first; `length % 7 === 0`; only the weeks the month touches. Keys built arithmetically (no `toISOString` of local dates).
  - `eventsOnDay(events: CalendarEvent[], key: string): CalendarEvent[]` — `toDateKey(start) <= key <= toDateKey(end)`, sorted current user first, then name.
  - `filterEventsByDepartment(events, filter: string /* 'ALL' or a department */): CalendarEvent[]` — today's rule (own leave always kept; trims).
  - `calendarDepartments(users: DirectoryUser[], events: CalendarEvent[]): string[]` — today's lines 447–458.
  - `interface DayCell extends GridDay { isToday: boolean; isPast: boolean; selectable: boolean; events: CalendarEvent[]; visible: CalendarEvent[]; moreCount: number; outCount: number; busy: boolean }` — `selectable = inMonth && !isPast`; padding days get no events (ruling 2); `outCount` = distinct `employeeId`.
  - `buildDayCells(grid: GridDay[], events: CalendarEvent[], todayKey: string): DayCell[]`
  - `monthsBetween(startKey: string, endKey: string): Array<{ year: number; month: number /* 0-11 */ }>` — inclusive, `[]` when invalid or end < start, capped at 13 entries.
  - `outToday(events: CalendarEvent[], todayKey: string): CalendarEvent[]` — APPROVED, not current user (today's lines 1552–1558).
- Produces (`range-select.ts`):
  - `type RangeState = { phase: 'idle' } | { phase: 'dragging'; anchor: string; current: string } | { phase: 'picking-end'; anchor: string }`
  - `type RangeEvent = { type: 'down' | 'enter' | 'up'; key: string } | { type: 'cancel' }`
  - `interface RangeResult { state: RangeState; commit: { start: string; end: string } | null }`
  - `reduceRange(state: RangeState, event: RangeEvent, selectable: (key: string) => boolean): RangeResult`
  - `previewRange(state: RangeState): { start: string; end: string } | null` — ordered.
  - Rules: `down` on an unselectable key does nothing. `down` while `picking-end`: key ≥ anchor → commit `{anchor, key}` and idle; key < anchor → `picking-end` with the new anchor (today's reset). Otherwise `down` → `dragging {anchor: key, current: key}`. `enter` while dragging on a selectable key → `current = key`. `up` while dragging: `current !== anchor` → commit ordered `{min, max}`, idle; else → `picking-end {anchor}` (a click). `cancel` → idle. `up` in any other phase does nothing.

- [ ] **Step 1: Failing grid tests:**

```ts
test('November 2026 starts on Mon 26 Oct and has 6 weeks', () => {
  const grid = buildMonthGrid(2026, 10)
  assert.equal(grid[0].key, '2026-10-26'); assert.equal(grid.length, 42); assert.equal(grid.at(-1)!.key, '2026-12-06')
  assert.equal(grid.find((d) => d.key === '2026-11-21')!.isWeekend, true)
})
test('February 2027 fits in 4 weeks', () => { /* starts Mon 1 Feb 2027 → length 28 */ })
test('events spanning months appear on both months\' days', () => {
  const e = event({ startDate: '2026-11-30T00:00:00.000Z', endDate: '2026-12-02T00:00:00.000Z' })
  assert.equal(eventsOnDay([e], '2026-11-30').length, 1); assert.equal(eventsOnDay([e], '2026-12-02').length, 1)
})
test('day keys never pass through local Date for stored values', () => {
  // a stored UTC-midnight leave sits on its own day whatever TZ the test runs in
  assert.equal(eventsOnDay([event({ startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z' })], '2026-11-18').length, 0)
})
test('cells: 3 chips, +N more, distinct people out, busy at 5', () => { /* 6 events on one day, two from one person → visible 3, moreCount 3, outCount 5, busy true; own event first */ })
test('padding and past days are not selectable and carry no events', () => { /* todayKey '2026-11-11': '2026-11-10' isPast, '2026-10-30' !inMonth → both selectable false; padding events [] */ })
test('department filter keeps your own leave', () => { /* filter 'Design' keeps Design + isCurrentUser rows */ })
test('monthsBetween crosses a year', () => {
  assert.deepEqual(monthsBetween('2026-12-28', '2027-01-04'), [{ year: 2026, month: 11 }, { year: 2027, month: 0 }])
  assert.deepEqual(monthsBetween('2026-12-28', '2026-12-01'), [])
})
test('out today: approved colleagues only', () => { /* pending and own excluded */ })
```
- [ ] **Step 2: Failing range tests:** `a click then a later click commits the range`; `a click then an earlier click restarts from the earlier day`; `dragging forwards commits on release`; `dragging backwards orders the range` (down 23, enter 19, up → `{start:'…19', end:'…23'}`); `entering an unselectable day keeps the last good day`; `pressing on a past day does nothing`; `cancel clears`; `previewRange orders a backwards drag`.
- [ ] **Step 3: Run** `node --import tsx --test tests/time-off-calendar-grid.test.ts tests/time-off-range-select.test.ts` → FAIL.
- [ ] **Step 4: Implement** both modules.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** · `feat: add the time off calendar grid and range selection`

---

### Task 5: Calendar components

**Files:**
- Create: `components/leave/time-off/CalendarDayCell.tsx`, `components/leave/time-off/TeamCalendar.tsx`, `components/leave/time-off/DayLeaveDialog.tsx`
- Test: `tests/time-off-calendar-ui.test.ts`

**Interfaces:**
- Consumes: Task 4 `DayCell`, `buildMonthGrid`, `buildDayCells`, `filterEventsByDepartment`, `calendarDepartments`, `reduceRange`, `previewRange`, `RangeState`; Task 1 `LEAVE_TYPE_STYLE`, `STATUS_STYLE`, `halfDaySessionLabel`, `halfDayWindowLabel`; existing `CalendarDayMarkers`, `CalendarMarkerLegend`, `birthdayLabel` from `components/leave/CalendarDayMarkers.tsx` (unchanged).
- Produces:
  - `CalendarDayCell({ cell, holidays, birthdays, selected, onMoreClick }: { cell: DayCell; holidays: CalendarHoliday[]; birthdays: CalendarBirthday[]; selected: boolean; onMoreClick: (cell: DayCell) => void }): JSX.Element` — root `<div role="gridcell" data-day={cell.key} aria-selected={selected} aria-disabled={!cell.selectable} tabIndex={cell.selectable ? 0 : -1}>`; top row: day number (today = `bg-foreground text-background rounded-full` pill), `{outCount} out` at right when > 0 (busy style from ruling 4); holiday name in the top row (the `CalendarDayMarkers` component renders holidays and birthdays — keep it, placed under the number); chips `LEAVE_TYPE_STYLE[type].chip`, text = first name or `You`, `+ ' ½'` for half days, `title` = `{name} - {Type}{ (First half)}`; pending chips `opacity-60`; own chips `ring-1 ring-primary`; `+N more` is a `<button type="button">` that stops pointer/click propagation and calls `onMoreClick`. Selected range: `bg-primary/10 ring-2 ring-inset ring-primary`. Weekend: `bg-muted/40`. Past or padding: `opacity-50`.
  - `TeamCalendar(props: TeamCalendarProps): JSX.Element` with `interface TeamCalendarProps { year: number; month: number; onMonthChange: (year: number, month: number) => void; events: CalendarEvent[]; holidays: CalendarHoliday[]; birthdays: CalendarBirthday[]; users: DirectoryUser[]; viewerDepartment: string | null; departmentFilter: string; onDepartmentFilterChange: (value: string) => void; selection: { start: string; end: string } | null; onRangeCommit: (range: { start: string; end: string }) => void; panelOpen: boolean }`.
    - Toolbar: prev/next icon buttons (`aria-label` `Previous month` / `Next month`), `formatMonthYear` title, the department control (ruling 5), the hint (`Drag across days, or click the first and last day off.`; while `picking-end`: `Now click your last day off.` + a `Cancel` text button dispatching `cancel`; while `panelOpen`: `**Drag again** to change the dates.`), legend (Casual, Sick, Annual dots; `CalendarMarkerLegend`; "Your requests" swatch with `ring-1 ring-primary`).
    - Grid: weekday header `Mon … Sun`; cells from `buildDayCells(buildMonthGrid(year, month), filterEventsByDepartment(events, departmentFilter), localDayKey(new Date()))`; birthdays map by `day` for `inMonth` cells; holidays by `key`.
    - Pointer wiring: `onPointerDown` (primary button only; `e.currentTarget.releasePointerCapture(e.pointerId)` when captured so `pointerenter` reaches siblings) → `down`; `onPointerEnter` → `enter`; `onPointerUp` → `up`; a `window` `pointerup` listener while dragging dispatches `up` with the last `current` key. Keyboard: Enter/Space on a cell dispatches `down` then `up`. A commit calls `onRangeCommit`. Highlight = `previewRange(state)` while selecting, else `selection`.
  - `DayLeaveDialog({ open, dayKey, events, onClose }): JSX.Element` — `Modal` titled `Team on leave · {formatDate(dayKey)}`, today's list (lines 2128–2163) with `You`, type, department, half-day session and window, status badge.

- [ ] **Step 1: Failing render tests:**

```ts
test('a colleague\'s annual leave chip is emerald and shows only the first name', () => {
  const html = renderCell(cellWith([event({ employeeName: 'Rhea Castillo', leaveType: 'ANNUAL', isCurrentUser: false, status: 'APPROVED' })]))
  assert.match(html, /bg-emerald-100[^"]*"[^>]*>Rhea</)
  assert.doesNotMatch(html, /Castillo</)
})
test('own chips say You and carry the primary ring; pending chips are faded', () => { /* isCurrentUser PENDING → 'You', 'ring-primary', 'opacity-60' */ })
test('half days are marked ½', () => { /* chip text 'Rhea ½', title contains '(First half)' */ })
test('+N more and N out', () => { /* 5 events → '+2 more', '5 out' with 'text-amber-700' */ })
test('cells expose their day for pointer and e2e use', () => { /* data-day="2026-11-19" */ })
```
(`renderCell` = `renderToStaticMarkup(createElement(CalendarDayCell, { cell, holidays: [], birthdays: [], selected: false, onMoreClick: () => {} }))`.)
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-calendar-ui.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three components.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` → no errors in the new files.
- [ ] **Step 5: Commit** · `feat: team calendar with type-coloured chips and drag to select`

---

### Task 6: Fetch client, page params and data hook

**Files:**
- Create: `lib/time-off/api.ts`, `lib/time-off/page-params.ts`, `components/leave/time-off/useTimeOffData.ts`
- Test: `tests/time-off-api.test.ts`, `tests/time-off-page-params.test.ts`

**Interfaces:**
- Produces (`api.ts`) — every call today's page makes, same URL, method and body:
  - `type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string }`
  - `readResult<T>(res: Response, fallback: string): Promise<ApiResult<T>>` — ok only when `res.ok && body.success !== false`; error = `body.error || fallback`; a non-JSON body gives `fallback`.
  - `call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<ApiResult<T>>` — wraps `fetch`; a thrown fetch gives `{ ok: false, error: fallback }`.
  - `submitLeave(payload)`: POST `/api/leave/requests` (fallback `Failed to submit request`), returns `{ request: { id: string } }`
  - `updateLeave(payload)`: PUT `/api/leave/requests` (`Failed to update leave request`)
  - `cancelLeave(id)`: DELETE `/api/leave/requests?id=${encodeURIComponent(id)}` (`Failed to cancel`)
  - `decideLeave(requestId, action: 'approve' | 'reject')`: POST `/api/leave/approve` `{ requestId, action }` (`Failed to process request`), returns `{ status?: string }`
  - `saveTransitionPlanDraft(id, tasks)`: PUT `/api/leave/requests/${id}/transition-plan` `{ tasks }` (`Failed to save draft`)
  - `submitTransitionPlan(id, tasks)`: POST same URL (`Failed to submit transition plan`)
  - `reviewTransitionPlan(id, action: 'APPROVE' | 'DISAPPROVE', reason: string)`: POST `/api/leave/requests/${id}/transition-plan/review` `{ action, reason }` (`Failed to review transition plan`)
  - `submitWfh(body)`: POST `/api/wfh/requests` `{ startDate, endDate, requestTimezone, reason, workPlan: workPlan || undefined }` (`Failed to submit WFH request`)
  - `cancelWfh(id)`: DELETE `/api/wfh/requests?id=…` (`Failed to cancel WFH request`)
  - `decideWfh(requestId, action)`: POST `/api/wfh/approve` (`Failed to process WFH request`)
  - `loadTimeOff(): Promise<ApiResult<TimeOffSnapshot>>` with `interface TimeOffSnapshot { balance: LeaveBalance | null; requests: LeaveRequest[]; users: DirectoryUser[]; approvals: ApprovalRequest[]; wfhRequests: WfhRequest[]; wfhApprovals: WfhRequest[] }` — today's six parallel GETs (lines 336–343); a failing WFH or approvals call yields `[]` for that list rather than failing the page; a failing balance or own-requests call fails with `Could not load your time off. Refresh to try again.`
  - `loadCalendarMonth(year, month): Promise<ApiResult<{ events: CalendarEvent[]; holidays: CalendarHoliday[]; birthdays: CalendarBirthday[] }>>` — GET `/api/leave/calendar?month=${month}&year=${year}`.
- Produces (`page-params.ts`):
  - `interface TimeOffParams { openRequest: boolean; requestId: string }`
  - `parseTimeOffParams(params: Pick<URLSearchParams, 'get'>): TimeOffParams` — `openRequest` when `request` is `1` or `true`; `requestId` trimmed.
  - re-export `resolveLeaveRequestDeepLinkTarget` usage as `deepLinkTarget(requestId, approvals: {id: string}[], own: {id: string}[])` returning `'approval' | 'own' | 'unavailable'` (delegates to `lib/leave-deep-links.ts`).
  - `DEEP_LINK_UNAVAILABLE = 'This leave request is no longer waiting for your action, or you do not have access to it.'` (today's copy)
- Produces (`useTimeOffData.ts`, `'use client'`): `useTimeOffData(enabled: boolean)` returning `{ loading: boolean; snapshot: TimeOffSnapshot; reload(): Promise<void>; calendar: { year; month; events; holidays; birthdays }; setMonth(year, month): void; reloadCalendar(): Promise<void>; holidayKeysFor(startKey: string, endKey: string): Promise<Set<string>> }`. `holidayKeysFor` uses `monthsBetween` and a `useRef<Map<'YYYY-M', string[]>>` cache filled by both calendar loads and its own fetches (ruling 10); failures toast once `Could not load holidays for the summary.` and count no holidays. Load failures `toast.error` with the API message; calendar failures `console.error` plus a muted line under the calendar `Could not load the calendar. Try another month or refresh.`

- [ ] **Step 1: Failing API tests** — stub `globalThis.fetch` per test (restore in `afterEach`), record `[url, init]`:

```ts
test('submitLeave posts the payload and returns the new id', async () => {
  stub(() => json({ success: true, request: { id: 'lr1' } }))
  const r = await submitLeave({ leaveType: 'ANNUAL' } as never)
  assert.deepEqual(r, { ok: true, data: { success: true, request: { id: 'lr1' } } })
  assert.equal(calls[0][0], '/api/leave/requests'); assert.equal(calls[0][1].method, 'POST')
})
test('server errors pass through; network errors use the fallback', async () => {
  stub(() => json({ error: 'Insufficient annual leave balance. Available: 2 days, Requested: 3 days' }, 400))
  assert.deepEqual(await submitLeave({} as never), { ok: false, error: 'Insufficient annual leave balance. Available: 2 days, Requested: 3 days' })
  stub(() => { throw new TypeError('fetch failed') })
  assert.deepEqual(await cancelLeave('x'), { ok: false, error: 'Failed to cancel' })
})
test('every endpoint keeps its URL and method', async () => { /* table of [fn call, url, method, body] for all 11 writers */ })
test('loadTimeOff tolerates a failing approvals call', async () => { /* approvals 500 → ok with approvals [] */ })
```
- [ ] **Step 2: Failing params tests:** `?request=1` and `?request=true` open; `?request=0` does not; `?requestId=%20abc%20` → `abc`; `approval queue wins over own list` (`deepLinkTarget('a', [{id:'a'}], [{id:'a'}]) === 'approval'`); unknown → `unavailable`.
- [ ] **Step 3: Run** `node --import tsx --test tests/time-off-api.test.ts tests/time-off-page-params.test.ts` → FAIL.
- [ ] **Step 4: Implement** the three files.
- [ ] **Step 5: Run** → PASS; `npx tsc --noEmit` clean for these files.
- [ ] **Step 6: Commit** · `feat: typed time off fetch client and page params`

---

### Task 7: The 3-step request panel

**Files:**
- Create: `components/leave/time-off/RequestPanel.tsx`, `DatesTypeStep.tsx`, `HandoverStep.tsx`, `PeopleReviewStep.tsx`, `RequestSummaryBox.tsx` (all under `components/leave/time-off/`)
- Modify: `components/leave/MemberMultiSelect.tsx` (optional `max?: number`: when `selectedIds.length >= max` the search input is disabled and shows `Up to {max} people`), `components/leave/TransitionPlanTable.tsx` (hide "Add task" at `MAX_TRANSITION_TASKS` and show `Up to 50 tasks`)
- Test: `tests/time-off-request-panel.test.ts`

**Interfaces:**
- Consumes: Task 2 (`RequestForm`, `withLeaveType`, `withHalfDay`, `withSession`, `withDates`, `stepError`, `toLeavePayload`, `toLeaveUpdatePayload`, `formFromRequest`, `isFormDirty`, `summarizeLeaveRequest`, `LEAVE_TYPE_LABEL`, `isHalfDayEligible`), Task 1 (`planRequiredFor`), Task 6 (`submitLeave`, `updateLeave`, `submitTransitionPlan`), `detectBrowserLeaveTimeZone`, `canSubmitTransitionPlan`, `ConfirmDialog`.
- Produces:
  - `type PanelMode = { kind: 'create' } | { kind: 'edit'; request: LeaveRequest }`
  - `interface RequestPanelProps { open: boolean; mode: PanelMode; initialRange: { start: string; end: string } | null; balance: LeaveBalance | null; balanceYear: number; viewerDepartment: string | null; viewerId: string; users: DirectoryUser[]; holidayKeysFor: (startKey: string, endKey: string) => Promise<Set<string>>; onClose: () => void; onSaved: () => void }`
  - `RequestPanel(props): JSX.Element | null` — owns `form` and `step` state. Opening in create mode starts from `EMPTY_REQUEST_FORM` then `withDates(initialRange)`; in edit mode from `formFromRequest`. When `initialRange` changes while open, only the dates change (ruling 7). Recomputes holiday keys (`holidayKeysFor`) when dates change and feeds `summarizeLeaveRequest` (`remaining` and `total` for the chosen type from `balance`).
    - Root: `<section aria-labelledby="request-panel-title" className="… lg:sticky lg:top-6 …">` plus the small-screen layer classes of ruling 6. Header: title `Request leave` / `Edit request`, close button `aria-label="Close"`. Stepper: three labelled segments `1. Dates and type`, `2. Handover`, `3. People and review`; the current one `aria-current="step"` with a `bg-primary` bar; earlier steps are buttons that go back; later steps are not clickable.
    - Footer: `Back` (steps 2–3); primary `Next: Handover` / `Next: People and review` / `Submit request` (create) / `Save changes` (edit). Next runs `stepError(step, form, summary)`; an error renders under the footer as `<p role="alert" className="text-sm text-destructive">` and the step does not change.
    - Close: `isFormDirty(form)` (create) or any field changed from `formFromRequest` (edit) → ConfirmDialog of ruling 8, else `onClose()`. `Escape` → same.
    - Submit (create): `submitLeave(toLeavePayload(form, detectBrowserLeaveTimeZone()))`; on success, if `canSubmitTransitionPlan(form.tasks)` call `submitTransitionPlan(newId, form.tasks)` and on failure `toast.warning` (ruling 18); `toast.success('Leave request submitted!')`; `onSaved()`. Failure → `toast.error(error)` and stay on step 3.
    - Save (edit): `updateLeave(toLeaveUpdatePayload(request.id, form, tz))`; `toast.success('Leave request updated')`; `onSaved()`.
  - `DatesTypeStep({ form, onChange, summary, balance })` — "Dates" with helper `Drag on the calendar, or type the dates.`; `First day off` (`id="leave-start"`), `Last day off` (`id="leave-end"`, `min` = start, disabled under half day); `RequestSummaryBox`; "Leave type" `role="radiogroup" aria-label="Leave type"` of three `role="radio" aria-checked` tiles (label + `{n} left` / `None left` in red); under them `{Type} after this request` + `formatDaysLeft(balanceAfter, total)` with a bar, or `Next year's balance applies` (ruling 11); half-day block exactly as today (checkbox disabled for Annual, copy `Available for Casual and Sick only. Half-day leave counts as 0.5 day.`, Session select `First Half` / `Second Half`, `Unavailable From` / `Unavailable To` time inputs); "Reason" textarea `id="leave-reason"` with ruling 1 helper and placeholder `Brief description of why you need this leave...`.
  - `RequestSummaryBox({ summary }: { summary: LeaveSummary })` — `formatDateRange(startKey, endKey)` headline; `{formatDays(workingDays)}` as `N working day(s)`; `{n} weekend day(s) not counted` when > 0; `{n} holiday(s) not counted` when > 0; `Back {formatDate(returnKey)}` (half day: `Back the same day`). Nothing rendered while `problem === 'missing-dates'`.
  - `HandoverStep({ form, onChange, planRequired, mode })` — create: a notice (`role="status"`) — required: `This leave needs a transition plan. You can add it now or later from My requests, before your leave starts.`; not required: `No transition plan is needed for this leave. You can still add one.`; then `TransitionPlanTable` bound to `form.tasks` and "General handover notes (optional)" textarea `id="leave-notes"`, placeholder `Any extra context for whoever covers your work.`. Edit: notes only plus `The structured transition plan is managed from the request details.`
  - `PeopleReviewStep({ form, onChange, users, viewerId, summary, mode })` — "Cover people (optional)" `MemberMultiSelect max={10}` with `Selected cover teammates will be notified by email.`; "People to notify (optional)" `MemberMultiSelect max={20}` with `These people will receive an email notification. Approval still goes to your lead and HR only.`; pools exclude `viewerId`; a full summary list: type, `RequestSummaryBox`, half-day session and window, reason, plan (`{n} tasks` / `No plan yet`), notes (first line), cover names, notify names; edit-mode line from ruling 9.

- [ ] **Step 1: Failing render tests** (static render of the step components with fixed props; `RequestPanel` itself is covered by e2e):

```ts
test('summary box reads like the mockup', () => {
  const html = renderToStaticMarkup(createElement(RequestSummaryBox, { summary: summarizeLeaveRequest({ startDate: '2026-11-19', endDate: '2026-11-23', isHalfDay: false, holidayKeys: new Set(), remaining: 5, total: 10, balanceYear: 2026 }) }))
  assert.match(html, /Thu 19 – Mon 23 Nov/); assert.match(html, /3 working days/); assert.match(html, /2 weekend days not counted/); assert.match(html, /Back Tue 24 Nov/)
})
test('half day summary says back the same day', () => { /* 'Back the same day', '0.5 working days' */ })
test('step 1 tiles show days left and None left', () => { /* sick remaining 0 → 'None left'; role="radio" x3; Annual checked has aria-checked="true" */ })
test('step 1 reason helper is truthful', () => { /* contains 'Your lead, HR and the people you add in step 3 see this' and not 'Only your lead and HR' */ })
test('step 1 balance after uses the words form', () => { /* casual 5 left, 3 days → '2 days left of 10' */ })
test('step 2 says whether a plan is needed', () => { /* planRequired true/false copy */ })
test('step 3 lists cover and notify limits', () => { /* MemberMultiSelect with 10 selected cover → 'Up to 10 people' */ })
```
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-request-panel.test.ts` → FAIL.
- [ ] **Step 3: Implement** the five components and the two small limit props. Steps take plain props and render no portal, so they are tested directly; `ConfirmDialog` lives only in `RequestPanel`.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** · `feat: 3-step request leave panel with live summary`

---

### Task 8: My requests and request details

**Files:**
- Create: `components/leave/time-off/MyRequests.tsx`, `components/leave/time-off/RequestDetailsDialog.tsx`
- Test: `tests/time-off-my-requests.test.ts`

**Interfaces:**
- Consumes: Task 1 (`canEditRequest`, `canCancelRequest`, `planEditable`, `requestCoverPeople`, `requestDays`, styles), Task 6 (`cancelLeave`, `saveTransitionPlanDraft`, `submitTransitionPlan`), `TransitionPlanTable`, `TransitionPlanView`, `ConfirmDialog`, `Modal`.
- Produces:
  - `MyRequests({ requests, onView, onEdit, onCancel }: { requests: LeaveRequest[]; onView: (r: LeaveRequest) => void; onEdit: (r: LeaveRequest) => void; onCancel: (r: LeaveRequest) => void }): JSX.Element` — card `id="my-requests"`, heading `My requests`; rows as today (type icon, label, status badge, `formatDateRange · formatDays(requestDays)`, `Back {date}` (half day: same day), half-day session/window), actions `View details`, `Edit` (`canEditRequest`), `Cancel request` (`canCancelRequest`). Empty: `No requests yet` / `Drag across days on the calendar, or use Request leave.`
  - `RequestDetailsDialog({ request, users, onClose, onEdit, onCancel, onChanged }: { request: LeaveRequest | null; users: DirectoryUser[]; onClose: () => void; onEdit: (r: LeaveRequest) => void; onCancel: (r: LeaveRequest) => void; onChanged: () => void })` — `Modal` `Leave request details`, every field today shows (lines 2189–2350: type, status, first/last day, expected return, duration, half-day details, reason, transition plan, cover people, additional notifications), plan section: `planEditable` → disapproval reason box (`Team Lead asked for changes:`), `TransitionPlanTable`, `Save draft` and `Submit transition plan` / `Resubmit plan` (disabled until `canSubmitTransitionPlan`), toasts `Transition plan draft saved` / `Transition plan submitted` / `Add at least one task before submitting`; else `TransitionPlanView`. Footer: `Edit request`, `Cancel request`, `Close`.
- Cancel confirmation (owned by the page, Task 11): ConfirmDialog `title="Cancel this leave request?"`, `message="Any days already taken from your balance go back, and the leave comes off the calendar."`, `confirmText="Cancel request"`, `cancelText="Keep it"`, `variant="danger"`; on confirm `cancelLeave(id)` → `toast.success('Request cancelled')` and reload both data and calendar.

- [ ] **Step 1: Failing render tests:** a PENDING future request shows `Edit` and `Cancel request`; an APPROVED request ending today shows neither; a REJECTED request shows only `View details`; duration shows `0.5 days` for a half day and `3 days` for Thu–Mon; the details dialog for a submitted plan with lead status PENDING renders the read-only view (no `Save draft`), for DISAPPROVED renders `Team Lead asked for changes:` and `Resubmit plan`; details list `Additional notifications` with names from `users`; no `/ ` count anywhere.
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-my-requests.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `Modal` and `Dialog` render through a Radix portal, so static render shows nothing: export the dialog's inner body as `RequestDetailsBody` (same props minus `onClose`, request non-null) and test that; the dialog wraps it.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** · `feat: my requests list and request details for time off`

---

### Task 9: Approval queue and plan review dialogs

**Files:**
- Create: `components/leave/time-off/ApprovalQueue.tsx`, `components/leave/time-off/PlanDisapproveDialog.tsx`, `components/leave/time-off/OutTodayCard.tsx`
- Test: `tests/time-off-approvals.test.ts`

**Interfaces:**
- Consumes: Task 1 (`approvalActions`, `planReviewState`, `requestDays`, `decisionToast`, styles), Task 6 (`decideLeave`, `reviewTransitionPlan`), `TransitionPlanView`, `ConfirmDialog`, `Dialog` from `components/ui/dialog.tsx`.
- Produces:
  - `ApprovalQueue({ requests, highlightedId, onChanged }: { requests: ApprovalRequest[]; highlightedId: string; onChanged: () => Promise<void> }): JSX.Element | null` — `null` when empty. Heading `Team approvals`, sub `Requests waiting for you`. Each row keeps today's `id="leave-approval-{id}"`, `tabIndex={-1}`, `aria-current` and highlight ring, `Opened from email` line when highlighted; name, status, `{Type} · {range} · {formatDays}`, half-day line, reason; buttons per `approvalActions` (`Approve` / `Reject` / `Disapprove`), disabled while that row is processing; Disapprove opens ConfirmDialog `title="Disapprove {first name}'s approved leave?"`, `message="It is cancelled, the days go back to their balance and it comes off the calendar."`, `confirmText="Disapprove"`, `variant="danger"`. Plan block by `planReviewState`: `review` → `TransitionPlanView` + `Approve plan` / `Disapprove plan`; `approved` → view only; `missing` → `No transition plan submitted yet.`; `not-needed` → `No transition plan needed for this leave.` After any decision: toast (`decisionToast` / `Transition plan approved` / `Transition plan disapproved`) and `await onChanged()`.
  - `PlanDisapproveDialog({ open, employeeName, onCancel, onSubmit }: { open: boolean; employeeName: string; onCancel: () => void; onSubmit: (reason: string) => Promise<void> })` — title `Send the plan back to {employeeName}?`, textarea label `What should change?` (`id="plan-disapprove-reason"`, required), buttons `Cancel` / `Send back` (disabled while the trimmed reason is empty or submitting). Replaces `window.prompt`.
  - `OutTodayCard({ events }: { events: CalendarEvent[] })` — `null` when empty; heading `Out today`; rows: type dot, name, `({Type}{, First half})` (today's lines 1574–1588).

- [ ] **Step 1: Failing render tests:** highlighted row has `id="leave-approval-lr1"`, `aria-current="true"` and `Opened from email`; APPROVED row shows `Disapprove` and no `Approve`; review state shows `Approve plan` and `Disapprove plan`; not-needed copy; `PlanDisapproveForm` (the exported body of `PlanDisapproveDialog`; Radix dialogs portal) renders `Send back` with `disabled` when the reason is empty; `OutTodayCard` renders `(Annual, First half)`.
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-approvals.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** · `feat: time off approval queue with dialogs for disapprovals`

---

### Task 10: WFH section (3E)

**Files:**
- Create: `components/leave/time-off/WfhSection.tsx`, `components/leave/time-off/WfhRequestDialog.tsx`
- Test: `tests/time-off-wfh.test.ts`

**Interfaces:**
- Consumes: Task 1 (`canCancelWfhRequest`, `STATUS_STYLE`), Task 6 (`submitWfh`, `cancelWfh`, `decideWfh`), `calculateWfhDays`, `isThreeEDepartment`, `detectBrowserLeaveTimeZone`, `ConfirmDialog`, `Modal`.
- Produces:
  - `WfhSection({ isThreeE, requests, approvals, onRequest, onChanged }: { isThreeE: boolean; requests: WfhRequest[]; approvals: WfhRequest[]; onRequest: () => void; onChanged: () => Promise<void> }): JSX.Element | null` — shown when `isThreeE || requests.length > 0 || approvals.length > 0` (today's rule). "My WFH requests" card when `isThreeE || requests.length > 0`, sub `Separate from leave balances. Available for 3E team members only.`, `Request WFH` button for 3E; rows as today (range · `formatDays(calculateWfhDays)`, reason, `Work plan: …`, `Cancel request` while `canCancelWfhRequest`); empty `No WFH requests yet`. Cancel → ConfirmDialog `title="Cancel this WFH request?"`, `confirmText="Cancel request"`, `cancelText="Keep it"` → `cancelWfh` → `WFH request cancelled`. "WFH approvals" card (`Requests waiting for your review`) with `Approve` / `Reject` → `decideWfh` → `WFH approved` / `WFH rejected`; button text `Working...` while processing.
  - `WfhRequestDialog({ open, onClose, onSubmitted })` — today's form (lines 2034–2111): sky note `WFH requests are separate from leave. They do not consume your leave balance.`, `Start Date`, `End Date` (`min` start), `Reason` (required), `Work Plan (optional)`; `Submit WFH Request`; success `WFH request submitted`.

- [ ] **Step 1: Failing render tests:** non-3E with no requests and no approvals → empty markup; non-3E with an approval → only the approvals card; 3E → `Request WFH`; an ended WFH has no `Cancel request`; durations read `2 days`.
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-wfh.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** · `feat: WFH requests and approvals on the time off page`

---

### Task 11: Assemble the page

**Files:**
- Modify (rewrite): `app/(evaluator)/leave/page.tsx`
- Test: `tests/time-off-page-source.test.ts`

**Interfaces:**
- Consumes: everything above; `PageContainer`, `PageHeader` (Part 2); `useLayoutUser` (`id`, `department`); `useSearchParams`, `useRouter`; `isThreeEDepartment`; `outToday`, `filterEventsByDepartment`; `planReminderRequests`; `parseTimeOffParams`, `deepLinkTarget`, `DEEP_LINK_UNAVAILABLE`.
- Produces: `export default function LeavePage()` (client). Layout:
  1. `PageContainer` (default width) → `PageHeader` with `dateLine={formatDate(localDayKey(new Date()))}`, `title="Time off"`, `subtitle="Plan leave, see who's around, and track your requests."` (3E: `Plan leave or work from home, see who's around, and track your requests. WFH does not use your leave balance.`), `actions`: `Request WFH` (outline, 3E only) and `Request leave` (primary).
  2. Plan reminder banner when `planReminderRequests(...)` is non-empty: amber card, title `Transition plan reminder`, text `{n} upcoming leave request(s) are missing a transition plan. Please add it before your leave starts.` plus an `Add plan` button opening the first one's details; and the one-time `toast.warning('Add transition plan for upcoming leave(s) before time off starts.')` (today's).
  3. `BalanceCards` (skeleton blocks from `components/ui/skeleton` while loading — the page never shows a full-screen loader).
  4. Grid: `TeamCalendar` + `RequestPanel` (ruling 6). `Request leave` and `?request=1` open it with no range; a range commit opens it (or updates its dates).
  5. `grid gap-6 lg:grid-cols-2`: `MyRequests`, `ApprovalQueue`, `OutTodayCard` (with the department-filtered events).
  6. `WfhSection`.
  7. Dialogs: `DayLeaveDialog`, `RequestDetailsDialog`, the cancel ConfirmDialog (Task 8 copy), `WfhRequestDialog`.
- Deep links: once loading is done, handle `requestId` exactly once per id (today's `handledDeepLinkRef` logic, lines 733–768: approval → highlight + scroll/focus on the next animation frame; own → open details; else `toast.info(DEEP_LINK_UNAVAILABLE)`). Handle `openRequest` once, then `router.replace` to the same URL without `request` (ruling 16).
- After any save/cancel/decision: reload snapshot and calendar (today reloads both after leave changes, snapshot only after WFH and plan changes; keep that).
- `?requestId=` plus `?request=1` together: deep link first, panel not opened.

- [ ] **Step 1: Failing source test** (`tests/time-off-page-source.test.ts`) — reads the page and every file in `components/leave/time-off/` and `lib/time-off/`:

```ts
const files = [PAGE, ...listTs('components/leave/time-off'), ...listTs('lib/time-off')]
test('every time off file stays under 800 lines and the page under 300', () => { /* each < 800; page < 300 */ })
test('no browser alert, confirm or prompt', () => {
  for (const f of files) assert.doesNotMatch(read(f), /\b(window\.)?(alert|confirm|prompt)\s*\(/, f)
})
test('nothing lost: every endpoint the old page called is still called', () => {
  const all = files.map(read).join('\n')
  for (const needle of ['/api/leave/balance', '/api/leave/requests?employeeId=me', "'/api/users'", '/api/leave/requests?forApproval=true',
    '/api/wfh/requests?employeeId=me', '/api/wfh/requests?forApproval=true', '/api/leave/calendar?month=', '/api/leave/approve',
    '/api/wfh/approve', '/transition-plan/review', '/transition-plan`', 'detectBrowserLeaveTimeZone', "method: 'PUT'", "method: 'DELETE'"])
    assert.ok(all.includes(needle), needle)
})
test('the page uses the shared frame and handles both deep links', () => {
  const page = read(PAGE)
  for (const needle of ['<PageContainer', '<PageHeader', 'parseTimeOffParams', 'deepLinkTarget', 'router.replace', 'leave-approval-']) assert.ok(page.includes(needle) || files.some((f) => read(f).includes(needle)), needle)
})
test('no slash counts in time off copy', () => { for (const f of files) assert.doesNotMatch(read(f), /\{[^}]+\}\s*\/\s*\{[^}]+\}\s*days/, f) })
```
- [ ] **Step 2: Run** `node --import tsx --test tests/time-off-page-source.test.ts` → FAIL (page still 2,592 lines, uses `confirm(`).
- [ ] **Step 3: Rewrite `page.tsx`** as described; delete nothing else.
- [ ] **Step 4: Run** the source test → PASS; `npx tsc --noEmit` → clean.
- [ ] **Step 5: Manual walk on the local test DB** (`DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test GMAIL_USER= GMAIL_APP_PASSWORD= GOOGLE_CALENDAR_REFRESH_TOKEN= npx next dev -p 3460`) with a fictional employee who has a lead and one 3E user. Tick each appendix "Time off" row against the running page (light and dark mode, 390px and 1440px widths): balances with half-day decimals; click-start/click-end, drag, the `Cancel` hint; `Request leave`; `/leave?request=1`; all step-1 fields incl. half day; plan table and notes; cover ≤ 10 and notify ≤ 20; details with every field; edit (back to PENDING); cancel through the dialog; lead queue Approve/Reject/Disapprove; plan Approve/Disapprove with the reason dialog; `/leave?requestId=<id>` as the lead (highlight) and as the owner (details); holidays and birthdays; department filter; pending faded; `½`; `+N more` dialog; WFH request, cancel, approve as lead.
- [ ] **Step 6: Commit** · `feat: rebuild the time off page around balances, calendar and a request panel`

---

### Task 12: Browser test for the main flows

**Files:**
- Create: `e2e/leave.spec.ts`
- Modify: `playwright.config.ts` (webServer `env`: add `GMAIL_USER: ''`, `GMAIL_APP_PASSWORD: ''`, `GOOGLE_CALENDAR_CLIENT_ID: ''`, `GOOGLE_CALENDAR_CLIENT_SECRET: ''`, `GOOGLE_CALENDAR_REFRESH_TOKEN: ''` after the spread, so a developer shell with real credentials never mails or books calendar events from a test run; Next's env loader does not override keys already present, even empty ones)

**Interfaces:**
- Consumes: `academyE2eSkipReason` from `e2e/academy-env.ts` (same database guard), `prisma` from `lib/db`, `bcryptjs`. Page hooks: `data-day`, `#leave-start`, `#leave-end`, `#leave-reason`, `role="radio"` tiles, button names from Tasks 7–9, `#plan-disapprove-reason`.
- Fixtures (ids prefixed `lve-`, fictional): `lve-staff` (Ana Torvik, `ana.lve@example.test`, EMPLOYEE, department `Product`), `lve-lead` (Layla Mercer, `layla.lve@example.test`, EMPLOYEE, `Product`), TEAM_LEAD mapping lead → staff. `beforeEach`: delete `RateLimit` rows `login:%` (as the Academy spec). `afterAll`: delete `LeaveRequest` and `LeaveBalance` rows whose `employeeId` starts with `lve-`, the mapping, the users; disconnect. Every DB statement is skipped when the guard refuses.
- Dates: `nextWeekday(offsetDays)` computed in the test from today so the leave is 10+ days ahead (outside the 0–3-day reminder window) and Mon–Wed of one week.

- [ ] **Step 1: Write `e2e/leave.spec.ts`** with these tests:
  1. `request leave through the three steps` (desktop and mobile projects): staff signs in → `/leave?request=1` → the panel heading `Request leave` is visible → fill `#leave-start` / `#leave-end` (Mon–Wed) → choose the `Annual` radio → fill `#leave-reason` → summary shows `3 working days` → `Next: Handover` → text `This leave needs a transition plan` → `Next: People and review` → `Submit request` → toast `Leave request submitted!` → `expect.poll` a `LeaveRequest` for `lve-staff` with status `PENDING`, `leaveType: 'ANNUAL'`; `page.url()` no longer contains `request=1`. On mobile also assert `document.documentElement.scrollWidth <= window.innerWidth`.
  2. `cancel asks in a dialog` (desktop): `My requests` → `Cancel request` → dialog `Cancel this leave request?` → `Cancel request` → poll status `CANCELLED`. Register `page.on('dialog', d => { throw new Error('native dialog: ' + d.message()) })` for every test.
  3. `drag across days opens the panel with those dates` (desktop): go to `/leave`, click `Next month`, drag with `page.mouse` from the cell `[data-day="<2nd Monday of next month>"]` to the Wednesday after it → `#leave-start` and `#leave-end` hold those dates; drag again Tue→Thu → the inputs change and the reason typed before stays.
  4. `a lead disapproves a plan with a reason from an email link` (desktop): create via Prisma a PENDING Annual leave for staff with a submitted plan (`transitionPlanTasks: [{ taskDetails: 'Weekly report', … }]`, `transitionPlanSubmittedAt: new Date()`) → lead signs in → `/leave?requestId=<id>` → `#leave-approval-<id>` has `aria-current="true"` and `Opened from email` → `Disapprove plan` → fill `#plan-disapprove-reason` → `Send back` → poll `transitionPlanLeadStatus === 'DISAPPROVED'` and the reason saved.
- [ ] **Step 2: Run** (test DB started, port 5433):
  `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test npx playwright test e2e/leave.spec.ts`
  Expected: 5 passed (test 1 on both projects; tests 2–4 desktop-only via `test.skip(testInfo.project.name !== 'desktop')`). Then `npm run test:e2e:academy` still passes (config change is env-only).
- [ ] **Step 3: Commit** · `test: browser test for requesting, cancelling and reviewing leave`

---

### Task 13: Full verification

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` → exactly the 19 baseline failures (18 api-integration, 1 rate-limit); all `tests/time-off-*.test.ts` and `tests/leave-*.test.ts` pass.
- [ ] **Step 3:** `git diff --stat main...HEAD -- app/api lib/email.ts lib/google-calendar.ts lib/notifications components/layout app/\(evaluator\)/dashboard` shows no change from this part's commits (`git log --oneline` of this part's commits; `git show --stat` each).
- [ ] **Step 4:** `wc -l app/(evaluator)/leave/page.tsx components/leave/time-off/* lib/time-off/*` → page < 300, every file < 800.
- [ ] **Step 5:** `grep -rnE "\b(alert|confirm|prompt)\(" app/(evaluator)/leave components/leave lib/time-off` → no matches.
- [ ] **Step 6:** Re-run the appendix walk from Task 11 Step 5 for any row touched by fixes since. No commit unless a fix was needed (`fix: …`).
