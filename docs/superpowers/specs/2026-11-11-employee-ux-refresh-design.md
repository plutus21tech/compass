# Employee UX refresh: design

Date: 2026-11-11. Source: the "Compass: pain points and fixes" deck (`Compass_ UX Improvments.pptx`, mockups on slides 5, 7 and 8) and the conversation with the owner.

## Why

Regular employees asked for this. Today they:

- can't tell what needs them, because tasks are spread across pages and email;
- get lost, because the menu is a flat list and some pages are only reachable from other pages;
- don't trust the numbers, because formats differ ("5 / 10", "Oct 4", "4 Oct 2026") and counts disagree;
- feel every page is different, because widths, titles and headers vary.

Success: an employee opens Compass and sees, on one screen, what needs them and their time off; finds any page from the menu or search; and every page reads the same way.

## Goals

1. A grouped employee menu and a top bar with search, a notification bell and the profile.
2. A Home built around a "Needs you" list.
3. A Time off page with balances up front, a team calendar and a 3-step request panel.
4. A People page: your team, plus a company map.
5. One page width, one page header, one date style and clearer number wording on employee pages.

## Non-goals

- **No rebrand.** Keep Compass's current colours, fonts (DM Sans, Instrument Serif) and dark mode. The deck's Figtree/Cobalt change is out.
- **Admin pages keep their content.** HR, OA, Security and Execution pages and their menus keep every item and behaviour. They only sit inside the new top bar.
- **The Onboarding Academy keeps its own look** (`/onboarding/*`), and the onboarding lockout and onboarding menu are unchanged.
- **The pulse survey stays on the Evaluations page.** It is not a Home item.
- **No email changes.** The deck's "one shared email template" and "email sender" items are later work.
- **No new notification sending.** The bell shows what Compass already creates. Nothing new is emailed.
- **Leave visibility stays as today.** Colleagues keep seeing each other's leave type in Compass, Google Calendar invites and emails (owner's decision, 2026-11-11).

## Anti-goals (failure even if it works)

- Any action an employee, lead, HR, OA or Security user can do today becomes unreachable. The checklist in the appendix is binding: every row must have a home after each part ships.
- Search or the company map exposes evaluation relationships, payroll, bank details or anything not already visible to that user.

## Constraints

- Next.js 16 App Router, Prisma 5 on Postgres, Tailwind with the existing tokens in `app/globals.css` / `tailwind.config.ts`, shadcn-style components in `components/ui`, sonner toasts.
- Each part ships as its own PR to `main`; merging deploys to production and runs `prisma migrate deploy`. Migrations are additive only.
- Never run anything against the root `.env` database (it is production). Use the local test database.
- Test data is fictional (the repo is public).
- Files stay under 800 lines; `app/(evaluator)/leave/page.tsx` (about 2,600 lines today) is split as part of its rebuild.
- No browser `alert`, `confirm` or `prompt`; use the app's modal/dialog.

## Decisions

### 1. Frame (menu and top bar)

`components/layout/SidebarLayout.tsx` is the one shell for every route group. It stays the shell.

**Employee menu** (`EMPLOYEE_SIDEBAR` in `components/layout/sidebar-nav.ts`), grouped:

