# Employee UX refresh, part 3: Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Home (`/dashboard`) as the mockup on slide 5 shows, in Compass's current colours: a dated greeting with a one-line summary, three cards (Out today, Your time off, Next public holiday), a "Needs you" list of actions sorted by due date, and a "My work" column whose tasks open the existing task panel in a side sheet.

**Architecture:** The page becomes a thin client shell over small components in `components/home/`. Every rule that decides *what* to show is a pure function in `lib/home/` with its own unit test; the components only render. Data comes from the existing endpoints, fetched in parallel, each one failing on its own. One new read-only endpoint, `GET /api/home/overview`, supplies the three things no employee endpoint gives today: who is out today across both companies, your department's next person out, and your team's upcoming holidays. The weekly card service gains three additive fields (`dueAt`, `counts`, notice `kind`) so Home can sort weekly items by due date and leave FYI notices to the bell.

**Tech Stack:** Next.js 16 App Router (client components), React 18, Prisma 5 / Postgres, Tailwind with the tokens in `app/globals.css`, `components/ui/*` (Card, Button, Badge, Dialog, Progress, Skeleton), sonner, `lucide-react`, Node test runner (`node --import tsx --test`), `react-dom/server` `renderToStaticMarkup` for component tests.

**Spec:** `docs/superpowers/specs/2026-11-11-employee-ux-refresh-design.md` — Decision 4 (Home), Decision 7 (dates and numbers), Non-goals, Anti-goals, Delivery part 3, and the appendix "Home today → new home" checklist, which is binding. Mockup: slide 5 of the deck (Home), target layout only.

**Depends on part 2** (`docs/superpowers/plans/2026-11-11-employee-ux-refresh-part-2-frame.md`), and only on what its "Interfaces later parts consume" section lists:
- `PageContainer({ children, width?: 'default' | 'wide' | 'reading', className? })` from `components/layout/page-container.tsx`
- `PageHeader({ title, subtitle?, dateLine?, actions?, className? })` from `components/layout/page-header.tsx`
- `useLayoutUser()` from `components/layout/SidebarLayout.tsx` (shape unchanged: `id`, `name`, `role`, `department?`, `teamTag?`, …)
- `ACTIVE_PERSON_WHERE` from `lib/people/directory.ts`
- the People page at `/people` (My team tab) and the bell (FYI weekly notices `WEEKLY_LIST_DECISION`, `WEEKLY_LIST_CHANGED`, `WEEKLY_FORMS_OPEN`)

This part edits no file part 2 owns (`components/layout/*`, `lib/people/*`, `lib/notifications/*`, `lib/weekly/service/notifications.ts`, `lib/weekly/service/bell-notices.ts`, the six route-group layouts).

## Rulings (decisions the spec left to the builder)

1. **Data: existing endpoints plus one new read-only endpoint.** Home calls the existing endpoints in parallel (their permission rules stay where they are; nothing in the 833-line leave route is duplicated). The one new endpoint, `GET /api/home/overview`, covers only what has no employee-facing source: out today, department next-out, team holidays beyond the current month. It exposes nothing the leave calendar does not already show every signed-in user (name, department, leave type, half day, pending), and never the reason.
2. **"Today" is the Karachi day** everywhere on Home (date line, out today, due dates, overdue tone, next leave, days to the holiday), matching `lib/format-date.ts` and the weekly calendar. **The greeting uses the browser's own clock** ("Good morning" before 12:00, "Good afternoon" before 17:00, else "Good evening"): it is a salutation about the reader's day, and Compass has Morocco staff four hours behind Karachi.
3. **The date line** is `formatDate(todayKey)`, the one date style ("Wed 11 Nov"), not the mockup's long form.
4. **Out today counts both companies**, as the leave calendar does, with the calendar's statuses (`PENDING`, `LEAD_APPROVED`, `HR_APPROVED`, `APPROVED`); pending ones are marked "waiting for approval" in "See who", as the calendar fades them. A half day counts as out. Each person counts once. Payroll-inactive people (part 2's `ACTIVE_PERSON_WHERE`) are not counted. The leave's stored date range decides, as on the calendar (no weekend special case).
5. **"Your department is all in"** compares department names case-insensitively and leaves the viewer out of the count. With no department on the viewer, the sentence is left out. "Who on your team is out next" means the next colleague in your department (not you) whose leave starts after today and within 60 days.
6. **Leads' upcoming team leave** (today's "Upcoming Team Leaves" card) moves into the Out today card: a line "N people on your team have leave coming up" and a section in the "See who" dialog, from the existing `GET /api/leave/requests?scope=team-upcoming`.
7. **Next public holiday** = the earliest `LeaveHoliday` on or after today whose `teamTags` has the viewer's `teamTag` (the same rule as `leaveHolidayAppliesTo`). The chip shows `teamShortLabel(catalog, teamTag)` + " team". "All holidays" opens a dialog on Home listing the next 20 within a year — no dependency on part 4. No team tag: "No team is set on your profile, so no holidays show here. Ask HR to set it."
8. **Needs you = actions only.** Weekly notices of kind `LIST_DECISION` and `HR_CHANGED_LISTS` are FYI: they belong to the bell (part 2 writes them) and are left off Home. Every other weekly notice stays a Needs-you item, including "X asked to remove you as a peer", which the bell does not carry, so nothing is lost.
9. **Leads get one item per request; HR and Security get one summary item per queue.** A lead's leave request needs them when its status is `PENDING` or `HR_APPROVED` (the same set the WFH lead queue uses); a submitted handover plan with `transitionPlanLeadStatus = PENDING` needs them too and is folded into the same item when both apply (never two items for one request). Already-approved requests the lead could only disapprove stay on `/leave`, not on Home. HR gets "N leave requests waiting for HR" and "N WFH requests waiting for HR" linking to `/admin/leave` (as today); HR/Security get "N open device tickets" linking to their console (as today). A dual HR + lead user is treated as HR for the leave queue, as today's Home links everything to `/admin/leave`.
10. **Your own leave needing a handover plan**: own requests in `PENDING`/`LEAD_APPROVED`/`HR_APPROVED`/`APPROVED`, starting today or later, where `transitionPlanRequired` (with your department) is true and the plan is unsubmitted or was disapproved. Due day = the leave's start.
11. **Due day** is a Karachi `YYYY-MM-DD` key. Sort: due day ascending, items without a due day last, ties by source order then title. Past due days show "Overdue since Thu 5 Nov" in `text-destructive`.
12. **Summary line**: "Nothing needs you right now." / "1 thing needs you." / "N things need you." (no "this week": plan reviews and forms can be due later), then the department sentence: "Everyone in Design is in today." / "1 person in Design is out today." / "N people in Design are out today."
13. **My work** shows the first 4 open tasks from `GET /api/my-tasks?status=ACTIVE&sort=due_asc` and up to 3 active projects you own or are a member of (project-wide progress, "86 of 108 tasks done"), with "and N more" linking to `/projects`. The mockup's "Recent updates" block is not in the spec and is not built.
14. **Task side sheet**: clicking a task loads `GET /api/projects/{projectId}` (cached per project while Home is open) and renders the existing `TaskDetailPanel` with the same members/sections/labels/sprints/permission rules as the project page. A load failure shows `toast.error('Could not open this task. Open it from My work.')`.
15. **A failed source never blanks Home.** Each card shows its own short failure line; Needs you shows what loaded plus "Some items could not be loaded. Refresh to try again." A 404 is "not applicable" (e.g. a flag that is off), not a failure.
16. **Removed from Home** (each one click away, per spec §4): Who you evaluate and Quarter progress (Evaluations page), Team directory (People → My team), My equipment and the Device Support card (Help & IT), the four stat tiles. `components/weekly/WeeklyQuestionsCard.tsx` and `components/academy/AssignedCard.tsx` lose their only importer and are deleted.

