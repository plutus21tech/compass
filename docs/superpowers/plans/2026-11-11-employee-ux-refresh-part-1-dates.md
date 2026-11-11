# Employee UX refresh, part 1: dates and number wording — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every employee page shows dates in one style ("Thu 5 Nov", year added when it isn't this year) and counts in words ("5 days left of 10", "3 of 5"), with no change in behaviour.

**Architecture:** Two small pure modules, `lib/format-date.ts` and `lib/format-count.ts`, with unit tests that pin the exact strings. Employee-page call sites switch to them. Admin pages, emails, the Academy and the shared weekly/security-checks/payroll helpers are not touched.

**Tech Stack:** TypeScript, `Intl.DateTimeFormat` (no new dependency; `date-fns` stays unused), Node test runner (`node --import tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-11-employee-ux-refresh-design.md` §7 and Delivery part 1.

## Global Constraints

- Date style: `Thu 5 Nov`; with the year when it isn't the current year: `Thu 5 Nov 2025`; date-times `Thu 5 Nov, 14:30`; ranges `Thu 19 – Mon 23 Nov`.
- Date-only values (leave dates, holidays, task due dates, warranty dates) are formatted with no time-zone shift. Timestamps (created/updated/resolved at, chat times) are shown in `Asia/Karachi`. "Current year" is the year in `Asia/Karachi`.
- The output must not depend on the machine's or browser's time zone or locale.
- Numbers: "N days left of M", "X of Y"; no bare slashes.
- Employee pages only. Do not change: anything under `app/(hr)`, `app/(oa)`, `app/(security)`, `app/(security-checks)`, `app/(execution)`, `app/(evaluator)/onboarding`; `components/device-support/DeviceTicketsWorkspace.tsx` (security console); `lib/weekly/format.ts`, `components/security-checks/format.ts`, `lib/payroll/display-dates.ts`, `lib/academy/*`, `lib/email.ts`; native `<input type="date">` values; `components/ui/calendar.tsx`.
- No behaviour change: only the text of dates and counts changes. Relative labels ("Today", "Tomorrow", "3d late", "Due in N days") stay.
- Never run anything against the root `.env` database. This part needs no database.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit, but do not push.

## Review Focus

1. A browser or test machine outside Pakistan (e.g. `TZ=America/Los_Angeles`) must still show the same day; a midnight-UTC date-only value must not slip to the previous day. → Task 1 runs its suite under two extra `TZ` values.
2. New Year in Karachi while it's still 31 Dec in UTC: a date in the new year must not get a year suffix. → Task 1 test `year is judged in Karachi`.
3. Empty, `null` or unparseable values must show the call site's existing fallback ("No due date", "-", ""), never "Invalid Date". → Task 1 fallback tests; call sites keep their fallbacks.
4. Half-day balances (4.5) and singular "1 day" must read correctly in the new wording. → Task 1 `format-count` tests.
5. Ranges that cross a month or a year must name both months/years. → Task 1 range tests.

---

### Task 0: Worktree setup (no commit)

- [ ] Copy `next-env.d.ts` from the main checkout (`C:\Users\PC\Desktop\PE Portal\next-env.d.ts`) into the worktree root; it is gitignored and tsc needs it.
- [ ] Run `npm ci` in the worktree.
- [ ] Run `npx tsc --noEmit`. Expected: no errors.
- [ ] Run `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test`. Record the failure count; the known baseline is 19 (18 api-integration, 1 rate-limit). Every later task must keep it at that baseline.

### Task 1: Date and count helpers

**Files:**
- Create: `lib/format-date.ts`, `lib/format-count.ts`
- Test: `tests/format-date.test.ts`, `tests/format-count.test.ts`

**Interfaces:**
- Produces (`lib/format-date.ts`):
  - `type DateInput = string | Date`
  - `type FormatOptions = { now?: Date; fallback?: string }` — `now` defaults to `new Date()`, `fallback` to `''`.
  - `formatDate(value: DateInput | null | undefined, options?: FormatOptions): string` — a **date-only** value. A string starting `YYYY-MM-DD` uses those digits as the calendar day; a `Date` uses its UTC calendar day.
  - `formatTimestampDate(value: DateInput | null | undefined, options?: FormatOptions): string` — an **instant**, shown as its Karachi calendar day.
  - `formatDateTime(value: DateInput | null | undefined, options?: FormatOptions): string` — an instant: Karachi day plus 24-hour time.
  - `formatTime(value: DateInput | null | undefined, options?: { fallback?: string }): string` — Karachi `HH:mm`.
  - `formatDateRange(start: DateInput, end: DateInput, options?: FormatOptions): string` — date-only range.
  - `formatMonthYear(value: DateInput): string` — date-only, e.g. `November 2026`.
- Produces (`lib/format-count.ts`):
  - `formatDays(days: number): string` — `1 day`, `0.5 days`, `4.5 days`, `0 days`.
  - `formatDaysLeft(left: number, total: number): string` — full phrase.
  - `daysLeftSuffix(left: number, total: number): string` — the phrase without the number, for components that render the number themselves (StatsCard).
  - `formatCountOf(done: number, total: number): string` — `3 of 5`.

- [ ] **Step 1: Write the failing tests** (`NOW = new Date('2026-11-10T07:00:00Z')`, Tuesday 10 Nov in Karachi)

```ts
// tests/format-date.test.ts
test('formatDate: this year has no year', () => {
  assert.equal(formatDate('2026-11-05', { now: NOW }), 'Thu 5 Nov')
  assert.equal(formatDate('2026-11-05T00:00:00.000Z', { now: NOW }), 'Thu 5 Nov')
  assert.equal(formatDate(new Date(Date.UTC(2026, 10, 5)), { now: NOW }), 'Thu 5 Nov')
})
test('formatDate: other years show the year', () => {
  assert.equal(formatDate('2025-11-05', { now: NOW }), 'Wed 5 Nov 2025')
  assert.equal(formatDate('2027-01-05', { now: NOW }), 'Tue 5 Jan 2027')
})
test('year is judged in Karachi', () => {
  const karachiNewYear = new Date('2026-12-31T20:00:00Z') // 01:00 on 1 Jan 2027 in Karachi
  assert.equal(formatDate('2027-01-01', { now: karachiNewYear }), 'Fri 1 Jan')
})
test('fallbacks', () => {
  assert.equal(formatDate(null, { now: NOW }), '')
  assert.equal(formatDate(undefined, { now: NOW, fallback: 'No due date' }), 'No due date')
  assert.equal(formatDate('not a date', { now: NOW, fallback: '-' }), '-')
  assert.equal(formatDateTime('', { now: NOW, fallback: '-' }), '-')
  assert.equal(formatTime(null, { fallback: '' }), '')
})
test('timestamps use Karachi', () => {
  assert.equal(formatTimestampDate('2026-11-05T20:00:00Z', { now: NOW }), 'Fri 6 Nov')
  assert.equal(formatDateTime('2026-11-05T09:30:00Z', { now: NOW }), 'Thu 5 Nov, 14:30')
  assert.equal(formatDateTime('2026-11-05T20:00:00Z', { now: NOW }), 'Fri 6 Nov, 01:00')
  assert.equal(formatDateTime('2025-11-05T09:30:00Z', { now: NOW }), 'Wed 5 Nov 2025, 14:30')
  assert.equal(formatTime('2026-11-05T09:30:00Z'), '14:30')
})
test('formatDateRange', () => {
  assert.equal(formatDateRange('2026-11-19', '2026-11-19', { now: NOW }), 'Thu 19 Nov')
  assert.equal(formatDateRange('2026-11-19', '2026-11-23', { now: NOW }), 'Thu 19 – Mon 23 Nov')
  assert.equal(formatDateRange('2026-10-30', '2026-11-03', { now: NOW }), 'Fri 30 Oct – Tue 3 Nov')
  assert.equal(formatDateRange('2027-02-01', '2027-02-03', { now: NOW }), 'Mon 1 – Wed 3 Feb 2027')
  assert.equal(formatDateRange('2026-12-31', '2027-01-01', { now: NOW }), 'Thu 31 Dec 2026 – Fri 1 Jan 2027')
})
test('formatMonthYear', () => {
  assert.equal(formatMonthYear('2026-11-01'), 'November 2026')
})
```

```ts
// tests/format-count.test.ts
test('formatDays', () => {
  assert.equal(formatDays(1), '1 day'); assert.equal(formatDays(0.5), '0.5 days')
  assert.equal(formatDays(4.5), '4.5 days'); assert.equal(formatDays(0), '0 days')
})
test('formatDaysLeft', () => {
  assert.equal(formatDaysLeft(5, 10), '5 days left of 10')
  assert.equal(formatDaysLeft(1, 10), '1 day left of 10')
  assert.equal(formatDaysLeft(4.5, 10), '4.5 days left of 10')
  assert.equal(formatDaysLeft(0, 6), 'None left of 6')
})
test('daysLeftSuffix', () => {
  assert.equal(daysLeftSuffix(5, 10), 'days left of 10')
  assert.equal(daysLeftSuffix(1, 10), 'day left of 10')
})
test('formatCountOf', () => { assert.equal(formatCountOf(3, 5), '3 of 5') })
```

- [ ] **Step 2: Run to see them fail**

Run: `node --import tsx --test tests/format-date.test.ts tests/format-count.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement both modules**

Build each string from `Intl.DateTimeFormat('en-GB', …).formatToParts()` pieces (`weekday: 'short'`, `day: 'numeric'`, `month: 'short'`, `year: 'numeric'`) and join them yourself, so locale punctuation never leaks in. Date-only values: format with `timeZone: 'UTC'` from a `Date.UTC(y, m, d)` built from the `YYYY-MM-DD` digits (or the `Date`'s UTC parts). Instants and "current year": `timeZone: 'Asia/Karachi'`. Time: `hour: '2-digit', minute: '2-digit', hourCycle: 'h23'`. Range rule: same day → one date; same month and year → `Thu 19 – Mon 23 Nov` (+ ` YYYY` at the end when not the current year); same year, different month → both sides `day month` (+ year at the end when not the current year); different years → both sides with their year. Separator: space, en dash (U+2013), space. Days: integers without decimals, halves with one decimal; `0` left → `None left of N`.

- [ ] **Step 4: Run the tests in three time zones**

Run: `node --import tsx --test tests/format-date.test.ts tests/format-count.test.ts`, then the same with `TZ=America/Los_Angeles` and `TZ=Asia/Tokyo` prefixed.
Expected: PASS all three times.

- [ ] **Step 5: Commit**

```bash
git add lib/format-date.ts lib/format-count.ts tests/format-date.test.ts tests/format-count.test.ts
git commit -m "feat: add one date style and count wording helpers for employee pages"
```

### Task 2: Projects and My work

**Files:**
- Modify: `components/projects/workspace-utils.ts` (`PROJECT_TASK_DISPLAY_FORMATTER` / `displayDueDate`, `SHORT_DUE_FORMATTER` / `formatShortDue`), `components/projects/TaskRow.tsx` (`TASK_DATE_FORMATTER`), `components/projects/TaskDetailPanel.tsx` (`formatTaskDate`, comment time ~line 1456, activity time ~line 1532), `components/projects/TaskCard.tsx` (`{childrenDone}/{children.length}`), `components/my-tasks/views/BoardView.tsx`, `ListView.tsx`, `FilesView.tsx`, `CalendarView.tsx`
- Test: `tests/project-workspace-utils.test.ts` (update expected strings)

**Interfaces:**
- Consumes: Task 1's `formatDate`, `formatDateRange`, `formatDateTime`, `formatTimestampDate`, `formatMonthYear`, `formatCountOf`.
- Task due/start dates are calendar days in the project time zone: pass the `YYYY-MM-DD` day from `projectTaskCalendarDayKey` (or the value's date part) to `formatDate` / `formatDateRange`. Comment and activity times are instants → `formatDateTime`; file "Updated" → `formatTimestampDate`.

- [ ] **Step 1: Update the existing tests to the new style** in `tests/project-workspace-utils.test.ts` (fixed clock: 22 Oct 2026, Karachi):
  - `formatShortDue('2026-10-24T00:00:00Z', NOW)` → `'Sat 24 Oct'`; `formatShortDue('2027-01-05T00:00:00Z', NOW)` → `'Tue 5 Jan 2027'`
  - the `dueState` labels at lines ~366, ~375, ~381, ~394: `'Oct 25'` → `'Sun 25 Oct'`, `'Oct 24'` → `'Sat 24 Oct'`, `'Oct 20'` → `'Tue 20 Oct'`, `'Dec 30, 2025'` → `'Tue 30 Dec 2025'`
  - add: `displayDueDate(null)` is still `'No due date'`.
- [ ] **Step 2: Run** `node --import tsx --test tests/project-workspace-utils.test.ts`. Expected: FAIL on the changed strings.
- [ ] **Step 3: Switch every listed call site to the helpers**, keeping each site's fallback text ("No due date", "No deadline", "No date") and relative labels. ListView's start–end becomes `formatDateRange`. CalendarView's month header becomes `formatMonthYear`; its week header becomes `formatDateRange` of the first and last day. TaskCard shows `formatCountOf(childrenDone, children.length)`.
- [ ] **Step 4: Verify.** Run the test file (PASS), `npx tsc --noEmit` (clean), and `grep -nE "toLocaleDateString|toLocaleString\(|'en-US'|new Intl.DateTimeFormat\(undefined" components/projects/workspace-utils.ts components/projects/TaskRow.tsx components/projects/TaskDetailPanel.tsx components/my-tasks/views/*.tsx` (no matches).
- [ ] **Step 5: Commit** — `feat: show project and My work dates in the one date style`.

### Task 3: Help & IT, Office and Evaluations

**Files:**
- Modify: `components/device-support/DeviceSupportWorkspace.tsx` (lines ~482, ~536, ~602, ~653), `app/(evaluator)/device-support/assets/[tag]/page.tsx` (`formatDate` helper at line ~17), `app/(evaluator)/office/_components/ChatPanel.tsx` (~line 45), `components/weekly/WeeklyInbox.tsx` (`DUE` formatter, line ~33)

**Interfaces:**
- Consumes: Task 1's `formatDate`, `formatTimestampDate`, `formatTime`.
- Ticket `createdAt` and `resolvedAt` → `formatTimestampDate`. `expectedResolutionDate` and asset dates (purchase, warranty) are date-only → `formatDate` with the page's existing fallback (`'-'` on the asset page). Chat message time → `formatTime`. The weekly due day is an instant → `formatTimestampDate` (it changes from "Sunday 4 Oct" to "Sun 4 Oct").

- [ ] **Step 1:** Rename the asset page's local helper to avoid shadowing the import, then switch every listed site.
- [ ] **Step 2: Verify.** `npx tsc --noEmit` clean; `grep -nE "toLocaleDateString|toLocaleTimeString|'en-US'" components/device-support/DeviceSupportWorkspace.tsx "app/(evaluator)/device-support/assets/[tag]/page.tsx" "app/(evaluator)/office/_components/ChatPanel.tsx"` has no matches; `components/device-support/DeviceTicketsWorkspace.tsx` is unchanged (`git diff --stat` does not list it).
- [ ] **Step 3: Commit** — `feat: show Help & IT, Office and evaluation due dates in the one date style`.

### Task 4: Time off and Home

**Files:**
- Modify: `app/(evaluator)/leave/page.tsx` (`formatApiDate` ~line 213 and its callers ~573, ~581, ~1363, ~1472, ~1661, ~1731, ~2223, ~2229; the "Team on leave" title ~2135; the balance `StatsCard` suffix ~1087), `app/(evaluator)/dashboard/page.tsx` (leave ranges ~427 and ~486, ticket date ~536, balance tile line ~632)

**Interfaces:**
- Consumes: Task 1's `formatDate`, `formatDateRange`, `formatTimestampDate`, `daysLeftSuffix`, `formatDays`.
- Leave start/end dates are date-only: pairs rendered as "start – end" become one `formatDateRange(startDate, endDate)`; single dates (return date, details modal start and end, the "Team on leave" title) use `formatDate`. Ticket `createdAt` → `formatTimestampDate`.

- [ ] **Step 1:** Replace `formatApiDate` with the helpers and delete it once it has no callers. Keep `toDateKey` and `parseInputDateAsLocal` (they drive the calendar logic).
- [ ] **Step 2:** Leave balance cards: `suffix={daysLeftSuffix(remaining, total)}`, so a card reads "5 days left of 10". Home balance tile small line: `{formatDays(used)} used of {formatLeaveValue(total)}` (e.g. "5 days used of 10"), replacing `used/total used`.
- [ ] **Step 3: Verify.**
  - `npx tsc --noEmit` clean.
  - `grep -nE "toLocaleDateString|'en-US'" "app/(evaluator)/leave/page.tsx" "app/(evaluator)/dashboard/page.tsx"` has no matches.
  - `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` is at the Task 0 baseline, with the `leave-*` tests passing.
- [ ] **Step 4: Commit** — `feat: show Time off and Home dates and balances in plain words`.

### Task 5: Final check and PR text (no push)

- [ ] `npx tsc --noEmit` clean; `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` at baseline.
- [ ] `git diff --stat origin/main...HEAD` lists no files under `app/(hr)`, `app/(oa)`, `app/(security)`, `app/(security-checks)`, `app/(execution)`, `app/(evaluator)/onboarding`, `lib/email.ts`, `lib/weekly/format.ts`, `components/security-checks/`, `lib/payroll/`, `lib/academy/`.
- [ ] Start the app locally with a dummy `SESSION_SECRET` and the local test `DATABASE_URL` (never the root `.env`). Check Home, Time off, My work (List, Board, Calendar, Files), a project task panel and Help & IT, and confirm every date reads like `Thu 5 Nov`.
- [ ] Write the PR body to the session scratchpad: summary, the list of pages affected, the test plan with results, and the note that the leave and Home pages are rebuilt in parts 3 and 4. Report back; the owner decides when to push.
