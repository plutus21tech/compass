# Onboarding Academy — Stage 4 (HR Operations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HR and OA everything they need to run onboarding from Compass: the tracker and drawer, the HR checklist with auto-ticks, all reminders and notifications, OA's view of payment details, re-reads and single-module assignment, and editors for module content, quiz questions and the checklist, so HR needs no engineer.

**Architecture:** Same layout as earlier stages: pure rules in `lib/academy/*`, DB access in `lib/academy/service/*`, thin routes, server pages handing plain views to client components. One hourly job, `/api/cron/onboarding`, does all scheduled work, and one log table makes every notice idempotent. Checklist auto-ticks are derived from stored data by a single sync function, not recorded as events.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 / Postgres, TypeScript, Zod 4, PDFKit, existing `lib/email.ts` and `lib/cron-auth.ts`, `node --test` with tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md` (§5.4, §5.5, §5.8, §6.3, §7 HR side, §8, §9). Spec screens 7 and 8 are in `Compass Onboarding Academy_ Product Spec.docx`, in the parent checkout, untracked. Read the "After stage" sections of the stage 1, 2 and 3 plans and the payroll separation plan.

**Branch:** `feat/onboarding-academy-stage-4`, cut from the tip of `feat/onboarding-academy-stage-3`, in the worktree with no `.env`.

## Global Constraints

- Every constraint in the earlier plans still applies: additive migrations, never the root `.env` (it is production), fictional test data, flag off means no change.
- **Onboarding never writes to payroll, and never reads anyone's pay or bank data from it.** `tests/academy-payroll-separation.test.ts` stays green. Any new payroll read goes through `lib/academy/service/shared-reads.ts` and needs the user's approval.
- **Payment details:** HR and OA read them masked, every reveal is logged, and no other role sees them. The tracker shows OA the payment columns only.
- **Settings and the tracker are HR only** (`canManageOnboarding`). OA gets read access to payment-related columns only (§9).
- **Existing staff are never locked out** by an assignment or a re-read (D2).
- **Changing the checklist template never alters checklists already created** (§5.8).
- **All notices are email, use `COMPASS_URL`, and run after commit** with `after()` in routes. A failed send never fails an action.
- **No personal or pay data in emails** beyond a name.
- **Copy is warm, short and second person, no emoji.** Don't invent company facts. Every added line goes in the implementer's report.

**Plan decisions (not in the design; correct them here if wrong):**
- **Editors replace the old pages.** With the flag on, `/admin/onboarding/modules` and `/admin/onboarding/quiz` redirect to the new editors, which removes the stranded switch and the risk of blanking an `explanation`. The legacy `PUT` and question routes refuse edits with the flag on. They go in the cleanup push.
- **Quiz attempts are cleared from the tracker drawer,** because the old quiz page goes away.
- **Module editor is structured, not free-form.** HR edits the text of each block, adds, removes and reorders blocks, and publish is refused if the result can't be completed.
- **The checklist auto-ticks when the tracker loads and hourly,** because auto-ticks are derived from stored data.
- **Late auto-ticks need no reason at the moment they tick.** They show as "Closed late, reason needed" until HR adds one, so every miss still gets a reason.
- **Security call time is added** to the setup fields, and shown on Home, because the spec's Home card lists it.
- **The "Lost or stolen" box is pinned to the Compass dashboard for all staff,** as the spec asks.
- **Hourly cron is assumed.** The repo already runs 8 crons; confirm hourly is allowed on the first preview deploy. The design's fallback stays documented.
- **Bank letter:** still waits for HR's text, so it isn't in this stage.
- **`accountNumber` in `GET /api/admin/users`** belongs to HR's own Users and payroll screen, outside onboarding, so it stays as on main.

## Review Focus

1. **A reminder sent twice, or never.** A retried or overlapping hourly run must not double-send, and a hire in any time zone gets the overdue notice once on each overdue day at their local 10:00. Pinned in Task 4.
2. **A published edit that leaves hires stuck.** Publishing must refuse content that can't be completed, keep Module 7's acknowledgement, and never change what a completed hire sees. Pinned in Task 6.
3. **Re-read or assignment locking someone out or breaking a course.** Existing staff stay unlocked, and a hire mid-course keeps a finishable course. Pinned in Task 5.
4. **OA or a lead seeing more than they should.** Tracker data is filtered on the server by role. Pinned in Task 2.
5. **Checklist drift.** A due date on a weekend, a moved joining date, or an edited template must behave as §5.8 says, and a manual tick is never undone by a sync. Pinned in Task 1.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + one migration | `OnboardingNotificationLog`, `OnboardingPaymentChangeLog`, `NewHire.academyReleasedById`, `NewHire.securityCallAt`, `OnboardingModule.draftBlocks` |
| `lib/academy/checklist.ts` | `checklistDueAt`, `eventsMet`, `toItemState`, tick schema |
| `lib/academy/service/checklist.ts` | `createChecklist`, `syncChecklist`, `tickItem`, template read and edit |
| `lib/academy/tracker.ts`, `service/tracker.ts` | Row and drawer views, filters, role shaping |
| `lib/academy/acknowledgement-export.ts` | Acknowledgement PDF and CSV |
| `lib/academy/reminders.ts`, `service/reminders.ts` | Who is due what, one hourly job |
| `lib/academy/service/notify.ts` | Sending and the once-only log |
| `lib/academy/service/assignment.ts` | `assignModule`, `requestReread` |
| `lib/academy/service/content.ts`, `lib/academy/content-rules.ts` | Draft, publish, publish checks |
| `app/api/cron/onboarding/route.ts` | Hourly job |
| `app/api/admin/onboarding/tracker/**`, `checklist/**`, `content/**`, `assign/**` | HR routes |
| `app/(hr)/admin/onboarding/tracker`, `academy/modules`, `academy/quiz`, `academy/checklist`, `academy/assign` | HR pages |
| `app/(oa)/**` | OA payment view |
| `components/academy/hr/*` | Tracker, drawer, editors |

---

### Task 1: Checklist rules and service

**Files:**
- Modify: `prisma/schema.prisma`; create migration `prisma/migrations/<ts>_onboarding_academy_hr_ops/` holding every stage 4 schema change
- Create: `lib/academy/checklist.ts`, `lib/academy/service/checklist.ts`
- Modify: `lib/academy/service/setup.ts`, `lib/academy/service/course.ts`
- Test: `tests/academy-checklist.test.ts`, `tests/academy-checklist-service.integration.test.ts`

Schema, all additive:
- `OnboardingNotificationLog { id, key String @unique, sentAt DateTime @default(now()) }`
- `OnboardingPaymentChangeLog { id, userId, actorId, method, isFirstSave Boolean, createdAt }`, with no FK, like the reveal log, so it survives deletions
- `NewHire.academyReleasedById String?`, `NewHire.securityCallAt DateTime?`
- `OnboardingModule.draftBlocks Json?`

**Interfaces:**
- Produces:
  - `checklistDueAt(joiningDate: Date, offsetDays: number): Date`: offset applied in calendar days, and a due date on a weekend moves back to the Friday before
  - `AUTO_TICK_EVENTS`: `LEAD_INPUT_SUBMITTED`, `SETUP_READY`, `ACCOUNT_LINKED`, `COURSE_RELEASED`, `DISCORD_USERNAME_SAVED`, `SECURITY_ACK_SIGNED`, `LINKEDIN_VERIFIED`, `PAYMENT_SETUP_DONE`, `COURSE_COMPLETED`
  - `eventsMet(facts: ChecklistFacts): Set<string>`
  - `toItemState(item, now): 'OPEN' | 'OVERDUE' | 'DONE' | 'DONE_LATE' | 'DONE_LATE_NEEDS_REASON'`
  - `createChecklist(db, newHireId): Promise<number>`: creates a hire's rows from active template items only if the hire has none, idempotent, and called from `saveSetup`. A hire with any rows keeps exactly those, so a new or reactivated template item never reaches an existing checklist
  - `syncChecklist(db, newHireId): Promise<number>`: calls `createChecklist` first, so hires set up earlier with no rows are backfilled; ticks open items whose event is met, setting `autoTicked` true and `doneAt` now; never unticks; recomputes `dueAt` for open items when the joining date moved
  - `tickItem(db, itemId, actorId, input: { done: boolean; missReason?: string }): Promise<ChecklistItemView>`: an overdue manual tick needs `missReason`, or 400 "Add a reason for missing this date."; HR can add a reason to a done item; only manual ticks can be unticked
  - `canTickItem(role, item, leadUserId, userId): boolean`: HR any item; SECURITY its own; OA its own; the assigned team lead TEAM_LEAD items

`ChecklistFacts` come from existing data: lead form submitted, `getSetupReadiness`, `userId` linked, `academyReleasedAt`, `User.discordUsername`, a SECURITY_SOPS signature, `User.linkedinUrl` set, a saved `OnboardingPaymentDetails`, `User.onboardingCompleted`.

- [ ] **Step 1: Write the failing tests.**
  - `checklistDueAt`: joining Tuesday 2026-12-01 with -14 gives 2026-11-17; a Saturday result moves to the Friday; a Sunday result moves to the Friday.
  - `eventsMet` for each event, true and false.
  - `createChecklist` creates 17 rows from the seeded template; a second call creates 0; an inactive template item is skipped.
  - Editing a template item doesn't change rows already created.
  - `syncChecklist` ticks `SETUP_READY` when ready, marks `autoTicked`, and never unticks when the fact goes false. A moved joining date changes open `dueAt`, not done ones.
  - `tickItem`: overdue with no reason gives 400; with one it saves; a lead can't tick an HR item; an auto-ticked item can't be unticked; a late auto-tick is `DONE_LATE_NEEDS_REASON` until a reason is added.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Write the schema change and generate the migration** with `prisma migrate diff`, then `prisma db push` to the local DB only. No `prisma format`.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run the tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(academy): add the HR onboarding checklist`

---

### Task 2: Tracker data, drawer actions and role shaping

**Files:**
- Create: `lib/academy/tracker.ts`, `lib/academy/service/tracker.ts`, `lib/academy/acknowledgement-export.ts`, `app/api/admin/onboarding/tracker/route.ts`, `tracker/[newHireId]/route.ts`, `tracker/[newHireId]/unlock/route.ts`, `tracker/[newHireId]/verify-linkedin/route.ts`, `tracker/[newHireId]/acknowledgements/route.ts`, `tracker/[newHireId]/clear-quiz/route.ts`, `checklist/[itemId]/route.ts`
- Modify: `lib/academy/service/course.ts`, `lib/academy/service/payout.ts`, `lib/academy/service/fields.ts`, `lib/academy/view-labels.ts`, `lib/academy/service/setup.ts`, the setup UI, `app/api/admin/onboarding/quiz-attempts/reset/route.ts`
- Test: `tests/academy-tracker.test.ts`, `tests/academy-tracker-service.integration.test.ts`

**Interfaces:**
- Produces:
  - `loadTracker(db, viewer, filters): Promise<TrackerRow[]>`, `loadDrawer(db, viewer, newHireId): Promise<TrackerDrawer>`
  - `TrackerRow = { newHireId, name, title, department, location, joiningDate, status, modulesDone, modulesTotal, overdueCount, quizScore: string | null, checklistDone, checklistTotal, finishedAt: string | null }`
  - `TrackerDrawer`: module-by-module status, version, dates; quiz attempts with score, date and wrong questions; acknowledgements; checklist items with `toItemState`; LinkedIn URL and verified flag; payment summary from the masked API
  - `shapeForRole(row, role)`: OA receives `newHireId`, name, department, joining date, payment status only
  - `unlockModule(db, newHireId, moduleId, actorId)`: sets `unlockedEarlyById` and `IN_PROGRESS`
  - `verifyLinkedin(db, newHireId, actorId)`: copies `state.linkedinUrl` to `User.linkedinUrl`, validated by `linkedinUrlSchema`
  - `acknowledgementPdf(row): Promise<Buffer>`, `acknowledgementsCsv(rows): string`

Rules:
- Filters: location, department, status.
- The tracker lists everyone with a `NewHire` in PENDING or ONBOARDING, plus those who finished in the last 30 days, so finished hires stay visible even if a notice was lost.
- `moduleCardState` and `toModuleCard` treat an early-unlocked `LOCKED` row as `AVAILABLE`.
- Store `academyReleasedById` in `releaseCourse`. `securityCallAt` joins the setup form, `Your calls` and `CallTimesView`. It isn't a required field.
- CSV: guard against spreadsheet formula injection by prefixing a cell starting with `=`, `+`, `-` or `@` with `'`.
- Record `OnboardingPaymentChangeLog` in `savePayout` and `saveBankDetails`, in the same transaction.
- Every route: `requireAcademyHr`, or role-shaped read for OA; writes use `guardAcademyMutation`, including the quiz reset route.

- [ ] **Step 1: Write the failing tests.**
  - `shapeForRole` for OA holds no module, quiz, acknowledgement or checklist data.
  - A plain employee gets 403 at the service seam.
  - `loadTracker` counts, overdue count, quiz score as "10 of 12", and finished hires inside and outside 30 days.
  - A hire with no course yet shows zero modules and no crash.
  - `unlockModule` opens a locked row, the hire can load it, and the card shows AVAILABLE.
  - `verifyLinkedin` saves the URL and the next `syncChecklist` ticks `linkedin-update`; an unset or invalid URL gives 400.
  - CSV escapes quotes and prefixes `=SUM(1)`; the PDF starts `%PDF-`.
  - A payment save writes one change log row with no value in it; `isFirstSave` true then false.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add tracker data and drawer actions`

---

### Task 3: Tracker and OA screens

**Files:**
- Create: `app/(hr)/admin/onboarding/tracker/page.tsx`, `components/academy/hr/TrackerTable.tsx`, `TrackerFilters.tsx`, `TrackerDrawer.tsx`, `ChecklistPanel.tsx`, `ModuleProgressPanel.tsx`, `QuizPanel.tsx`, `AcknowledgementsPanel.tsx`, `PaymentPanel.tsx`; an OA page under `app/(oa)/`
- Modify: `app/(hr)/admin/onboarding/page.tsx`, `components/layout/sidebar-nav.ts`, the OA sidebar
- Test: `tests/academy-tracker-view.test.ts`

Rules, per spec screen 7 and design §7:
- Columns: name, title, location, joining date, modules done as a bar, overdue count, quiz score, HR checklist progress.
- A row opens a side drawer using `components/ui/sheet.tsx`. Drawer sections: module progress with "Unlock early", acknowledgements with downloads, LinkedIn Verify, quiz attempts with wrong questions and "Clear attempts", the checklist with tick and reason controls, and payment details masked with a logged Reveal.
- With the flag on, `/admin/onboarding` shows the tracker. Flag off: unchanged.
- OA page: "Payment details" list showing hires with saved details, newest change first, masked values and Reveal, with no other onboarding data.
- Empty, loading and error states are plain and friendly. It uses the Compass admin look, not the blue hire look.

- [ ] **Step 1: Write the failing test** for any pure labels added: progress text, state chips and the empty message.
- [ ] **Step 2: Run it to confirm it fails.** Expected: FAIL.
- [ ] **Step 3: Build the screens.** Use the `impeccable:impeccable` skill.
- [ ] **Step 4: Walk it in a browser** at 1280px and 768px as HR and as OA against the local DB, and run axe. Expected: no failures or violations in the new screens.
- [ ] **Step 5: Run tests, `npx tsc --noEmit`, `npx next build`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(academy): add the HR tracker and OA payment view`

---

### Task 4: Reminders and notifications

**Files:**
- Create: `lib/academy/reminders.ts`, `lib/academy/service/reminders.ts`, `lib/academy/service/notify.ts`, `app/api/cron/onboarding/route.ts`
- Modify: `lib/email.ts`, `vercel.json`, the release route, the complete route, the LinkedIn route, `lib/academy/service/notify-oa.ts`
- Test: `tests/academy-reminders.test.ts`, `tests/academy-reminders-service.integration.test.ts`

**Interfaces:**
- Produces:
  - `sendOnce(db, key: string, send: () => Promise<{ success: boolean }>): Promise<boolean>`: inserts the log row first with `createMany({ skipDuplicates: true })`, sends only if it inserted, and deletes the row when the send fails, so a later run retries
  - `isLocalHour(now: Date, timeZone: string | null, hour: number): boolean`; a null zone uses `Asia/Karachi`
  - `overdueDayCount(oldestDueAt: Date, now: Date, timeZone: string | null): number`
  - `runOnboardingJob(db, now, senders): Promise<JobSummary>`

Notices, per §8:

| Trigger | To | When | Key |
|---|---|---|---|
| Lead input overdue | Team lead | daily at the hire's local 10:00 | `lead-input:{newHireId}:{date}` |
| Course released | Hire | on release, route | `released:{newHireId}` |
| Joining date | Buddy | local 10:00 on the date | `buddy:{newHireId}` |
| Overdue module | Hire; lead copied from day 2 | local 10:00 on each overdue day | `overdue:{userId}:{date}` |
| Payment details first saved | OA | on save, route | `first-save:{userId}` |
| Module 11 completed | OA | on completion, route | `payment-done:{userId}` |
| LinkedIn submitted | HR | on save, route | `linkedin:{userId}` |
| Module assigned or re-read | Assignee | Task 5 | `assign:{userId}:{moduleId}:{versionId}:{utcDate}` |
| Checklist due today or overdue | Item owner, one digest per hire, per owner | daily at the hire's local 10:00 | `check:{newHireId}:{ownerRole}:{date}` |

- `{date}` is the hire's local date. `{utcDate}` is the UTC date, so reopening a module notifies again and a same-day repeat stays silent. Owner role resolves to users with that role; TEAM_LEAD to the hire's lead.
- The daily lead reminder also covers a first request whose email failed, the stage 1 carry-forward.
- `runOnboardingJob` runs `syncChecklist` for open hires first, then the notices. One person's failure is logged and doesn't stop the run.
- Cron route: `isCronAuthorized`, skip when `isAcademyEnabled()` is false, `maxDuration = 300`, `dynamic = 'force-dynamic'`. Add `{ "path": "/api/cron/onboarding", "schedule": "0 * * * *" }` to `vercel.json`.

- [ ] **Step 1: Write the failing tests.**
  - `isLocalHour`: 05:00 UTC is 10 in Karachi; 09:00 UTC in December is 10 in Casablanca; 15:00 UTC in December is 10 in Bogotá; 16:00 UTC in December is 10 in Dallas.
  - `sendOnce`: two concurrent calls send once; a failed send removes the row and a second run sends.
  - An overdue hire at their local 10:00 gets one notice; the run at the next hour sends none; the next day sends again, and the lead is copied from day 2.
  - Nothing overdue, nothing sent. A completed module is not counted.
  - A `LOCKED` overdue row counts, as §6.3 shows it overdue.
  - The buddy gets one notice on the joining date only.
  - A checklist item due today mails its owner once; TEAM_LEAD goes to the hire's lead.
  - A failing send for one person doesn't stop the others.
  - The cron route's gate refuses a missing secret with 401, tested through a pure gate function.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add reminders and notifications`

---

### Task 5: Re-read and single-module assignment

**Files:**
- Create: `lib/academy/service/assignment.ts`, `app/api/admin/onboarding/assign/route.ts`, `app/(hr)/admin/onboarding/academy/assign/page.tsx`, `components/academy/AssignedCard.tsx`
- Modify: `lib/academy/service/context.ts`, `course.ts`, `progress.ts`, `fields.ts`, `app/(evaluator)/dashboard/page.tsx`
- Test: `tests/academy-assignment.integration.test.ts`

**Interfaces:**
- Produces:
  - `assignModule(db, moduleId, userIds: string[] | 'ALL_ACTIVE', actorId): Promise<{ assigned: number }>`
  - `requestReread(db, moduleId, actorId): Promise<{ reopened: number }>`
  - `loadAssigned(db, userId): Promise<AssignedCardView[]>`

Rules:
- `buildAcademyContext` works for staff with no `NewHire`: attributes from `User`, per-hire blocks empty. `loadModule` allows a staff member only rows with source SINGLE_ASSIGNMENT or REREAD.
- Assigning creates a `SINGLE_ASSIGNMENT` row, `IN_PROGRESS`, `assignedById` set, no `dueAt`. An existing completed row is treated as a re-read.
- Re-read, for each active user with a completed row: copy to `OnboardingProgressHistory`, then reset to `IN_PROGRESS` with `state` cleared and `completedAt` null. A person who finished the course gets source REREAD. A hire still in the course keeps source COURSE, so `readCourseProgress` stays correct and they must finish it.
- All active employees: users with no row get a REREAD row too, as the spec says it reopens for all active employees. "Active" uses `isAccountInactive`.
- Each call runs in one transaction; notices go out after commit, once per person through `sendOnce`.
- `completeModule` for non-COURSE rows unlocks nothing, sets `versionId`, and never touches `onboardingCompleted`.
- Acknowledgements become per version: `signAcknowledgement` looks for an existing row by `(kind, moduleVersionId)`, and `securityAckSigned` checks the version being read. `finishCourseIfDone` still needs any SECURITY_SOPS row.
- Staff see "Assigned to you" on the dashboard, linking to `/onboarding/{slug}`. Nothing here sets `onboardingCompleted` false.
- `/onboarding/[slug]` for staff uses a plain page with no course rail.

- [ ] **Step 1: Write the failing tests.**
  - Assigning Module 7 to an existing employee: row created, `onboardingCompleted` still true, `shouldBlockSession` false, and they can load, sign and complete it.
  - Completing it unlocks nothing and doesn't affect any other row.
  - Assigning to all active skips inactive users.
  - Re-read: a completed row moves to history with its `versionId`, and the live row shows the current version.
  - A hire mid-course with that module done keeps source COURSE, and the quiz goes to LOCKED until they re-complete it.
  - A finished hire stays finished and stays unlocked.
  - Signing a new version of Module 7 adds a second row, and the first stays.
  - Re-running the same assign creates nothing new and sends nothing twice.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement,** including the HR page (pick a module, pick people or "All active") and the dashboard card.
- [ ] **Step 4: Run the tests, `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add re-reads and single-module assignment`

---

### Task 6: Module content editor

**Files:**
- Create: `lib/academy/content-rules.ts`, `lib/academy/service/content.ts`, `app/api/admin/onboarding/content/[moduleId]/route.ts`, `content/[moduleId]/publish/route.ts`, `app/(hr)/admin/onboarding/academy/modules/page.tsx`, `academy/modules/[moduleId]/page.tsx`, `components/academy/hr/ModuleEditor.tsx`, `BlockForm.tsx`
- Modify: `app/(hr)/admin/onboarding/modules/page.tsx`, `app/api/onboarding/modules/[id]/route.ts`, `components/layout/sidebar-nav.ts`
- Test: `tests/academy-content-rules.test.ts`, `tests/academy-content-service.integration.test.ts`

**Interfaces:**
- Produces:
  - `publishProblems(rule: OnboardingCompletionRule, blocks: Block[]): string[]`
  - `saveDraft(db, moduleId, blocks): Promise<void>`
  - `publishModule(db, moduleId, input: { changeNote: string; askReread: boolean }, actorId): Promise<{ version: number }>`

Rules:
- The draft lives in `OnboardingModule.draftBlocks`. Publishing validates with `parseBlocks`, creates the next `OnboardingModuleVersion`, sets `currentVersionId` and clears the draft in one transaction. With `askReread` it then calls `requestReread`.
- `changeNote` is required.
- `publishProblems` walks every branch of `conditional` blocks and requires, for the rule: `BUDDY_HELLO` the `buddy-hello` item; `CHECKLIST_AND_FIELD` a checklist and a `discordUsername` field; `CHECKLIST_AND_ACK` a checklist and an acknowledgement; `FIELD_SUBMITTED` a `linkedinUrl` field; `PAYMENT_SETUP` both a `bank` and a `payout` field; `LINK_OPENED` a `dashboardLink`. It rejects unknown placeholders, using `findUnknownPlaceholders`, and duplicate checklist keys.
- Item and field keys can't be edited in the UI, and added checklist items get a generated stable key.
- The editor lists blocks with a form per type, plain labels, move up, move down, delete and add. Conditional blocks show their rule in plain words.
- Text beside publish: "People who already finished keep the version they completed."
- Flag on: the old modules page redirects to the new one, and the legacy `PUT` returns 409 "Use the new module editor."

- [ ] **Step 1: Write the failing tests.**
  - `publishProblems`: each rule missing its block gives a problem naming it; `{nonsense}` and duplicate keys are refused; all 14 seeded modules give none.
  - `publishModule` makes version 2, a hire mid-module sees it, and a completed row still loads version 1.
  - Removing Module 7's acknowledgement is refused, and no version is created.
  - `askReread` true reopens rows; false leaves them.
  - Saving a draft doesn't change what hires see.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement,** including the editor. Use the `impeccable:impeccable` skill.
- [ ] **Step 4: Walk it in a browser.** Edit, save, publish, see it as a hire, and try a refused publish. Run axe.
- [ ] **Step 5: Run the tests, `npx tsc --noEmit`, `npx next build`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(academy): add the module content editor`

---

### Task 7: Quiz and checklist editors

**Files:**
- Create: `app/(hr)/admin/onboarding/academy/quiz/page.tsx`, `app/(hr)/admin/onboarding/academy/checklist/page.tsx`, `components/academy/hr/QuizQuestionForm.tsx`, `ChecklistTemplateForm.tsx`, `app/api/admin/onboarding/checklist-template/route.ts`, `checklist-template/[id]/route.ts`
- Modify: `app/api/admin/onboarding/quiz-questions/route.ts`, `quiz-questions/[id]/route.ts`, `app/(hr)/admin/onboarding/quiz/page.tsx`, `lib/academy/quiz.ts`, `components/layout/sidebar-nav.ts`
- Test: `tests/academy-quiz-editor.test.ts`, `tests/academy-quiz-editor.integration.test.ts`

Rules:
- `questionInputSchema` in `lib/academy/quiz.ts`: text, 2 to 6 unique options, `correctAnswer` among them, a required `explanation`, optional `valueKey` from `VALUE_COLOURS`, optional `videoChapterKey`.
- With the flag on the question routes use that schema, and `DELETE` retires, setting `isActive` false and `retiredAt`, and never removes the row.
- Retiring is refused below `MIN_QUIZ_QUESTIONS` usable questions, with "The quiz needs at least 10 questions."
- Flag off: routes unchanged.
- The quiz page shows the usable count and a warning near the minimum. The old page redirects with the flag on.
- The checklist editor edits title, owner, offset days, order and active. `key` and `autoTickEvent` aren't editable. New items get a key generated from the title. Changes affect future hires only.

- [ ] **Step 1: Write the failing tests.** The schema refuses a blank explanation, duplicate options, and a correct answer not among them; DELETE retires and an old review still resolves; retiring below 10 is refused; a template edit leaves existing rows alone; a new template item reaches the next hire only.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add the quiz and checklist editors`

---

### Task 8: Lost-or-stolen box, end-to-end check and carry-forward

**Files:**
- Modify: `app/(evaluator)/dashboard/page.tsx`, `e2e/academy.spec.ts`, `tests/academy-course-flow.integration.test.ts`, this plan, the design
- Create: `components/academy/LostEquipmentBox.tsx`

- [ ] **Step 1: Add the box.** With the flag on, the dashboard shows a warning box with the "If something is lost, stolen or damaged" steps from Module 7's published block, so an HR edit reaches it. It renders `{security contacts}` and hides if the module has no such block.
- [ ] **Step 2: Extend the flow test:** HR sets up a hire and the checklist is created; the hire finishes; `syncChecklist` ticks all auto items except `linkedin-update` until HR verifies; the manager item stays open; payroll profile count unchanged.
- [ ] **Step 3: Extend the E2E spec:** HR opens the tracker, opens a drawer, ticks an item with a reason and verifies LinkedIn; OA sees only payment data and a reveal is logged; a plain employee gets 403 from each new route; HR publishes a module edit and a hire sees it; a re-read keeps an existing employee unlocked.
- [ ] **Step 4: Update the docs.** Add "After stage 4", and record the plan decisions in the design.
- [ ] **Step 5: Run everything.** `npx tsc --noEmit`, `npm test` with no DB env, `npm run test:academy-db`, `npm run test:e2e:academy` three times, `npx next build`, `prisma migrate diff`. Expected: tsc clean, academy tests pass, the same 19 baseline failures, E2E passes each run, build passes, empty diff.
- [ ] **Step 6: Commit.** `test(academy): cover HR operations end to end`

---

## After stage 4

Carried forward. None of this is built in stage 4.

**Needs a user decision before main**
- **Confirm the hourly cron on the first preview deploy.** `vercel.json` already lists `/api/cron/onboarding` at `0 * * * *`, next to the other crons. If the plan refuses it, use the fallback in design §8.

**Stage 5 (video and polish)**
- **Preview as** in the editors (design §7).
- **The most-missed questions report** (design §7, tracker panel).
- **The bank letter download,** once HR sends the text. Until then Module 11 says "HR will share your bank letter".

**Deferred from stage 4 reviews (minor)**
- One-shot notices (OA payment change, reminders) have no resend control.
- The digest is per hire; one digest per owner across hires is a later improvement.
- `requestReread` holds row locks for the whole transaction.
- Contractor payout updates after a re-read were fixed in the final review (design §5.9); a PK employee re-reading Module 11 still sees the bank form, which the server refuses.
- `tickItem` reads then writes with no guard against a concurrent auto-tick, and the day boundary is UTC midnight.
- `gatherRowFacts` loads progress and quiz data for OA and then discards it.
- `overdueCount` counts modules only, not checklist items.
- The first tracker load writes auto-ticks in a burst that could outrun the function timeout.
- The tracker drawer's `act` needs a ref guard against a double click, and it reloads on a per-request counter.
- Focus is not moved to the reason field when it opens or closes.
- `PaymentDetailsScreen` keeps a stale error and does not guard closing a row mid-request.
- The "30 days" text is a literal, not `FINISHED_WINDOW_DAYS`.
- The checklist progress bar's "Not released" label is unclear.
- The sidebar's "Dashboard" now opens the tracker.
- The "Overdue modules" column label should say what it counts.
- The mine endpoint answers 404 or an empty list, which reveals whether a hire id exists.
- A future OA checklist item would link to a page with no panel for it.
- A form that predates the Academy can get the request mail and a reminder together.
- The "mine" panel's auto-ticks lag by up to an hour.
- The Security page needs a `SecurityChecklist` row to load.
- A quiz in progress when HR changes a correct answer is graded on the new answer, and options no longer present restart the quiz (accepted).
- `sendOnce` is insert-then-send, so a crash after the insert loses a buddy or route notice (accepted). People who have left but kept a role still get mail, as with every other sender.
- `listAssignable` runs a query per module.
- Hard-deleting an HR user nulls `assignedById` on reopened rows, so a recompute gives them due dates again; assigning again on a later day repeats the email.
- The shared primary button's contrast is 4.4:1, a site-wide token.
- Editor hints use `###` and `**`; the refusal text shows twice; blank table headers are refused; the sidebar highlights twice.
- Payment conditionals that depend on location, not contract type, are not checked (the UI cannot build them and the server refuses structure changes). A blank contract type sees only the unconditional bank block.
- Route-level guard coverage and a concurrent retire test are still to write.