## Global Constraints

- Work only in the worktree `C:\Users\PC\Desktop\PE Portal\.worktrees\ux-refresh` (branch `feat/ux-refresh`). Commit after each task; never push.
- Commit messages: conventional (`feat:`, `fix:`, `test:`, `refactor:`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No rebrand.** Current colours, fonts (DM Sans, Instrument Serif) and dark mode. Use existing tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`, `bg-muted`); leave-type colours are the ones `/leave` already uses (casual `amber-500`, sick `red-500`, annual `emerald-500`).
- **Nothing lost:** after this part every row of the appendix "Home today → new home" list has the home Task 10 records.
- **Leave type stays visible** to colleagues as today (owner decision 2026-11-11): "See who" shows each person's leave type.
- **The pulse survey is not a Home item**; it stays on the Evaluations page.
- **Needs you = actions; the bell = FYI** (Ruling 8).
- Files stay under 800 lines; `app/(evaluator)/dashboard/page.tsx` ends under 40 lines.
- No browser `alert`, `confirm` or `prompt`; dialogs use `components/ui/dialog.tsx`.
- Dates use `lib/format-date.ts` (`formatDate`, `formatDateRange`, `formatTimestampDate`); counts use `lib/format-count.ts` (`formatDays`, `formatCountOf`). No `toLocaleDateString()` and no bare slashes ("3/5") in new code.
- **Never run anything against the root `.env` database (production).** The worktree has no `.env`; keep it that way. Local test DB only: embedded Postgres on port 5433, user/password `compass`, database `compass_weekly_test`, started with
  `"C:/Users/PC/Desktop/PE Portal/.worktrees/ai-evaluations-archive/.pilot-tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe" -D "C:/Users/PC/Desktop/PE Portal/.worktrees/.academy-pg" -o "-p 5433" start`.
- Unit tests: `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — baseline **19 known failures (18 api-integration, 1 rate-limit)**; it must stay exactly that.
- DB tests: `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 <files>`. New DB test files are `*.integration.test.ts`, gate on `WEEKLY_DB_TEST`/`WEEKLY_DB_READY` from `tests/helpers/weekly-test-db.ts`, use the id prefix `hom-`, and delete and assert only their own rows.
- Test data is fictional (public repo): invented names such as `Pia Kestrel`, `Omar Vantly`, `Mina Arlow`.
- No migrations, no package installs, no full `next build` (disk nearly full). Type-check with `npx tsc --noEmit`.
- A GateGuard hook may block the first Write of a new file and ask for facts. Answer with the callers, that no duplicate exists, the data it handles, and the user's instruction: "lets finish all parts and open a PR alltogether". Then retry the identical call.

## Review Focus

1. **A viewer with no department or no team tag** must get a working Home: no department sentence, the holiday card's "No team is set" line, no crash. → Task 2 `summary leaves out the department sentence without a department`; Task 3 `no team tag: no holidays, no error`.
2. **The Karachi day boundary**: at 20:30 UTC on 11 Nov it is already 12 Nov in Karachi; out today, due days and "overdue" must use 12 Nov. → Task 2 `today is the Karachi day after 19:00 UTC`; Task 3 `out today uses the Karachi day`.
3. **Messy leave rows**: a person with two overlapping requests today (one pending, one approved), a half day, and a rejected or cancelled request. Each person counts once, the half day counts, rejected/cancelled never. → Task 3 `each person counts once; half days count; rejected and cancelled do not`.
4. **One source failing** (500, network error, 403) must leave the rest of Home intact; a 404 (feature off) is silent. → Task 6 `a failing source marks Needs you incomplete; a 404 does not`.
5. **An HR user who also leads a team**, and a lead whose request has both an approval and a plan review pending, must never see the same request twice. → Task 4 `one item per request even with a plan to review`, `HR gets one summary item, never per-request items`.

---

### Task 0: Baseline (no commit)

- [ ] Confirm part 2 has landed on this branch: `ls components/layout/page-container.tsx components/layout/page-header.tsx lib/people/directory.ts "app/(evaluator)/people/page.tsx"` all exist, and `grep -n "export function PageHeader\|export function PageContainer\|export const ACTIVE_PERSON_WHERE" components/layout/page-header.tsx components/layout/page-container.tsx lib/people/directory.ts` finds all three. If not, stop: this part depends on them.
- [ ] Confirm there is no `.env` in the worktree root (`ls -a`). If one exists, stop and ask.
- [ ] `npx tsc --noEmit` — no errors.
- [ ] `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — exactly 19 failures. Record it.
- [ ] Start the local DB and run `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/weekly-dashboard-card.integration.test.ts` — all pass.

---

### Task 1: Weekly card says when things are due and which notices are FYI

**Files:**
- Modify: `lib/weekly/service/dashboard-card.ts`
- Test: `tests/weekly-dashboard-card.integration.test.ts` (extend)

**Interfaces:**
- Produces (`lib/weekly/service/dashboard-card.ts`, additive; existing fields and messages unchanged):
  - `type CardNoticeKind = 'LIST_CHANGE_TO_REVIEW' | 'PEER_CHANGE_ABOUT_YOU' | 'LIST_DECISION' | 'HR_CHANGED_LISTS' | 'TEAM_SELF_REVIEW' | 'LATE_JOINER' | 'FORMS_OPEN' | 'HR_LIST_CHANGES' | 'HR_ANSWERS'`
  - `interface CardNotice { text: string; href: string; kind: CardNoticeKind }`
  - `const FYI_NOTICE_KINDS: ReadonlySet<CardNoticeKind>` = `LIST_DECISION`, `HR_CHANGED_LISTS`
  - `EvaluationsCardView` gains `dueAt: string | null` (ISO instant: `CHECK_LISTS` → the `by` date used in the message; `THIS_WEEK` → `weekDueAt(...)`; otherwise `null`) and `counts: { done: number; total: number } | null` (`THIS_WEEK` only).
- Kinds map one-to-one onto the existing notice lines, in `cardNotices` order: `toReview` → `LIST_CHANGE_TO_REVIEW`, `aboutMe` → `PEER_CHANGE_ABOUT_YOU`, `decided` → `LIST_DECISION`, `hrChanges` → `HR_CHANGED_LISTS`, unread team self-reviews → `TEAM_SELF_REVIEW`, late joiners → `LATE_JOINER`, forms open → `FORMS_OPEN`, HR list changes → `HR_LIST_CHANGES`, HR answers → `HR_ANSWERS`.

- [ ] **Step 1: Write the failing tests** (append to the existing file, reusing its fixtures):

```ts
const kinds = async (who: typeof ana, now: Date) => (await evaluationsCard(who, now))?.notices.map((n) => [n.kind, n.text]) ?? []

test('notices carry a kind; outcomes and HR changes are the FYI ones', WEEKLY_DB_TEST, async () => {
  const request = await requestPeerChange(ana, { peerId: W.ben.id, action: 'REMOVE', reasonCode: 'WRONG_PERSON' }, at(0, 1), send, 'https://compass.example')
  assert.deepEqual(await kinds(weeklyActor(W.lead), at(0, 2)), [['LIST_CHANGE_TO_REVIEW', 'Ana Torvik asked to change their evaluation lists: review it']])
  assert.ok((await kinds(weeklyActor(W.ben), at(0, 2))).some(([k]) => k === 'PEER_CHANGE_ABOUT_YOU'))
  await decidePeerRequest(HR_ACTOR, request.id, 'APPROVE', null, at(0, 3), send, 'https://compass.example')
  assert.ok((await kinds(ana, at(0, 4))).some(([k, t]) => k === 'LIST_DECISION' && t === 'Approved: your request about Ben Okafor'))
  assert.deepEqual([...FYI_NOTICE_KINDS].sort(), ['HR_CHANGED_LISTS', 'LIST_DECISION'])
})

test('the card says when the week and the list check are due', WEEKLY_DB_TEST, async () => {
  const check = await evaluationsCard(ana, at(0))
  assert.equal(check?.dueAt, new Date('2026-10-02T00:00:00.000Z').toISOString())
  assert.equal(check?.counts, null)
  await start()
  await releaseWeek(cycleId, 1, at(1))
  const week = await evaluationsCard(weeklyActor(W.lead), at(1, 2))
  assert.equal(week?.state, 'THIS_WEEK')
  assert.ok(week?.dueAt, 'a due instant')
  assert.match(formatTimestampDate(week!.dueAt!), /^Fri /)
  assert.deepEqual(week?.counts, { done: 0, total: 1 })
})
```

  (Import `FYI_NOTICE_KINDS` from the card module and `formatTimestampDate` from `../lib/format-date`. If `W.lead`'s week-1 total differs in these fixtures, assert the total the existing "round open" test implies; the point is `counts` equals the numbers in `message`.)
- [ ] **Step 2: Run to verify they fail.** `DATABASE_URL=… WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/weekly-dashboard-card.integration.test.ts` — FAIL (no `kind`, `dueAt`, `counts`, `FYI_NOTICE_KINDS`).
- [ ] **Step 3: Implement** the additive fields. `base` gets `dueAt: null, counts: null`; the `CHECK_LISTS` and `THIS_WEEK` returns override them. No message text changes.
- [ ] **Step 4: Verify.** The whole file passes (old tests unchanged). `npx tsc --noEmit` clean (`components/weekly/WeeklyQuestionsCard.tsx` and `WeeklyEvaluationsPage.tsx` still compile — they only read old fields).
- [ ] **Step 5: Commit.** `git commit -m "feat: weekly card says when it is due and which notices are FYI"`.

---

### Task 2: Home's clock, greeting and summary (pure)

**Files:**
- Create: `lib/home/time.ts`
- Create: `lib/home/summary.ts`
- Test: `tests/home-time.test.ts`

**Interfaces:**
- Produces (`lib/home/time.ts`, no server imports):
  - `karachiDayKey(instant: Date): string` — `YYYY-MM-DD` of the instant in `Asia/Karachi` (Intl, `en-CA` parts).
  - `dayKeyOf(value: string | Date): string` — a date-only value (leave dates, holidays stored at UTC midnight) as `YYYY-MM-DD` via `leaveDateKey` from `lib/leave-utils.ts`.
  - `daysBetween(fromKey: string, toKey: string): number` — whole days, `toKey - fromKey`.
  - `addDays(key: string, days: number): string`
  - `greetingFor(localHour: number): 'Good morning' | 'Good afternoon' | 'Good evening'` — `< 12`, `< 17`, else.
  - `inDaysPhrase(days: number): string` — `0` "Today", `1` "Tomorrow", else `In ${days} days`.
- Produces (`lib/home/summary.ts`):
  - `homeSummary(input: { needsYou: number | null; department: string | null; departmentOutToday: number | null }): string` — Ruling 12; `needsYou: null` (still loading or failed) omits the first sentence; `department` or `departmentOutToday` null omits the second.

- [ ] **Step 1: Write the failing tests** (`tests/home-time.test.ts`):

```ts
test('today is the Karachi day after 19:00 UTC', () => {
  assert.equal(karachiDayKey(new Date('2026-11-11T18:59:00Z')), '2026-11-11')
  assert.equal(karachiDayKey(new Date('2026-11-11T19:00:00Z')), '2026-11-12')
})
test('date-only values keep their calendar day', () => {
  assert.equal(dayKeyOf('2026-12-25T00:00:00.000Z'), '2026-12-25')
})
test('days between and in-days phrase', () => {
  assert.equal(daysBetween('2026-11-11', '2026-12-25'), 44)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.deepEqual([0, 1, 44].map(inDaysPhrase), ['Today', 'Tomorrow', 'In 44 days'])
})
test('greeting by the reader\'s own hour', () => {
  assert.deepEqual([0, 11, 12, 16, 17, 23].map(greetingFor), ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'])
})
test('summary counts what needs you and who is out in your department', () => {
  assert.equal(homeSummary({ needsYou: 2, department: 'Design', departmentOutToday: 0 }), '2 things need you. Everyone in Design is in today.')
  assert.equal(homeSummary({ needsYou: 1, department: 'Design', departmentOutToday: 1 }), '1 thing needs you. 1 person in Design is out today.')
  assert.equal(homeSummary({ needsYou: 0, department: 'Design', departmentOutToday: 3 }), 'Nothing needs you right now. 3 people in Design are out today.')
})
test('summary leaves out the department sentence without a department', () => {
  assert.equal(homeSummary({ needsYou: 2, department: null, departmentOutToday: null }), '2 things need you.')
  assert.equal(homeSummary({ needsYou: null, department: 'Design', departmentOutToday: 0 }), 'Everyone in Design is in today.')
})
```

- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-time.test.ts` — FAIL (modules missing).
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat: home clock, greeting and summary line"`.

---

### Task 3: Home overview endpoint — out today and team holidays

**Files:**
- Create: `lib/home/out-today.ts` (pure)
- Create: `lib/home/overview.ts` (server)
- Create: `app/api/home/overview/route.ts`
- Test: `tests/home-out-today.test.ts` (pure), `tests/home-overview.integration.test.ts` (DB, prefix `hom-`)

**Interfaces:**
- Consumes: Task 2 `karachiDayKey`, `dayKeyOf`, `daysBetween`, `addDays`; part 2 `ACTIVE_PERSON_WHERE`; `loadTeamCatalog` (`lib/teams/load.ts`), `teamShortLabel` (`lib/teams/catalog.ts`); `getSession` (`lib/auth.ts`); `checkRateLimit`, `RateLimitUnavailableError` (`lib/rate-limit.ts`).
- Produces (`lib/home/out-today.ts`):
  - `const OUT_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] as const` and `const PENDING_STATUSES` (the first three).
  - `type LeaveTypeValue = 'CASUAL' | 'SICK' | 'ANNUAL'`
  - `interface OutRow { employeeId: string; name: string; department: string | null; leaveType: LeaveTypeValue; isHalfDay: boolean; halfDaySession: string | null; status: string }`
  - `interface OutPerson { id: string; name: string; department: string | null; leaveType: LeaveTypeValue; isHalfDay: boolean; halfDaySession: string | null; pending: boolean }`
  - `summariseOutToday(rows: readonly OutRow[], viewer: { id: string; department: string | null }): { people: OutPerson[]; departmentOutToday: number | null }` — one entry per person (prefer a final over a pending row, then a full day over a half day), sorted by name; `departmentOutToday` counts people other than the viewer whose department equals the viewer's (trimmed, case-insensitive), `null` when the viewer has no department.
  - `interface HolidayView { date: string; name: string; daysAway: number }`
  - `interface HomeOverview { today: string; outToday: { count: number; people: OutPerson[] }; department: string | null; departmentOutToday: number | null; nextOutInDepartment: { name: string; startDate: string } | null; teamLabel: string | null; nextHoliday: HolidayView | null; upcomingHolidays: HolidayView[] }`
- Produces (`lib/home/overview.ts`): `const NEXT_OUT_WINDOW_DAYS = 60`, `const HOLIDAY_LIST_MAX = 20`, `loadHomeOverview(viewer: { id: string; department: string | null; teamTag: string | null }, now: Date, db?: PrismaClient): Promise<HomeOverview>` — today = `karachiDayKey(now)` as a UTC-midnight `Date`; out rows: `leaveRequest` with `status in OUT_STATUSES`, `startDate <= today`, `endDate >= today`, `employee: ACTIVE_PERSON_WHERE`; next out: same statuses, `employeeId != viewer`, department equals (`mode: 'insensitive'`), `startDate > today` and `<= today + 60`, `orderBy startDate asc`, first row; holidays: `teamTags: { has: teamTag }`, `date >= today` and `< today + 365`, `orderBy [{ date: 'asc' }, { name: 'asc' }]`, `take: HOLIDAY_LIST_MAX`; no team tag → no holiday query, `teamLabel: null`. Selects only the fields `OutRow` needs (never `reason`).
- Produces (route): `GET /api/home/overview` → 401 `{ success: false, error: 'Unauthorized' }`; `checkRateLimit(\`home-overview:${user.id}\`, 120)` not allowed → 429 `{ success: false, error: 'Too many requests. Wait a moment and try again.' }` (allow on `RateLimitUnavailableError`); 200 `{ success: true, data: HomeOverview }` with `Cache-Control: no-store`; 500 `{ success: false, error: 'Could not load today’s overview. Try again.' }` after `console.error('[home] overview failed', { error })`. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Write the failing tests.**
  `tests/home-out-today.test.ts`:
  - `each person counts once; a final row beats a pending one` — two rows for `hom-pia` (`PENDING` half day, `APPROVED` full day) → one `OutPerson` with `pending: false`, `isHalfDay: false`.
  - `department count leaves the viewer out and ignores case` — viewer `{ id: 'v', department: 'Design' }`, rows for `v` (Design), `a` (`' design '`), `b` (Ops) → `departmentOutToday === 1`.
  - `no department, no department count` → `null`.

  `tests/home-overview.integration.test.ts` (fixed `NOW = new Date('2031-03-12T05:00:00Z')`, far from other suites' data; team tag `'HOM_TEST'`, which is not in the catalog so its label is the code; creates users `hom-viewer` (Design, `HOM_TEST`), `hom-pia` (Design), `hom-omar` (Ops), `hom-mina` (Design), `hom-gone` (Design, payroll profile `isPayrollActive: false`); `beforeEach` deletes `leaveRequest`, `leaveHoliday` (by id prefix `hom-`), `payrollEmployeeProfile`, `user` rows with id prefix `hom-` only):
  - `each person counts once; half days count; rejected and cancelled do not` — Pia APPROVED full day + PENDING overlapping; Omar half day CASUAL `LEAD_APPROVED`; Mina `REJECTED`; viewer `CANCELLED`; `hom-gone` APPROVED. Assert the `hom-` people in `outToday.people` are exactly Omar and Pia, Omar `pending: true`, Pia `pending: false`, and `departmentOutToday === 1`.
  - `out today uses the Karachi day` — a leave on 2031-03-13 only; `loadHomeOverview(viewer, new Date('2031-03-12T19:30:00Z'))` includes it, `new Date('2031-03-12T18:30:00Z')` does not.
  - `next out in your department` — Mina APPROVED 2031-03-20 → `{ name: 'Mina Arlow', startDate: '2031-03-20' }`; a leave 2031-06-01 (beyond 60 days) is ignored; the viewer's own future leave is ignored.
  - `next holiday for your team tag` — holidays `hom-h1` 2031-03-11 (past), `hom-h2` 2031-04-01 `HOM_TEST`, `hom-h3` 2031-03-20 `OTHER_TAG` → `nextHoliday = { date: '2031-04-01', name: …, daysAway: 20 }`, `teamLabel === 'HOM_TEST team'`, `upcomingHolidays.length === 1`.
  - `no team tag: no holidays, no error` — viewer with `teamTag: null` → `nextHoliday === null`, `upcomingHolidays` empty, `teamLabel === null`.
  - Route wiring (source check in `tests/home-out-today.test.ts`): `app/api/home/overview/route.ts` calls `getSession`, `checkRateLimit(` with `home-overview:`, `loadHomeOverview(`, and contains no `reason`.
- [ ] **Step 2: Run to verify they fail.** Unit: `node --import tsx --test tests/home-out-today.test.ts`. DB: `DATABASE_URL=… WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/home-overview.integration.test.ts`. Expected FAIL (modules missing).
- [ ] **Step 3: Implement** the three files.
- [ ] **Step 4: Verify.** Both pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: home overview endpoint for who is out today and team holidays"`.

---

### Task 4: The Needs you list model and its sources (pure)

**Files:**
- Create: `lib/home/needs-you.ts` (item type, sort, combining sources)
- Create: `lib/home/needs-you-sources.ts` (one builder per source)
- Create: `lib/leave-type-style.ts` (leave type labels and colours; see Produces)
- Test: `tests/home-needs-you.test.ts`

**Interfaces:**
- Consumes: Task 1 `EvaluationsCardView`, `FYI_NOTICE_KINDS`; Task 2 `karachiDayKey`, `dayKeyOf`; `AssignedCardView` (`lib/academy/view.ts`); `LateFormsResponse` (`lib/weekly/view-types.ts`); `TaskListItem` (`lib/security-checks/service/task-views.ts`, type-only import); `transitionPlanRequired` (`lib/leave-transition-plan.ts`); `getLeaveRequestPath` (`lib/leave-deep-links.ts`); `isAdminRole` (`lib/permissions.ts`); `formatDateRange`, `formatCountOf`; Task 3 `LeaveTypeValue`.
- Produces (`lib/leave-type-style.ts`, shared with part 4): `LEAVE_TYPE_ORDER = ['CASUAL', 'ANNUAL', 'SICK'] as const`; `LEAVE_TYPE_LABEL: Record<LeaveTypeValue, string>` (`Casual`, `Sick`, `Annual`); `LEAVE_TYPE_TONE: Record<LeaveTypeValue, { bar: string; dot: string; text: string }>` — casual `bg-amber-500`/`bg-amber-500`/`text-amber-600 dark:text-amber-400`, annual emerald, sick red (the colours `/leave` uses today).
- Produces (`lib/home/needs-you.ts`):
  - `type NeedsYouSource = 'weekly' | 'late-forms' | 'self-review' | 'academy' | 'team-lead-form' | 'leave-approval' | 'wfh-approval' | 'own-plan' | 'security-check' | 'tickets'` and `const SOURCE_ORDER: readonly NeedsYouSource[]` in that order.
  - `interface NeedsYouItem { key: string; source: NeedsYouSource; eyebrow: string; title: string; detail: string | null; dueDay: string | null; href: string; action: string; prefetch: boolean }`
  - `sortNeedsYou(items: readonly NeedsYouItem[]): NeedsYouItem[]` — Ruling 11; returns a new array.
  - `isOverdue(item: NeedsYouItem, todayKey: string): boolean`
- Produces (`lib/home/needs-you-sources.ts`) — input row types are the minimal fields read from each existing endpoint:
  - `weeklyItems(card: EvaluationsCardView | null): NeedsYouItem[]` — `CHECK_LISTS`: eyebrow "Weekly evaluation", title "Check your evaluation lists", action "Check"; `THIS_WEEK`: title "Answer this week’s questions", detail `${formatCountOf(done, total)} done` plus `card.detail` after " · " when present, action "Answer"; both `dueDay = karachiDayKey(dueAt)`. `card.selfReview` → source `self-review`, eyebrow "Self-evaluation", title = the sentence, action "Write". Each notice whose kind is not in `FYI_NOTICE_KINDS` → eyebrow "Evaluation lists" (`LIST_CHANGE_TO_REVIEW`, `PEER_CHANGE_ABOUT_YOU`, `HR_LIST_CHANGES`), "Self-evaluation from your team" (`TEAM_SELF_REVIEW`, action "Read"), "Quarter-end forms" (`FORMS_OPEN`, action "Fill in"), "Weekly evaluation" (others); action "Review" unless stated; `href = notice.href`; `dueDay: null`. All hrefs come from the card.
  - `lateFormItems(res: LateFormsResponse | null): NeedsYouItem[]` — when `quarter` and forms left: title `Finish your ${quarter.name} evaluations`, detail `${formatCountOf(total - forms.length, total)} done`, href `/evaluations/weekly`, action "Finish".
  - `academyItems(items: readonly AssignedCardView[]): NeedsYouItem[]` — eyebrow "Assigned by HR", title = module title, detail `Please read this again` / `HR asked you to read this` plus ` · About N min` when > 0 (today's wording), href `/onboarding/${slug}`, action "Read", `prefetch: false` (opening a module marks it started).
  - `interface PendingTeamLeadForm { id: string; name: string; title: string; department: string | null; onboardingDate: string }`; `teamLeadFormItems(rows): NeedsYouItem[]` — eyebrow "Onboarding form", title `Fill in the onboarding form for ${name}`, detail title and department, due `dayKeyOf(onboardingDate)`, href `/team-lead-form/${id}`, action "Fill in".
  - `interface ApprovalLeaveRow { id: string; leaveType: LeaveTypeValue; status: string; startDate: string; endDate: string; transitionPlanSubmittedAt?: string | null; transitionPlanLeadStatus?: string | null; employee: { id: string; name: string } }`; `leaveApprovalItems(rows, viewer: { role: string }): NeedsYouItem[]` — Ruling 9. HR (`isAdminRole`): rows with status `PENDING`/`LEAD_APPROVED` → one item, eyebrow "Leave requests", title `${n} leave request(s) waiting for HR`, due = earliest start, href `/admin/leave`, action "Review". Lead: per row, status `PENDING`/`HR_APPROVED` → title `Approve ${name}’s ${label} leave` (label lower-case: "casual"), detail `formatDateRange(start, end)` (+ ` · Handover plan to review too` when its plan is pending); otherwise a pending plan alone → eyebrow "Handover plan", title `Review ${name}’s handover plan`, detail the range. Due = start; href `getLeaveRequestPath(id)`; action "Review"; key `leave:${id}`.
  - `interface ApprovalWfhRow { id: string; status: string; startDate: string; endDate: string; employee: { name: string } }`; `wfhApprovalItems(rows, viewer: { role: string })` — HR: one item `${n} WFH request(s) waiting for HR` → `/admin/leave`; lead: per row with status `PENDING`/`HR_APPROVED`, title `Approve ${name}’s work from home`, href `/leave`, action "Review".
  - `interface OwnLeaveRow { id: string; leaveType: LeaveTypeValue; status: string; isHalfDay: boolean; startDate: string; endDate: string; transitionPlanSubmittedAt?: string | null; transitionPlanLeadStatus?: string | null }`; `ownPlanItems(rows, viewer: { department: string | null }, todayKey: string)` — Ruling 10; eyebrow "Your leave", title `Add a handover plan for your ${label} leave` (or `Update your handover plan …` when `DISAPPROVED`), detail the range, due start, href `getLeaveRequestPath(id)`, action "Add plan" / "Update plan".
  - `securityTaskItems(tasks: readonly Pick<TaskListItem, 'id' | 'campaignName' | 'statusLabel' | 'deadline' | 'resubmitDueAt' | 'needsAction'>[]): NeedsYouItem[]` — `needsAction` only; eyebrow "Security check", title = campaign name, detail = status label, due `karachiDayKey(resubmitDueAt ?? deadline)`, href `/security-checks/${id}`, action "Open".
  - `interface TicketRow { id: string; title: string; status: string; createdAt: string }`; `ticketItems(tickets, role: string)` — HR/SECURITY only, statuses `OPEN`/`UNDER_REVIEW`, one item `${n} open device ticket(s)`, detail newest title, href `/security/device-tickets` (SECURITY) or `/admin/device-tickets` (HR), action "Manage", due `null`.

- [ ] **Step 1: Write the failing tests** (`tests/home-needs-you.test.ts`, fictional names), at least:
  - `sorted by due day, undated last, ties by source order` — items due `2026-11-13` (leave), `2026-11-12` (weekly), `null` (tickets), `2026-11-12` (academy… dueDay forced in the fixture) → keys in order weekly, academy, leave, tickets.
  - `weekly: actions in, FYI out` — a `THIS_WEEK` card with notices of kinds `LIST_DECISION`, `HR_CHANGED_LISTS`, `PEER_CHANGE_ABOUT_YOU`, `TEAM_SELF_REVIEW` and a `selfReview` → titles `["Answer this week’s questions", "Your self-evaluation for October is waiting", "Ana Torvik asked to remove you as a peer", "Ben Okafor has submitted their self-evaluation for October"]`; the first item's detail `"1 of 2 done · 1 from last week"`.
  - `caught up and closed add nothing but notices`.
  - `one item per request even with a plan to review` — lead rows: `PENDING` with plan pending → one item whose detail ends `Handover plan to review too`; `APPROVED` with plan pending → one "Review Cara Lindqvist’s handover plan" item; `LEAD_APPROVED` without plan → none; href `/leave?requestId=…`.
  - `HR gets one summary item, never per-request items` — role `HR`, three `PENDING`/`LEAD_APPROVED` rows → one item titled `3 leave requests waiting for HR`, href `/admin/leave`, due the earliest start.
  - `your leave needs a plan unless it is exempt` — department `Design`: full-day annual unsubmitted → item; half day → none; single sick day → none; started yesterday → none; disapproved plan → "Update plan"; department `3E` → none.
  - `academy modules are never prefetched` — `prefetch === false`, href `/onboarding/data-handling`.
  - `tickets only for HR and Security, linked to their console`.
  - `security checks that need you, due on the resubmit date when there is one`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-needs-you.test.ts`.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat: needs-you list model and its sources"`.

---

### Task 5: Time off and My work rules (pure)

**Files:**
- Create: `lib/home/time-off.ts`
- Create: `lib/home/my-work.ts`
- Test: `tests/home-time-off.test.ts`, `tests/home-my-work.test.ts`

**Interfaces:**
- Consumes: Task 4 `lib/leave-type-style.ts`, `OwnLeaveRow`; Task 3 `OUT_STATUSES`, `PENDING_STATUSES`; Task 2 `dayKeyOf`.
- Produces (`lib/home/time-off.ts`):
  - `interface BalanceInput { casualDays: number; casualUsed: number; sickDays: number; sickUsed: number; annualDays: number; annualUsed: number }`
  - `interface TimeOffPart { type: LeaveTypeValue; left: number; total: number }`
  - `interface NextLeave { range: string; type: LeaveTypeValue; pending: boolean }`
  - `summariseTimeOff(balance: BalanceInput, own: readonly OwnLeaveRow[], todayKey: string): { totalLeft: number; parts: TimeOffPart[]; partsPhrase: string; totalPhrase: string; nextLeave: NextLeave | null }` — `left` floors at 0; order `LEAVE_TYPE_ORDER`; `partsPhrase` joins `"5 casual"` / `"4.5 annual"` / `"No sick left"` with ` · `; `totalPhrase` = `formatDays(totalLeft) + ' left'`, or `"No days left"`; next leave = own row in `OUT_STATUSES` with `dayKeyOf(endDate) >= todayKey`, earliest start, `range = formatDateRange(start, end)`, `pending` = status in `PENDING_STATUSES`.
  - `nextLeavePhrase(next: NextLeave | null): string` — `"No leave booked yet"`, or `Next: ${range}, ${label lower-case}` plus ` (waiting for approval)` when pending.
- Produces (`lib/home/my-work.ts`):
  - `const OPEN_TASKS_SHOWN = 4`, `const PROJECTS_SHOWN = 3`
  - `interface HomeTask { id: string; title: string; status: string; priority: string; dueDate: string | null; project: { id: string; name: string }; section?: { name: string } | null }`
  - `pickOpenTasks(tasks: readonly HomeTask[]): { shown: HomeTask[]; more: number }` — not `DONE`, keeps API order, undated after dated.
  - `interface HomeProject { id: string; name: string; status: string; owner: { id: string }; members: { id: string }[]; progress: { completed: number; total: number; percentage: number | null } }`
  - `pickActiveProjects(projects: readonly HomeProject[], viewerId: string): { shown: HomeProject[]; more: number }` — Ruling 13.
  - `projectProgressPhrase(p: HomeProject['progress']): string` — `"86 of 108 tasks done"`, `"No tasks yet"` at 0.
  - `interface PanelContext { members: { id: string; name: string; role: string }[]; sections: ProjectStatusSection[]; labels: Label[]; sprints: PanelSprint[]; canManage: boolean; canEditTask(task: PanelTask): boolean }`
  - `panelContextFromProject(project: ProjectDetail, viewer: { id: string; role: string }): PanelContext` — the exact rules at `app/(evaluator)/projects/[id]/page.tsx` lines 358–385: members `{ ...m.user, role: m.role }`; `canManage = project.canManage ?? (role === 'HR' || owner is viewer || viewer is an OWNER/LEAD member)`; sections without backlog when `canUseBacklog === false`; `canEditTask` = `canManage` or assignee or assistant. `ProjectDetail` is the minimal shape of `GET /api/projects/{id}`'s `project` those rules read (`members`, `owner`, `canManage?`, `canUseBacklog?`, `sections`, `labels`, `sprints?`, `tasks: PanelTask[]`). Import the panel's types from `components/projects/TaskDetailPanel.tsx` (type-only; export `PanelSprint` there if it is not exported — a one-word change that adds no lines).

- [ ] **Step 1: Write the failing tests.**
  - `time off: totals, decimals and none left` — balance casual 10/5, annual 14/0, sick 8/8.5 → `totalLeft 19`, `partsPhrase "5 casual · 14 annual · No sick left"`, `totalPhrase "19 days left"`; casual 10/5.5 → `"4.5 casual"`; all used → `"No days left"`.
  - `next leave is the earliest one not over, pending marked` — rows: ended yesterday (APPROVED), `REJECTED` next week, `PENDING` 19–23 Nov 2026 → `nextLeavePhrase` `"Next: Thu 19 – Mon 23 Nov, annual (waiting for approval)"` (pass `now`-independent fixture years: use the current year of `todayKey`, and assert with `formatDateRange` output for the same inputs rather than a hard-coded year).
  - `no leave booked` → `"No leave booked yet"`.
  - `open tasks: four, dated first`; `projects: active ones you belong to, three at most` (HR's non-member project excluded, `COMPLETED` excluded, `more` counted); `progress phrase`.
  - `panel context follows the project page's rules` — a viewer who is a `LEAD` member can manage; a plain member can edit only tasks assigned to them or where they assist; backlog sections hidden when `canUseBacklog: false`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-time-off.test.ts tests/home-my-work.test.ts`.
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Run to verify they pass.** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: time off and my work rules for home"`.

---

### Task 6: Loading Home's data, each source on its own

**Files:**
- Create: `components/home/fetch-source.ts` (no `'use client'`; plain functions)
- Create: `components/home/use-home-data.ts` (`'use client'`)
- Test: `tests/home-data.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5 types and builders.
- Produces (`components/home/fetch-source.ts`):
  - `type Source<T> = { ok: true; data: T } | { ok: false; status: number | null }`
  - `fetchSource<T>(url: string, pick: (body: unknown) => T | null, fetcher?: typeof fetch): Promise<Source<T>>` — `cache: 'no-store'`; non-2xx → `{ ok: false, status }`; thrown or `pick` → `null` → `{ ok: false, status: null }`; every failure except 404 logs `console.error('[home] source failed', { url, status })`.
  - `const NOT_LOADED: Source<never>` = `{ ok: false, status: 404 }` (a source this role does not fetch).
  - `interface NeedsYouSources { card: Source<EvaluationsCardView | null>; lateForms: Source<LateFormsResponse>; academy: Source<AssignedCardView[]>; teamLeadForms: Source<PendingTeamLeadForm[]>; leaveApprovals: Source<ApprovalLeaveRow[]>; wfhApprovals: Source<ApprovalWfhRow[]>; ownLeave: Source<OwnLeaveRow[]>; securityTasks: Source<TaskListItem[]>; tickets: Source<TicketRow[]> }`
  - `needsYouFromSources(s: NeedsYouSources, viewer: { role: string; department: string | null }, todayKey: string): { items: NeedsYouItem[]; incomplete: boolean }` — runs every builder on the sources that loaded, returns `sortNeedsYou` of the lot; `incomplete` when any source failed with a status other than 404.
  - `HOME_SOURCES` — the URL and `pick` per source, exactly: `/api/weekly/card` (`body.card`), `/api/weekly/late-forms` (the body), `/api/onboarding/academy/assigned` (`body.data` array), `/api/onboarding/team-lead-forms/pending` (`body.pending`), `/api/leave/requests?forApproval=true` (`body.requests`), `/api/wfh/requests?forApproval=true` (`body.requests`), `/api/leave/requests?employeeId=me` (`body.requests`), `/api/security-checks/me` (`body.data`), `/api/security-checks/tasks` (`body.data`), `/api/device-tickets` (`body.tickets`), `/api/leave/balance` (`body.balance`), `/api/leave/requests?scope=team-upcoming` (`body.requests`), `/api/home/overview` (`body.data`), `/api/my-tasks?status=ACTIVE&sort=due_asc` (`body.tasks`), `/api/projects` (`body.projects`).
- Produces (`components/home/use-home-data.ts`): `useHomeData(user: { id: string; role: string; department?: string | null } | null): HomeData` where `interface HomeData { loading: boolean; todayKey: string; overview: Source<HomeOverview> | null; balance: Source<BalanceInput> | null; ownLeave: Source<OwnLeaveRow[]> | null; teamUpcoming: Source<TeamUpcomingRow[]> | null; needsYou: { items: NeedsYouItem[]; incomplete: boolean } | null; tasks: Source<HomeTask[]> | null; projects: Source<HomeProject[]> | null; reloadTasks(): Promise<void> }` (`null` = still loading). One `Promise.all` once `user` is set. `device-tickets` only for roles `HR`/`SECURITY` (else `NOT_LOADED`); `security-checks/tasks` only when `/me` says `enabled` and `actionable > 0` (else `NOT_LOADED`). The own-leave source is fetched once and shared by Needs you and Your time off. `TeamUpcomingRow` = `{ id, leaveType, status, startDate, endDate, employee: { id, name, department } }`, exported from `lib/home/out-today.ts`.

- [ ] **Step 1: Write the failing tests** (`tests/home-data.test.ts`, with a fake `fetcher`):
  - `fetchSource: ok, http error, network error, bad body` → `{ ok: true }`, `{ ok: false, status: 500 }`, `{ ok: false, status: null }`, `{ ok: false, status: null }`.
  - `a failing source marks Needs you incomplete; a 404 does not` — sources with `leaveApprovals` `{ ok: false, status: 500 }` and a `card` with one `THIS_WEEK` item → one item, `incomplete: true`; the same with `status: 404` → `incomplete: false`.
  - `HOME_SOURCES never asks for device tickets for an employee` — a source check on `use-home-data.ts`: `/api/device-tickets` sits inside a branch on `HR`/`SECURITY`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-data.test.ts`.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat: load home data source by source"`.

---

### Task 7: The three cards

**Files:**
- Create: `components/home/OutTodayCard.tsx`, `components/home/OutTodayDialog.tsx`, `components/home/TimeOffCard.tsx`, `components/home/HolidayCard.tsx`, `components/home/HomeCard.tsx` (shared card frame: title, top-right link or button, body, footer row)
- Test: `tests/home-cards.test.ts` (`renderToStaticMarkup` with `createElement`, as `tests/page-frame.test.ts` does in part 2)

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces:
  - `HomeCard({ title: string; link?: { label: string; href: string } | { label: string; onClick: () => void }; children; footer?: React.ReactNode })` — `Card` with `p-5`, title `text-sm font-medium text-muted-foreground`, link `text-sm text-primary`.
  - `OutTodayCard({ overview: Source<HomeOverview> | null; teamUpcoming: Source<TeamUpcomingRow[]> | null })` — loading → `Skeleton`; failed → "Could not load who is out today." Body: big count + "person out" / "people out" (0: "Nobody is out today."); the department sentence from `homeSummary`'s second half in `text-emerald-600 dark:text-emerald-400` when all in; `${first name} is next out on ${formatDate(startDate)}.` when present; for leads with upcoming rows, `${n} on your team have leave coming up`. Footer: up to 4 `UserAvatar size="xs"` and a `+N` chip; "See who" `Button variant="outline"` opening `OutTodayDialog`. Link "Team calendar" → `/leave`.
  - `OutTodayDialog({ open; onOpenChange; people: OutPerson[]; teamUpcoming: TeamUpcomingRow[] })` — `Dialog` titled "Out today": each person's name, department, `LEAVE_TYPE_LABEL[type]` with its dot, "Half day" when half, "Waiting for approval" when pending; empty → "Nobody is out today."; a second section "Your team’s upcoming leave" (only when rows exist): name, type, `formatDateRange`, status ("Waiting for approval" for pending statuses), first 6 then "and N more on the Time off page" linking `/leave`.
  - `TimeOffCard({ balance: Source<BalanceInput> | null; ownLeave: Source<OwnLeaveRow[]> | null; todayKey: string })` — big `totalLeft` + "days left" (from `totalPhrase`), a bar of `parts` with `left > 0` sized by share of `totalLeft` using `LEAVE_TYPE_TONE[type].bar` (`role="img"` with `aria-label` = `partsPhrase`), the `partsPhrase` row with dots ("No sick left" in `text-destructive`), footer `nextLeavePhrase` and **Request leave** `Button asChild` → `<Link href="/leave?request=1">`. Link "History" → `/leave#my-requests`. Failed balance → "Could not load your balance." plus the same footer links.
  - `HolidayCard({ overview: Source<HomeOverview> | null })` — big `formatDate(nextHoliday.date)`, the name, footer `inDaysPhrase(daysAway)` and a chip `${teamLabel}` (`rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5`); "All holidays" button opens a `Dialog` listing `upcomingHolidays` (`formatDate` + name). No team (`teamLabel === null`) → Ruling 7 text, no "All holidays"; no holiday → "No upcoming holidays for your team yet."

- [ ] **Step 1: Write the failing tests** (`tests/home-cards.test.ts`):
  - `out today: count, department sentence and next out` — overview with 6 people, `department 'Design'`, `departmentOutToday 0`, next out Mina 2026-11-26 → markup contains `6`, `people out`, `Everyone in Design is in today.`, `Mina is next out on Thu 26 Nov.`, `href="/leave"`, `See who`.
  - `out today: nobody out` → `Nobody is out today.`
  - `time off: request leave opens the Time off request panel` → contains `href="/leave?request=1"`, `href="/leave#my-requests"`, `19`, `5 casual`, `No sick left`, `No leave booked yet`.
  - `holiday: date, days away and team chip` → `Fri 25 Dec`, `In 44 days`, `Pakistan team` (overview built with `teamLabel: 'Pakistan team'`).
  - `holiday: no team set` → `No team is set on your profile`.
  - `a failed source shows its own line` — each card with `{ ok: false, status: 500 }` renders its failure sentence and no `undefined`/`NaN`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-cards.test.ts`.
- [ ] **Step 3: Implement** the components (dialogs closed by default, so static markup shows only the cards).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit.** `git commit -m "feat: out today, time off and holiday cards on home"`.

---

### Task 8: Needs you, My work and the task side sheet

**Files:**
- Create: `components/home/NeedsYouList.tsx`, `components/home/MyWorkPanel.tsx`, `components/home/HomeTaskSheet.tsx`
- Modify (only if needed): `components/projects/TaskDetailPanel.tsx` — `export` on the `PanelSprint` interface, nothing else
- Test: `tests/home-sections.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6; `TaskDetailPanel`, `PanelTask`.
- Produces:
  - `NeedsYouList({ data: { items: NeedsYouItem[]; incomplete: boolean } | null; todayKey: string })` — heading row "Needs you" with `${n} open, sorted by due date` on the right; a `Card` with `divide-y divide-border`; each row: eyebrow `text-xs font-medium text-primary`, title `font-medium text-foreground`, meta line (`Due ${formatDate(dueDay)}` or `Overdue since ${formatDate(dueDay)}` in `text-destructive`, then `detail`), and one button (`Button` default variant for the first row, `variant="outline"` for the rest) rendering `<Link href={item.href} prefetch={item.prefetch ? undefined : false}>{item.action}</Link>`. First 6, then a "Show N more" text button that reveals the rest. Empty → "Nothing needs you right now." `incomplete` → a `text-sm text-muted-foreground` line "Some items could not be loaded. Refresh to try again." Loading → three skeleton rows.
  - `MyWorkPanel({ tasks: Source<HomeTask[]> | null; projects: Source<HomeProject[]> | null; viewerId: string; onOpenTask(task: HomeTask): void })` — heading "My work" with "Open My work" → `/my-tasks`; "Your open tasks": each shown task is a `<button type="button">` (title, project name, priority, section name, `Due …` / "No due date") calling `onOpenTask`; empty → "No open tasks. Nice." ; "Your projects": name, `projectProgressPhrase`, percentage, `Progress` with `aria-label`, each a `Link` to `/projects/${id}`; "and N more" → `/projects`; empty → "You have no active projects."
  - `HomeTaskSheet({ task: HomeTask | null; viewer: { id: string; role: string }; onClose(): void; onChanged(): Promise<void> | void })` — when `task` is set, loads `/api/projects/${task.project.id}` (a `Map` cache in a `useRef`), finds the `PanelTask` by id, builds `panelContextFromProject`, renders `TaskDetailPanel` with `open`, `projectId`, the context, `canEdit={ctx.canEditTask(panelTask)}`, `onTaskUpdate` → refresh cache entry and `onChanged()`, `onTaskDelete` → `onClose()` and `onChanged()`, `onTasksChange` → reload project and `onChanged()`, `onOpenTask(id)` → switch to that task in the same project. Fetch failure or task not found → `toast.error('Could not open this task. Open it from My work.')` and `onClose()`.

- [ ] **Step 1: Write the failing tests** (`tests/home-sections.test.ts`):
  - `needs you: one button per item, overdue marked` — two items, one with `dueDay` before `todayKey` → markup has two `<a`, `Overdue since`, `2 open, sorted by due date`.
  - `needs you: empty state` → `Nothing needs you right now.`
  - `needs you: academy links are not prefetched` — source check on `NeedsYouList.tsx`: `prefetch={item.prefetch ? undefined : false}`.
  - `needs you: incomplete note`.
  - `my work: tasks are buttons, projects are links` → `<button`, `href="/projects/p1"`, `href="/my-tasks"`, `86 of 108 tasks done`.
  - `the side sheet reuses the task panel` — source check on `HomeTaskSheet.tsx`: imports `TaskDetailPanel` from `@/components/projects/TaskDetailPanel`, calls `panelContextFromProject(`, fetches `` `/api/projects/${ ``, and has no `router.push`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/home-sections.test.ts`.
- [ ] **Step 3: Implement** the three components.
- [ ] **Step 4: Run to verify they pass.** `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: needs you list, my work and the task side sheet on home"`.

---

### Task 9: Assemble the new Home

**Files:**
- Create: `components/home/HomePage.tsx` (`'use client'`)
- Modify (replace contents): `app/(evaluator)/dashboard/page.tsx`
- Delete: `components/weekly/WeeklyQuestionsCard.tsx`, `components/academy/AssignedCard.tsx` (first confirm with `grep -rn "WeeklyQuestionsCard\|AssignedCard\b" app components tests` that the dashboard was their only importer; keep `AssignedCardView` in `lib/academy/view.ts`)
- Test: `tests/home-wiring.test.ts`

**Interfaces:**
- Consumes: part 2 `PageContainer`, `PageHeader`, `useLayoutUser`; Tasks 2, 6, 7, 8.
- Produces: `HomePage()` — `const user = useLayoutUser()`; `const data = useHomeData(user)`; the greeting `${greetingFor(new Date().getHours())}, ${firstName}` (first word of `user.name`, or "there"), computed after mount so the server and client markup agree; renders:

```
<PageContainer>
  <PageHeader dateLine={formatDate(data.todayKey)} title={greeting} subtitle={homeSummary(...)} />
  <div className="grid gap-4 md:grid-cols-3">  OutTodayCard · TimeOffCard · HolidayCard
  <div className="mt-8 grid gap-6 lg:grid-cols-2">  NeedsYouList · MyWorkPanel
  <HomeTaskSheet …/>
</PageContainer>
```

  `homeSummary` gets `needsYou: data.needsYou?.items.length ?? null`, and `department`/`departmentOutToday` from a loaded overview (else `null`). `app/(evaluator)/dashboard/page.tsx` becomes `'use client'` + `export default function DashboardPage() { return <HomePage /> }`.

- [ ] **Step 1: Write the failing test** (`tests/home-wiring.test.ts`, source checks with `readFileSync`):
  - `the dashboard page is the new Home` — `dashboard/page.tsx` imports `HomePage` from `@/components/home/HomePage` and is under 40 lines.
  - `Home adopts the frame` — `HomePage.tsx` imports `PageContainer` from `@/components/layout/page-container` and `PageHeader` from `@/components/layout/page-header`, contains `<PageContainer` and `<PageHeader`, and no `max-w-6xl mx-auto`.
  - `what moved off Home stays off it` — no file under `components/home/` or the dashboard page mentions `StatsCard`, `Team Directory`, `My Equipment`, `/api/assets/my`, `/api/users/team`, `Who you evaluate`, `Quarter progress`, `PulseSurvey`, or `/api/weekly/survey`.
  - `no browser dialogs and no slashes for counts` — no `alert(`, `confirm(`, `prompt(`, `toLocaleDateString(` in `components/home/*` or `lib/home/*`.
  - `every home file is under 800 lines` — each file in `components/home` and `lib/home`.
  - `the old dashboard cards are gone` — `components/weekly/WeeklyQuestionsCard.tsx` and `components/academy/AssignedCard.tsx` do not exist.
- [ ] **Step 2: Run to verify it fails.** `node --import tsx --test tests/home-wiring.test.ts`.
- [ ] **Step 3: Implement** `HomePage.tsx`, the page swap and the two deletions.
- [ ] **Step 4: Verify.** The test passes; `npx tsc --noEmit` clean; `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — still exactly 19 failures.
- [ ] **Step 5: Commit.** `git commit -m "feat: new home with needs you, time off and my work"`.

---

### Task 10: Whole-part verification and the checklist walk (commit only if something was fixed)

- [ ] `npx tsc --noEmit` — no errors.
- [ ] `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — exactly 19 failures (18 api-integration, 1 rate-limit).
- [ ] `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/home-overview.integration.test.ts tests/weekly-dashboard-card.integration.test.ts tests/weekly-dashboard.integration.test.ts` — all pass.
- [ ] `git diff --stat HEAD~9 -- components/layout lib/people lib/notifications prisma lib/email.ts app/api/leave app/api/wfh` — empty (this part touched none of them).
- [ ] `wc -l components/home/* lib/home/* "app/(evaluator)/dashboard/page.tsx"` — every file under 800.
- [ ] Walk the appendix "Home today → new home" rows and record where each lives now (in the commit message body if a fix is committed, otherwise in the PR description later):
  - Assigned modules → Needs you (`academyItems`).
  - Weekly card states and notices → Needs you (`weeklyItems`, actions); FYI outcomes and HR list changes → bell (part 2); HR "list changes / answers waiting" → Needs you (`HR_LIST_CHANGES`, `HR_ANSWERS`).
  - Open this week, Quarter progress, Who you evaluate → Evaluations page (`WeeklyInbox`), plus the "Answer this week’s questions" item.
  - Leaves remaining, Leave balance card → Your time off card.
  - Active projects, Projects card → My work.
  - Pending onboarding forms → Needs you (`teamLeadFormItems`).
  - Leave requests for approval (leads/HR, HR → `/admin/leave`) → Needs you (`leaveApprovalItems`, `wfhApprovalItems`); disapprove-only approved requests → `/leave` Team approval queue.
  - Upcoming team leaves (leads) → Out today card and its "See who" dialog.
  - Open tickets (HR/Security → consoles) → Needs you (`ticketItems`).
  - Team directory → `/people` My team (part 2).
  - Device Support card, My equipment → Help & IT (`/device-support`, assigned assets).
- [ ] Optional smoke run if the environment allows without installs: `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test npx next dev -p 3100`; sign in as a fictional test user; check light and dark mode, phone width (cards stack, no horizontal scroll), "See who", "All holidays", a task opening in the side sheet, and that **Request leave** goes to `/leave?request=1`. Stop the server afterwards.
- [ ] If anything was fixed: `git commit -m "fix: <what>"` with the Co-Authored-By line. Do not push.

---

## Interfaces part 4 (Time off) consumes

- **`/leave?request=1` opens the request panel.** Home's **Request leave** button links there. Part 4 reads the `request` search param on `/leave`, opens the 3-step request panel at step 1 with no dates chosen, and removes the param (`router.replace('/leave')`) so a refresh does not reopen it.
- **`/leave#my-requests` is the My requests section.** Home's "History" link uses it; part 4 gives that section `id="my-requests"` (with `scroll-mt-24`).
- **`/leave?requestId=<id>` keeps working** for both the approval queue and the person's own requests (`resolveLeaveRequestDeepLinkTarget`): Home links lead approvals, handover plan reviews and "add a handover plan for your leave" there.
- **`/leave` shows the team calendar** (Home's "Team calendar" link and the "and N more" line in "See who").
- `lib/leave-type-style.ts` (`LEAVE_TYPE_ORDER`, `LEAVE_TYPE_LABEL`, `LEAVE_TYPE_TONE`) — part 4's balance cards and calendar chips should use it so Home and Time off colour leave types the same way.
- `lib/home/out-today.ts` `OUT_STATUSES` / `PENDING_STATUSES` and `lib/home/time.ts` `karachiDayKey` are available if part 4 needs "today" or the calendar's status set; part 4 must not change their meaning.
- The leave API routes are unchanged by this part; Home reads `GET /api/leave/balance`, `GET /api/leave/requests?employeeId=me|forApproval=true|scope=team-upcoming` and `GET /api/wfh/requests?forApproval=true` with their current response shapes (`balance`, `requests`). If part 4 changes any of these shapes, it updates the `pick` functions in `components/home/fetch-source.ts` and `tests/home-data.test.ts` with it.