| Group | Items (current page → new label) |
|---|---|
| You | Home `/dashboard` · Time off `/leave` (was "Leave") · Evaluations `/evaluations/weekly`, with the open-count badge |
| Work | My work `/my-tasks` (was "My Tasks") · Projects `/projects` · Clients `/clientele` (was "Clientele"; still only when `/api/clientele/access` allows) · Subscription Management (EXECUTION only, as today) · Payment details (OA only, as today) |
| Company | People `/people` (new) · Handbook `/handbook` · Office `/office` |
| Pinned at the bottom | Help & IT (today's Device Support `/device-support`, or Security `/security-checks` when Security Checks is on, same rule as today) · Profile `/profile` |

The role-switch links (Admin Console, Payroll (O&A), Security Console, Employee View) and the collapse toggle stay in the sidebar footer. `ONBOARDING_SIDEBAR`, `ADMIN_SIDEBAR` and `SECURITY_SIDEBAR` keep their items and order; they adopt the new grouped visual style only.

**Top bar** (`components/layout/TopBar.tsx`), for every role:

- Search box with the shortcut hint: `Ctrl K` on Windows/Linux, `⌘K` on Mac.
- Bell with an unread dot.
- Theme toggle (kept).
- Avatar, name and title, opening a menu with Profile and Sign out (replacing the bare logout icon).

**No splash screen:** the shell renders immediately with skeletons while the session check runs, instead of the full-screen "Loading..." screen. Unauthenticated users are still sent to `/login`.

### 2. Search

A command palette (opened by the box or the shortcut), backed by one new endpoint. Results are grouped:

- **Pages:** every page in the user's own menus (employee plus whichever console menus their role gets).
- **People:** name, title and department only, from the same company as the viewer (Plutus21 or 3E), payroll-active users only.
- **Handbook:** articles the user can already see (same team filtering as `/api/handbook`).
- **Your work:** projects the user is a member of and tasks assigned to them.

Nothing else is searched. No evaluation data, payroll, assets of other people or private fields.

### 3. Bell

Shows notices about events Compass already emails or tracks, newest first, each linking to where you act on it:

- weekly FYI notices: decisions on your list-change requests, "HR changed your evaluation lists", "quarter-end forms are open" (today these exist only as live-computed card notices and as `WeeklyNotification` email de-duplication rows, which carry no text);
- Security Checks updates (`SecurityNotification`);
- decisions on your own leave and WFH requests (approved, rejected, cancelled, disapproved);
- transition-plan reminders and plan disapprovals.

Rule for Home vs bell: **something you must act on goes in "Needs you"; something you should know goes in the bell.**

Storage: a new additive notification table (user, kind, title, link, created at, read at), written at the points where these events already happen: leave and WFH decisions and cancellations, transition-plan disapprovals and the reminder cron, weekly list decisions and changes, forms opening. Security Checks notices are read from `SecurityNotification` as they are and keep their own read flags. No backfill: the bell starts empty at release. Opening the bell marks items read.

### 4. Home (`app/(evaluator)/dashboard/page.tsx`)

Layout follows mockup slide 5, in current colours:

- **Header:** today's date, "Good morning/afternoon/evening, {first name}", and a one-line summary ("2 things need you this week. Everyone in Design is in today.").
- **Three cards:**
  - **Out today:** number of people out today (both companies, as the leave calendar does today), whether your department is all in, who on your team is out next, avatars, "See who" (names and leave type, as today's Out Today card). "Team calendar" links to `/leave`. Leads also see their team's upcoming leave here (replacing "Upcoming Team Leaves").
  - **Your time off:** total days left, a bar split by type, per-type counts ("5 casual · 14 annual · No sick left"), your next booked leave or "No leave booked yet", **Request leave** (opens the Time off request panel) and "History".
  - **Next public holiday:** next holiday for your team tag from the leave holidays table, how many days away, "All holidays".
- **Needs you:** one list, sorted by due date, each item with one button. Sources:
  - modules HR assigned you (`/api/onboarding/academy/assigned`);
  - this week's evaluation questions, list checks, list-change requests to review, late or quarter-end forms (from `/api/weekly/card` states and action notices);
  - your monthly self-evaluation; your team's self-evaluations to read (leads);
  - team lead onboarding forms to fill;
  - leave and WFH requests to approve, and transition plans to review (leads, HR);
  - open device tickets (HR, Security);
  - your own security checks due (when Security Checks is on);
  - your own leave that needs a transition plan.

  Empty state: "Nothing needs you right now."
- **My work:** your open tasks (top few by due date; clicking one opens the existing task detail panel in a side sheet, no page jump), your active projects with progress, and an "Open My work" link.

Removed from Home, each one click away: Who you evaluate and Quarter progress (Evaluations page), Team directory (People), My equipment and the Device Support card (Help & IT), the four stat tiles (their numbers live in the cards above).

### 5. Time off (`app/(evaluator)/leave/page.tsx`)

Layout follows mockup slide 7, in current colours. Every current behaviour stays (see appendix).

- **Balance cards:** one per type, "5 days left" large with "of 10 days" and a bar, plus pending info; a fourth card "Your next leave".
- **Calendar:** month grid with chips coloured by leave type for everyone (as in the mockup), "N out" per day and "+N more"; Everyone / my department filter (today's department filter); birthdays and team holidays as today; drag or click a start and end day to open the request panel.
- **Request panel** (side panel, 3 steps):
  1. *Dates and type:* typed dates or the dragged range, leave type tiles with days left, half day (Casual and Sick only, session and times as today), reason, and a live summary: working days, weekend days not counted, return date, balance after the request.
  2. *Handover:* the transition plan table and general handover notes. Says whether a plan is required for this request (same rule as today) and that it can be added later.
  3. *People and review:* cover people, people to notify, a full summary, **Submit**.
- **Below the calendar:** My requests (view, edit, cancel as today), the Team approval queue (leads/HR as today), and for 3E staff the WFH request button, My WFH requests and the WFH approval queue.
- The lead's "Disapprove plan" reason and cancel confirmations use dialogs, not `prompt`/`confirm`.
- Wording: "5 days left of 10" everywhere instead of "5 / 10 days".

### 6. People page (new, `/people`)

- **My team tab:** today's Home Team Directory: direct reports, or same-department colleagues if none; payroll-active only; name, title or department, avatar, Discord ID.
- **Company map tab:** a read-only reporting tree built from TEAM_LEAD relationships only (the owner confirmed every TEAM_LEAD mapping is a true reporting line), searchable, the viewer highlighted. Shows name, title and department. No other relationship types (peer, HR, C-level, department, cross-department). Reuse the hierarchy layout from the admin org chart (`lib/org-chart.ts`) through a new employee endpoint; the admin endpoint stays admin-only.
- **3E staff do not get the Company map tab** (and the map contains only Plutus21 people, matching the admin chart, which already leaves 3E out).

### 7. Page width, header, dates, numbers (employee pages)

- One page container (extend `components/layout/page-container.tsx`) with one max width and left edge on every employee page. Exceptions that keep a wide layout: Projects (all project pages), My work, Office. Reading pages (handbook article, profile, forms) may use a narrower content column inside the same container.
- One page header component: optional date line, title, subtitle, primary action on the right (as in the mockups). Replaces the mixed title styles.
- One date helper module for employee pages: `Thu 5 Nov`; with the year when it isn't the current year (`Thu 5 Nov 2025`); date-times `Thu 5 Nov, 14:30`; ranges `Thu 19 – Mon 23 Nov`. Date-only values (leave dates, holidays) are formatted without a time-zone shift; timestamps in Asia/Karachi, matching the existing `lib/weekly/format.ts` behaviour. Replace the bare `toLocaleDateString()` and en-US formats on employee pages. Native date inputs may keep the browser's format; the summary next to them uses the helper.
- Numbers: "N days left of M", "X of Y done"; no bare slashes.

## Delivery: four parts, each its own PR

1. **Quick wins:** the date helper and its adoption on employee pages, and number wording.
2. **Frame:** grouped menu, top bar, search, bell (with its notification table and the writes that fill it), no splash screen, page container and header, People page.
3. **Home.**
4. **Time off.**

Each part must leave every row of the appendix checklist reachable.

## Left to the builder

- Component structure, file split, data-fetching approach (server vs client components) and caching.
- Exact search ranking and result limits; exact bell page size and retention window.
- Skeleton designs, empty states and micro-copy beyond what's stated.
- Whether Home's data comes from one aggregate endpoint or several existing ones.
- How a person with more than one team lead appears in the company map (one primary position plus "also reports to" is fine).
- The exact single max width (around `max-w-7xl`).

## Appendix: don't-lose-anything checklist (current behaviour on `main`, e15437d4)

**Shell**
- Session check and redirect to `/login`; `useLayoutUser()`; onboarding lockout to `/onboarding` with the onboarding menu.
- Data-driven menu: Clients (clientele access), Evaluations badge (weekly open count), Device Support ↔ Security swap (Security Checks flag), Payment details (OA), Subscription Management (EXECUTION).
- Footer role switches: Admin Console / Employee View (HR), Payroll (O&A) / Employee View (OA), Security Console / Employee View (SECURITY); collapse toggle saved in localStorage; mobile menu sheet.
- Top bar: theme toggle, avatar with name and department, logout (POST `/api/auth/logout`, clear selected company, go to `/login`).
- Admin, Security and Security-Checks console menus and their conditional items (Evaluation round, Security, Academy items).

**Home today → new home**
- Assigned modules → Needs you.
- Weekly card states and notices → Needs you (actions) / bell (FYI); HR-only "list changes / answers waiting" → Needs you for HR.
- Open this week, Quarter progress, Who you evaluate → Evaluations page (and the Needs you item).
- Leaves remaining, Leave balance card → Your time off card.
- Active projects, Projects card → My work.
- Pending onboarding forms → Needs you.
- Leave requests for approval (leads/HR, links to `/admin/leave` for HR) → Needs you.
- Upcoming team leaves (leads) → Out today card.
- Open tickets (HR/Security, links to their consoles) → Needs you.
- Team directory → People, My team.
- Device Support card, My equipment → Help & IT page (already lists assigned assets).

**Time off** (all on `/leave` today)
- Balances per type with half-day decimals; auto-created balance row.
- Calendar click-start/click-end to apply; "+" to apply; Cancel strip.
- Apply form: type tiles with days left; half day (Casual/Sick, session, times, 0.5 day); start/end; expected return date; reason; optional transition plan; handover notes; cover people (max 10, not self); notify (max 20); browser time zone sent.
- Server validation: dates, half-day rules, HH:mm, reason 1–4000, notes ≤6000, at least one working day, balance check at submit and at final approval.
- Transition plan: table columns, up to 50 rows, required rule (not 3E, not half day, not a single sick day; required for full-day Casual/Annual), reminder banner and toast for leave in 0–3 days without a plan, save draft / submit / resubmit, lead approve/disapprove with reason, cron reminders, escalation, deadline notice, final warning, auto-cancel.
- Approvals: lead queue rules (statuses, not started, no half-day Sick), HR queue, HR approve finalises, lead approve → LEAD_APPROVED or APPROVED, Reject, Disapprove on approved leave (refund, calendar removal, not from last day), `?requestId=` deep link highlighting.
- Calendar: holidays by team tag (not charged), birthdays, department filter, pending shown faded, half-day "1/2", "+N more" list.
- My requests: list, details (all fields), edit (resets to PENDING and re-emails), cancel (refund, calendar removal; HR cancel deletes).
- WFH (3E only): request, my requests, cancel until end, approval queue.
- Emails and Google Calendar sync exactly as today.

**Other employee pages:** unchanged in function; adopt the container, header, date helper and number wording only. Evaluations (all sections including the pulse survey), My work (List, Board, Calendar, Dashboard, Files), Projects (workspace, detail, analytics), Clients, Office, Handbook (hub search, articles, HR "Preview as"), Help & IT (tickets, assigned assets, asset detail and QR), Profile (contact details, password, project notification digest, office avatar), Onboarding Academy, Team lead form.
