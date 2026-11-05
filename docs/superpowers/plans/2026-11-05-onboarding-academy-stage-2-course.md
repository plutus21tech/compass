# Onboarding Academy — Stage 2 (Course) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Replaced in part:** `2026-11-05-onboarding-academy-payroll-separation.md` replaces this plan's bank, payout and payroll text. Onboarding never writes to payroll and never creates a `PayrollEmployeeProfile`. Users behaves as on main.

**Goal:** Give a new hire the working course behind the flag: HR releases it, the hire sees Home and modules 1–14 with content that adapts to them, due dates and unlocking work, and a locked hire can't reach the rest of Compass. Modules 1–2 use the "video coming soon" fallback.

**Architecture:** Same layout as stage 1:
- pure rules in `lib/academy/*`
- DB access in `lib/academy/service/*`
- thin routes under `app/api/onboarding/academy/**`

Pages are server components that call the services directly and hand a plain view model to client components. The server decides everything: the client only reports events, and completion is re-checked on the server.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 / Postgres, TypeScript, Zod 4, `react-markdown` + `remark-gfm`, `framer-motion`, `node --test` with tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md` (§5.4, §5.5, §6, §7, §9, §12). Module copy comes from `Compass Onboarding Academy_ Product Spec.docx` sections 4 and 6, in the parent checkout, untracked. Read `docs/superpowers/plans/2026-11-02-onboarding-academy-stage-1-foundation.md` from "After stage 1" to the end.

**Branch:** `feat/onboarding-academy-stage-2`, cut from the tip of `feat/onboarding-academy-stage-1`, in a worktree with no `.env`.

## Global Constraints

Every constraint in the stage 1 plan still applies, especially:
- additive migrations only
- never use the root `.env`: it is production
- `BenefitCategory` / `Benefit` untouched
- onboarding never creates a `PayrollEmployeeProfile`, and Users behaves as on main
- fictional test data, because the repo is public

New for this stage:
- **Flag off means no change.** With `ONBOARDING_ACADEMY_ENABLED` unset, `/onboarding` renders the legacy pages, new routes return 404, and nobody is locked out.
- **Module 11 never creates a payroll profile** (§9).
- **Bank details never go in `OnboardingProgress.state`**, which is unencrypted.
- **No real people in the repo.** The spec's Module 7 copy names two staff emails. Don't copy them: use `{security contacts}`, built from the Key Contacts list, which falls back to "Security and IT". Role addresses (`hr@plutus21.com`, `acct@plutus21.com`) are fine.
- **Don't invent company facts.** The spec's section 7 video scripts weren't supplied, so the fallback summaries use only the spec's module goals. Value cards aren't used in stage 2, because the meaning line isn't in the spec for every value.
- **A hire can never be stuck on missing content** (design §2 anti-goal). Missing links hide, and a rule that depends on missing content falls back to `SCROLL_END`.
- **Icons are Lucide at 24px; no emoji.** Warm, short, second-person copy. WCAG AA, keyboard reachable, and every module can be finished on a phone.

**Plan decisions (not in the design; correct them here if wrong):**
- **No switch-on (user, 2026-11-05).** Nothing reaches main until the whole Academy is 100% ready; then it is pushed to main and becomes the default. The flag stays in the code only as a build-time guard while the stages are built. The last stage removes it. The seed and the test-account cutover script still have to be run once, around that push (design §10). The quiz is stage 3, so until then the Final Step card says "Your culture quiz will appear here."
- **The Security acknowledgement ships here**, not in stage 3, because Module 7 can't complete without it. Stage 3 adds the values acknowledgement on the same code.
- **Release lives on the setup section** of the new-hire page, because the tracker is stage 4.
- **Lockout is enforced in `getSession()`**, the one point nearly every API route passes through. See Task 6.
- **Emails and checklist auto-ticks stay in stage 4.** That includes the welcome email and the OA notice on Module 11. Task 4 records nothing extra for them, because stage 4 can derive each tick from stored data at backfill.
- **Bank letter:** stage 2 always shows "HR will share your bank letter". The download comes once the template text exists.
- **Video IDs are ignored in stage 2.** Modules 1–2 always use the fallback until the stage 5 player exists, because there's nothing to report 95% watched.
- **Security call time:** the spec's Home side card lists it, but the setup fields have no such column. Show HR and team calls only.
- **KPI wording goes everywhere, not only Module 4.** The user said the KPI module was removed, but the spec copy still mentions KPIs in Modules 4, 5, 13 and 14. Remove all of them and list the changes for HR in the PR.

## Review Focus

1. **Double submits and rapid ticks.** Two tabs or a double click on "Mark complete" must unlock the next module once, and two checklist ticks in quick succession must both persist. Pinned in Task 4.
2. **A locked hire calling a legacy or unrelated API directly**, such as `POST /api/onboarding/quiz/submit`, must be refused, while an existing employee and everyone with the flag off are never affected. Pinned in Task 6.
3. **Empty per-hire content:** no tutorials, no key contacts, a blank link, or no invoice template. The hire must still finish, with no raw `{braces}` and no dead links. Pinned in Tasks 1 and 4.
4. **HR changes something mid-course:** joining date moved (incomplete due dates recompute, completed rows don't), or a new version published (completed modules still show the pinned version). Pinned in Task 4.
5. **Contract type decides who sees what.** A PK hire must never see the payout form and a contractor must never see bank fields or touch payroll, even if the wrong API is called directly. Pinned in Task 5.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/academy/blocks.ts` | Block Zod union, `parseBlocks`, `filterBlocks` |
| `lib/academy/placeholders.ts` | `renderPlaceholders`, `findUnknownPlaceholders`, `PLACEHOLDER_KEYS` |
| `lib/academy/time.ts` | `timeZoneFor`, `endOfDayInZone`, `blockersCallLocal`, `overlapWindowLocal` |
| `lib/academy/schedule.ts` | `moduleDueAt`, `holidayTeamFor` |
| `lib/academy/progress.ts` | `progressStateSchema`, `parseProgressState`, `applyEvent`, `moduleCardState`, `nextToUnlock` |
| `lib/academy/completion.ts` | `effectiveRule`, `evaluateCompletion` |
| `lib/academy/lockout.ts` | `isPathAllowedWhileLocked`, `shouldBlockSession` |
| `lib/academy/bank.ts` | `bankDetailsSchema`, `maskIban` |
| `lib/academy/service/context.ts` | `buildAcademyContext` |
| `lib/academy/service/course.ts` | `releaseCourse`, `recomputeDueDates`, `loadHome`, `loadModule` |
| `lib/academy/service/progress.ts` | `recordEvent`, `completeModule` |
| `lib/academy/service/fields.ts` | `saveDiscordUsername`, `saveLinkedinUrl`, `saveBankDetails`, `applyPendingBankDetails`, `signAcknowledgement` |
| `prisma/seed-academy-content.ts` | Version 1 blocks for all 14 modules, pure data |
| `app/api/onboarding/academy/**` | Hire routes |
| `app/api/admin/onboarding/new-hires/[id]/release/route.ts` | HR release |
| `components/academy/*` | Home, module page, renderer, one file per block family |
| `app/(evaluator)/onboarding/page.tsx`, `[moduleSlug]/page.tsx` | Flag switch between legacy and Academy |

---

### Task 1: Blocks, placeholders and local time (pure)

**Files:**
- Create: `lib/academy/blocks.ts`, `lib/academy/placeholders.ts`, `lib/academy/time.ts`
- Test: `tests/academy-blocks.test.ts`, `tests/academy-placeholders.test.ts`, `tests/academy-time.test.ts`

**Interfaces:**
- Consumes: `PersonAttributes`, `countryOf` (`lib/academy/attributes.ts`), `AcademyLinkKey` (`lib/academy/links.ts`)
- Produces:
  - `type Block`, `parseBlocks(json: unknown): Block[]`, which throws on invalid content
  - `filterBlocks(blocks: Block[], facts: ConditionFacts): Block[]`, which removes failing `conditional` blocks and flattens the passing ones
  - `interface ConditionFacts { attributes: PersonAttributes; clientAccount: string | null; companyWing: 'CAPITAL' | 'PARTNERS' | null }`
  - `renderPlaceholders(text: string, values: Record<string, string>): string`
  - `findUnknownPlaceholders(text: string): string[]`
  - `timeZoneFor(attrs): string | null`
  - `endOfDayInZone(dateKey: string, timeZone: string | null): Date`
  - `blockersCallLocal(stored: string, timeZone: string | null, now: Date): string`
  - `overlapWindowLocal(timeZone: string | null, now: Date): string`

Block `type`s and their fields (keep `type` names exactly, stage 4's editor reuses them):

| type | fields |
|---|---|
| `video` | `videoKey: 'VIDEO_1' \| 'VIDEO_2'`, `summary` (markdown) |
| `richText` | `markdown` |
| `peopleCards` | `source: 'lead' \| 'team' \| 'buddy' \| 'keyContacts'`, `heading?`, `group?` (key-contact group) |
| `linkCards` | `heading?`, `links: {label, linkKey}[]` (rows with an empty link are hidden) |
| `tutorialCards` | `heading?` (per-hire, open-tracked) |
| `checklist` | `heading?`, `items: {key, label}[]` |
| `dataTable` | `headers: string[]`, `rows: string[][]` |
| `warningBox` | `heading`, `markdown` |
| `inputField` | `target: 'discordUsername' \| 'linkedinUrl' \| 'bank' \| 'payout'`, `label` |
| `acknowledgement` | `kind: 'SECURITY_SOPS'`, `statement` |
| `copyText` | `label`, `text` |
| `timeline` | `items: {label, markdown}[]` |
| `toolTiles` | `heading?`, `tools: {name, purpose, linkKey?}[]`, `includeTeamTools: boolean` |
| `libraryCards` | `kind: 'BENEFIT' \| 'REIMBURSEMENT'` |
| `callTimes` | no fields |
| `roleExpectations` | no fields |
| `dashboardLink` | `label`, open-tracked as link key `COMPANY_DASHBOARD` |
| `conditional` | `when`, `children: Block[]`; `when` is one of `{clientAccountSet: true}`, `{contractType: ContractType[]}`, `{location: OfficeLocation[]}`, `{companyWing: CompanyWing}` |

Spec §6.1's `valueCards` isn't built in stage 2 (see Global Constraints). `tutorialCards`, `roleExpectations` and `dashboardLink` are additions that give per-hire data and open tracking a block of their own.

`PLACEHOLDER_KEYS`: `preferred name`, `title`, `department`, `location`, `lead first name`, `core hours`, `overlap local time`, `blockers local time`, `security contacts`, `accounts contacts`, `day 1 goal`, `week 1 goal`, `month 1 goal`, `month 3 goal`. That is 14 keys. `bank name` is not a placeholder (a test pins that); the hire types the bank name into the bank form.

Time zones:

| Location | Zone |
|---|---|
| KARACHI | `Asia/Karachi` |
| CASABLANCA | `Africa/Casablanca` |
| BOGOTA | `America/Bogota` |
| DALLAS | `America/Chicago` |
| REMOTE PK | `Asia/Karachi` |
| REMOTE MA | `Africa/Casablanca` |
| REMOTE CO | `America/Bogota` |
| REMOTE US | `America/Chicago` |
| REMOTE ID | `Asia/Jakarta` |
| REMOTE EC | `America/Guayaquil` |

Any other country gives `null`. With `null`, show the source time ("7:00 AM CT") and never guess; `endOfDayInZone` uses UTC.

- [ ] **Step 1: Write the failing tests.**
  - `parseBlocks` rejects an unknown `type`, and a `linkCards` row with an unknown `linkKey`.
  - `filterBlocks` drops `{clientAccountSet: true}` when `clientAccount` is null, keeps it when set, and drops `{contractType: ['PK_EMPLOYMENT']}` when `contractType` is null. A `conditional` nested inside a `conditional` works.
  - `renderPlaceholders('Hi {preferred name}, {nonsense}.', {'preferred name': 'Cara'})` returns `'Hi Cara, .'`; an empty-valued key renders empty.
  - `findUnknownPlaceholders('{title} {nonsense}')` returns `['nonsense']`.
  - `endOfDayInZone('2026-12-01', 'Asia/Karachi')` is `2026-12-01T18:59:59.999Z`.
  - `blockersCallLocal('WED 07:00', 'Asia/Karachi', new Date('2026-12-01T00:00:00Z'))` is `'6:00 PM'`, and with `now` in July 2026 it is `'5:00 PM'` (daylight saving in Chicago).
  - `blockersCallLocal('WED 07:00', null, now)` is `'7:00 AM CT'`.
  - `overlapWindowLocal('America/Bogota', now)` is `'7:00 AM to 10:00 AM'`; `overlapWindowLocal(null, now)` is `'5 PM to 8 PM PKT'`.
  - `timeZoneFor({officeLocation: 'REMOTE', remoteCountry: 'FR'})` is `null`.
- [ ] **Step 2: Run them to confirm they fail.** `node --import tsx --test tests/academy-blocks.test.ts tests/academy-placeholders.test.ts tests/academy-time.test.ts`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement the three files.** Use `Intl.DateTimeFormat` for zone offsets; add no date library.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add content blocks, placeholders and local time rules`

---

### Task 2: Due dates, progress state and completion rules (pure)

**Files:**
- Create: `lib/academy/schedule.ts`, `lib/academy/progress.ts`, `lib/academy/completion.ts`
- Test: `tests/academy-schedule.test.ts`, `tests/academy-progress.test.ts`, `tests/academy-completion.test.ts`

**Interfaces:**
- Consumes: Task 1's `endOfDayInZone`, `Block`
- Produces:
  - `holidayTeamFor(teamTag: TeamTag | null, location: OfficeLocation | null): TeamTag | null`
  - `moduleDueAt(input: { phase: 'DAY_1' | 'WEEK_1'; joiningDate: Date; timeZone: string | null; holidayKeys: ReadonlySet<string> }): Date`
  - `type ProgressState = { checks: Record<string, boolean>; linksOpenedAt: Record<string, string>; scrolledToEnd: boolean; linkedinUrl?: string }`
  - `parseProgressState(json: unknown): ProgressState`, which returns the empty state for bad JSON and never throws
  - `type ProgressEvent = { type: 'CHECK'; key: string; checked: boolean } | { type: 'LINK_OPENED'; key: string } | { type: 'SCROLLED_END' }`
  - `applyEvent(state, event, now): ProgressState`, which returns a new object; the first open time is kept
  - `moduleCardState(row, now): { status: 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED'; overdue: boolean }`. AVAILABLE means DB status `IN_PROGRESS` with `startedAt` null.
  - `nextToUnlock(modules, completedModuleId): string | null`, using `orderIndex` among active modules
  - `effectiveRule(rule, blocks, facts: { tutorialCount: number; dashboardLinkSet: boolean }): OnboardingCompletionRule`. `blocks` are the filtered blocks the hire sees.
  - `evaluateCompletion(input: CompletionInput): { met: true } | { met: false; reason: string }`

`CompletionInput`: `{ rule, blocks (already filtered), state, tutorialKeys: string[], discordUsername: string | null, securityAckSigned: boolean, payment: { kind: 'PK'; bankSaved: boolean } | { kind: 'OTHER'; payoutSaved: boolean } }`.

Fallbacks in `effectiveRule`: a rule the hire cannot meet from the filtered blocks falls back to `SCROLL_END`, so nobody is stuck.
- `VIDEO_95` → `SCROLL_END` (always, until stage 5)
- `ALL_LINKS_OPENED` with no tutorials → `SCROLL_END`
- `LINK_OPENED` with no dashboard link set → `SCROLL_END`
- `BUDDY_HELLO` without the `buddy-hello` item, `CHECKLIST_AND_FIELD` without a filled checklist and a `discordUsername` field, `CHECKLIST_AND_ACK` without an acknowledgement block, `FIELD_SUBMITTED` without a `linkedinUrl` field, and `PAYMENT_SETUP` without a `bank` or `payout` field → `SCROLL_END`

Reason copy (shown beside the disabled button):

| Rule | Reason |
|---|---|
| `SCROLL_END` | "Read to the end of this page first." |
| `BUDDY_HELLO` | "Tick the box once you've said hello to your buddy." |
| `ALL_LINKS_OPENED` | "Open each tutorial first. {n} to go." |
| `CHECKLIST_AND_FIELD` | "Tick every step and save your Discord username." |
| `CHECKLIST_AND_ACK` | "Tick every step and sign the acknowledgement." |
| `FIELD_SUBMITTED` | "Paste your LinkedIn link first." |
| `PAYMENT_SETUP` (PK) | "Save your bank details first." |
| `PAYMENT_SETUP` (other) | "Save your payout details and tick the invoice template box." |
| `LINK_OPENED` | "Open the Company Dashboard first." |

Required checks come from the checklist blocks that survived `filterBlocks`, so a hidden item is never required.

- [ ] **Step 1: Write the failing tests.**
  - Karachi, joining Tuesday `2026-12-01`, no holidays: `DAY_1` is `2026-12-01T18:59:59.999Z`, `WEEK_1` is `2026-12-08T18:59:59.999Z`.
  - With holiday key `2026-12-03`: `WEEK_1` is `2026-12-09T18:59:59.999Z`.
  - Joining Friday `2026-12-04`: `WEEK_1` is `2026-12-11T18:59:59.999Z`.
  - Joining on a weekend: `DAY_1` stays on that date; `WEEK_1` counts from the next Monday as working day 1.
  - `holidayTeamFor(null, 'BOGOTA')` is `COLOMBIA`; `holidayTeamFor('MOROCCO', 'KARACHI')` is `MOROCCO`; `holidayTeamFor(null, 'DALLAS')` is `null`.
  - `parseProgressState('junk')` gives the empty state.
  - `applyEvent` does not mutate its input; a second `LINK_OPENED` keeps the first timestamp.
  - `moduleCardState`: not completed and `now > dueAt` is overdue; completed is never overdue; a locked overdue row is overdue.
  - `evaluateCompletion` for all nine rules, met and not met, including: a checklist item inside a hidden `conditional` isn't required; `PAYMENT_SETUP` OTHER with payout saved but no `invoice-template` tick isn't met.
  - `effectiveRule` covers the fallbacks, including a rule whose content is missing from the filtered blocks.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL, modules not found.
- [ ] **Step 3: Implement the three files.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add due dates, progress state and completion rules`

---

### Task 3: Module content and seed

**Files:**
- Create: `prisma/seed-academy-content.ts`
- Modify: `prisma/seed-academy.ts`, `prisma/seed-academy-data.ts`, `lib/academy/links.ts`, the library card editor in `app/(hr)/admin/onboarding/academy/library/`
- Test: `tests/academy-content.test.ts`, extend `tests/academy-seed.integration.test.ts`, `tests/academy-links.test.ts`

**Interfaces:**
- Consumes: Task 1's `parseBlocks`, `findUnknownPlaceholders`; `ACADEMY_MODULES`
- Produces:
  - `ACADEMY_MODULE_BLOCKS: Record<string, Block[]>`, keyed by module slug
  - card link variant `{ kind: 'config'; key: AcademyLinkKey }`, for card `links` only; `resolveCardLink(link, configLinks): string | null`

Content rules:
- Copy is the spec's section 4 text, minus the KPI wording (see Plan decisions): Module 4's "Your KPIs" section, Module 5's Compass row, Module 13's "Monthly KPIs" item, and Module 14's lookup row, which becomes "Your evaluations".
- Modules 1–2: one `video` block whose `summary` uses only the spec's goal text.
- Checklist keys are stable: `buddy-hello`; Module 6 `discord-1`…`discord-8`; Module 7 `twofa-google`, `twofa-discord`, `device-password`; Module 11 `invoice-template`.
- Module 8 shows the wing's text with `conditional` and `copyText`.
- Module 9's overlap line uses `{overlap local time}`; the client rule uses `{clientAccountSet: true}`; the "Go to Leave in Compass" button is shown as a disabled "Available after onboarding" (§9).
- Module 11 has two `conditional` branches on `contractType`.
- Module 7 uses `{security contacts}`, never the spec's named addresses.

Seed changes:
- Fill version 1 when its `blocks` is an empty array; never overwrite non-empty blocks, so HR's later edits survive a re-run.
- Connect the Health and Travel cards to `HEALTH_INSURANCE_PRESENTATION`, `HEALTH_CLAIM_KIT` and `TRAVEL_POLICY` with the new `config` link variant.

- [ ] **Step 1: Write the failing tests.**
  - All 14 slugs in `ACADEMY_MODULES` have blocks, and each list passes `parseBlocks`.
  - Every placeholder in the content is known (`findUnknownPlaceholders` is empty, walking all text fields).
  - Each module holds what its rule needs: `CHECKLIST_AND_FIELD` has a checklist and a `discordUsername` field; `CHECKLIST_AND_ACK` has a checklist and an acknowledgement; `PAYMENT_SETUP` has `bank` and `payout` fields in separate branches; `LINK_OPENED` has `dashboardLink`; `BUDDY_HELLO` has `buddy-hello`.
  - The content contains no `kpi` (case-insensitive) and no `@plutus21.com` address except `hr@` and `acct@`.
  - Seed: first run fills 14 versions; a second run leaves `blocks` unchanged; a version HR edited isn't overwritten; a stored empty version 1 gets filled.
  - `resolveCardLink({kind:'config', key:'HEALTH_CLAIM_KIT'}, {})` is `null`; a `config` link is rejected by `academyLinkSchema`, so it can't be saved as a settings link.
- [ ] **Step 2: Run them to confirm they fail.** Unit tests fail; run the integration tests with the local DB per Task 9, Step 1.
- [ ] **Step 3: Implement the content, seed and link changes.** The library editor keeps a stored `config` link when saving, and shows it as "From Links & settings: {key}".
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add version 1 module content`

---

### Task 4: Course service, release and progress routes

**Files:**
- Create: `lib/academy/service/context.ts`, `lib/academy/service/course.ts`, `lib/academy/service/progress.ts`
- Create: `app/api/admin/onboarding/new-hires/[id]/release/route.ts`, `app/api/onboarding/academy/modules/[slug]/events/route.ts`, `app/api/onboarding/academy/modules/[slug]/complete/route.ts`
- Modify: `lib/academy/service/setup.ts`, `app/(hr)/admin/onboarding/new-hires/[id]/_components/OnboardingSetupSection.tsx`
- Test: `tests/academy-course.integration.test.ts`, `tests/academy-progress-service.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `getSetupReadiness`, `eligibleCards`, `listKeyContacts`, `getAcademyConfig`
- Produces:
  - `buildAcademyContext(db, userId): Promise<AcademyContext | null>`, null when no released `NewHire` links to the user. It holds attributes, placeholder values, lead/team/buddy people (photo, name, title, Discord username), key contacts, lead input, library cards, config links, commute tiers
  - `releaseCourse(db, newHireId, actorId): Promise<{ releasedAt: Date }>`
  - `recomputeDueDates(db, userId): Promise<number>`
  - `loadHome(db, userId): Promise<HomeView>`, `loadModule(db, userId, slug): Promise<ModuleView>`
  - `recordEvent(db, userId, slug, event): Promise<ModuleProgressView>`
  - `completeModule(db, userId, slug): Promise<{ nextSlug: string | null; alreadyCompleted: boolean }>`

Rules:
- `releaseCourse`: re-run readiness, and on failure throw `AcademyError` 409 naming the missing items. Require 14 active modules that have a `completionRule` and a `currentVersionId`, or throw 409 "The Academy content hasn't been loaded yet." Upsert one `COURSE` row per module with `dueAt` and `source`, reset legacy-created rows to `LOCKED`, leave module 1 `IN_PROGRESS` with `startedAt` null, stamp `academyReleasedAt`, all in one transaction. Releasing twice returns the first `releasedAt` and changes nothing.
- Holidays: `PayrollPublicHoliday` where `teamTags` is empty or contains `holidayTeamFor(...)`. With a null team, weekends only.
- `saveSetup`: when the joining date changes on a released hire, call `recomputeDueDates`. Only incomplete rows change.
- `loadModule`: 404 if the module is inactive; 403 "Complete Module {n-1} first" if `LOCKED`, unless `unlockedEarlyById` is set; 404 with no progress row. Set `startedAt` on first open. A completed row renders its pinned `versionId`; any other row renders `currentVersionId`.
- `recordEvent`: inside a transaction, lock the row with `SELECT … FOR UPDATE`, read, apply, write. Refuse a `LOCKED` row with 403. Event keys are limited to what the module's filtered blocks define; an unknown key is 400. Validate with a Zod schema at the route.
- `completeModule`: inside the same locked transaction, evaluate with fresh DB data and refuse with 409 and the reason if not met. Set `COMPLETED`, `completedAt` and `versionId`, then unlock the next row only if it is `LOCKED`. A row already `COMPLETED` returns `alreadyCompleted: true` and changes nothing.
- `loadHome`'s view holds the greeting, title, department, done count, next module, `yourCalls`, `yourBuddy`, and modules grouped by phase. Before release it returns `{ released: false }`, and Home shows "Your course opens at your HR onboarding call."
- `{commute rate table}`: render as a table from active `PayrollTravelAllowanceTier` rows in effect today. With no rows, show "Ask HR for the current rates." Library card bodies are split around the token rather than string-substituted.
- Routes use `requireAcademySession`, `guardAcademyMutation` and `academyErrorResponse`; the release route uses `requireAcademyHr`. Responses use the `{ success, ... }` envelope.
- Setup section: a "Release course" button, disabled while items are missing, with the existing missing list; once released, "Released {date}".

- [ ] **Step 1: Write the failing integration tests.**
  - Release with a missing field gives 409 naming it; a complete hire gets 14 rows, module 1 available, due dates set; releasing twice changes nothing; rows the legacy path created are corrected.
  - Release with only 3 active modules gives 409.
  - Moving the joining date changes incomplete `dueAt`, not completed ones.
  - Two concurrent `recordEvent` CHECK calls with different keys (`Promise.all`) both persist.
  - Two concurrent `completeModule` calls: one row completed, next unlocked once, and neither throws.
  - Completing with the rule unmet gives 409 with the reason, and the next stays `LOCKED`.
  - A `LOCKED` module refuses both `loadModule` and `recordEvent`.
  - After a new version is published, a completed module still loads version 1 and an open one loads version 2.
  - No tutorials and no key contacts: Module 3 and 4 load and Module 4 completes by `SCROLL_END`; no rendered text contains `{`.
  - `recordEvent` with a key not in the module gives 400.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL, modules not found.
- [ ] **Step 3: Implement the services, routes and setup section change.**
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS, no type errors.
- [ ] **Step 5: Commit.** `feat(academy): add course release, progress and completion`

---

### Task 5: Saved fields, bank details and the Security acknowledgement

**Files:**
- Modify: `prisma/schema.prisma`; create migration `prisma/migrations/<ts>_onboarding_pending_bank/`
- Create: `lib/academy/bank.ts`, `lib/academy/service/fields.ts`
- Create: `app/api/onboarding/academy/discord/route.ts`, `linkedin/route.ts`, `bank/route.ts`, `acknowledgements/route.ts`, all under `app/api/onboarding/academy/`
- Modify: `app/api/admin/users/route.ts`, `app/api/admin/users/reactivate/route.ts`, `app/api/payroll/employees/[id]/profile/route.ts`
- Test: `tests/academy-bank.test.ts`, `tests/academy-fields.integration.test.ts`

**Interfaces:**
- Consumes: `encryptPayrollField`, `decryptPayrollField`, `encryptSensitiveValue`; Task 4's module context
- Produces:
  - `saveDiscordUsername(db, userId, value)`: writes `User.discordUsername`
  - `saveLinkedinUrl(db, userId, value)`: writes `state.linkedinUrl` on the Module 8 row only; `User.linkedinUrl` is written by HR's Verify in stage 4
  - `saveBankDetails(db, userId, input): Promise<{ held: boolean }>`
  - `applyPendingBankDetails(db, userId): Promise<boolean>`
  - `signAcknowledgement(db, userId, { kind, typedName, moduleSlug }): Promise<{ signedAt: Date }>`
  - `bankDetailsSchema`, `maskIban(iban: string): string`, which keeps the last 4 characters

New model:

```prisma
model OnboardingPendingBankDetails {
  id           String   @id @default(cuid())
  userId       String   @unique
  accountTitle String
  bankName     String
  branch       String
  iban         String
  submittedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user         User     @relation("OnboardingPendingBankUser", fields: [userId], references: [id], onDelete: Cascade)
}
```

All four values are encrypted with `encryptSensitiveValue` and labels `pendingBank.<field>`.

Rules:
- `saveBankDetails`: refuse with 400 unless `contractType === 'PK_EMPLOYMENT'`. With a payroll profile, update only `accountTitle`, `bankName`, `branch`, `iban` with `updateMany`, encrypted. Without one, upsert the pending row. Never create a profile.
- `bankDetailsSchema`: required trimmed fields; `iban` loses spaces, is uppercased, must match `/^PK\d{2}[A-Z]{4}\d{16}$/`, and the error is "That IBAN doesn't look right. It should start with PK and have 24 characters."
- `applyPendingBankDetails`: if a profile and a pending row both exist, copy the values and delete the row in a transaction. Call it after the profile write in the three admin and payroll routes above. A failure there is logged and doesn't fail HR's save.
- `signAcknowledgement`: `typedName` must equal the user's name, ignoring case and spaces, or fail with "Type your full name as it appears at the top of this page." It snapshots the block's `statement` and the version ID. Signing twice returns the first signature.
- `GET /api/admin/users`: remove `iban` and `branch` from the response (stage 1 carry-forward). Saving still leaves them alone, because omitted optional fields aren't overwritten. `accountNumber` is unchanged and stays a stage 4 item.
- The bank GET returns only `{ saved, held, ibanMasked }`, so the hire sees it masked after submission (§9).

- [ ] **Step 1: Write the failing tests.**
  - `maskIban('PK36SCBL0000001123456702')` is `'••••6702'`; valid and invalid IBANs, with spaces and lower case.
  - A PK hire with a profile: fields encrypted at rest, and `accountNumber` untouched. Without one: pending row encrypted, profile count stays zero.
  - A contractor calling `saveBankDetails` gets 400 and no writes. A PK hire calling `savePayout` still gets 400.
  - `applyPendingBankDetails` moves the data and deletes the row; with no profile it returns false and keeps it.
  - Module 11 for a PK hire with held details completes, and a contractor needs the payout row plus the `invoice-template` tick.
  - `signAcknowledgement` with the wrong name fails; a right name stores the exact statement; signing twice keeps the first `signedAt`.
  - `GET /api/admin/users` mapping omits `iban` and `branch`: extract the mapping to a pure function and test that.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL.
- [ ] **Step 3: Write the schema change and generate the migration with `prisma migrate diff`** against the local DB (not `migrate dev`), per the project memory. The SQL must only add.
- [ ] **Step 4: Implement the service, routes and admin changes.**
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(academy): save course fields, bank details and security acknowledgement`

---

### Task 6: Server-side lockout

**Files:**
- Create: `lib/academy/lockout.ts`
- Modify: `middleware.ts`, `lib/auth.ts`, `components/layout/SidebarLayout.tsx`, `components/layout/AppSidebar.tsx`
- Test: `tests/academy-lockout.test.ts`

**Interfaces:**
- Produces:
  - `ACADEMY_PATH_HEADER = 'x-compass-pathname'`
  - `isPathAllowedWhileLocked(pathname: string): boolean`
  - `shouldBlockSession(input: { enabled: boolean; onboardingCompleted: boolean; pathname: string | null }): boolean`

Why this seam: middleware has no database access and the session cookie doesn't hold onboarding status, while 159 of the 242 API routes call `getSession()` directly. The remaining routes mostly go through `requireWeeklySession`, `requireSecuritySession` and the Academy helpers. `getIronSession` appears only in `lib/auth.ts`, so no session reader bypasses that file. Step 3 confirms each helper reaches `getSession()`, and that any route with no session check is public or cron-only.

How it works:
- Middleware overwrites `x-compass-pathname` on the forwarded request headers for every request, including the public branch, so a client can't spoof it.
- `getSession()` reads the header after loading the user. If `shouldBlockSession` is true it returns `null`, so APIs return their normal 401.
- `pathname === null` fails closed for a locked user.
- The client redirect in `SidebarLayout.tsx` stays, for pages. It adds `/handbook` to its allowed list only when the flag is on. Pages get their data from APIs, so those APIs are the real boundary. `app/(evaluator)/device-support/assets/[tag]/page.tsx` and `app/assets/scan/[tag]/page.tsx` read a session directly and already handle `null`.

Allowlist, as prefixes unless marked exact:
- Pages: `/onboarding`, `/profile`, `/handbook`, `/login`
- APIs: `/api/auth/`, `/api/onboarding/academy/`, `/api/handbook`, `/api/onboarding/payout` (exact)
- `/api/users/me`, `/api/weekly/me`, `/api/security-checks/me`, `/api/clientele/access`, `/api/office/avatar`, `/api/projects/notification-preferences`, `/api/admin/password` (all exact). These are what the shell and profile page call today, and they should return only the user's own data. Confirm that by reading each one, and drop any that doesn't.

Legacy `/api/onboarding/quiz*`, `/api/onboarding/progress` and `/api/onboarding/modules*` are **not** allowed, or a hire could complete onboarding by the old route. `ONBOARDING_SIDEBAR` gains "Company Dashboard" (`/handbook`) when the flag is on, via a `withAcademyNav`-style helper.

- [ ] **Step 1: Write the failing tests.**
  - Each allowlisted path is allowed; `/onboardingfoo` and `/handbookish` aren't (match a whole segment).
  - `/api/onboarding/quiz/submit`, `/api/onboarding/progress`, `/api/leave`, `/api/admin/users`, `/dashboard` aren't.
  - `/api/onboarding/payout/x` isn't (exact match).
  - `shouldBlockSession`: flag off is never blocked; a completed user is never blocked; locked plus not-allowed is blocked; locked plus `null` is blocked; locked plus `/onboarding` isn't.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `lockout.ts`, the middleware header, the `getSession` check and the sidebar changes.** `lockout.ts` has no server-only imports, because middleware loads it. `getSession` must not throw when called outside a request.
- [ ] **Step 4: Run the tests and the existing middleware tests.** Expected: PASS.
- [ ] **Step 5: Check it live** with `next dev` against the local DB, flag on: a locked user gets 401 from `/api/leave` and 200 from `/api/onboarding/academy/...`; an existing user is unaffected. Repeat with the flag off: the locked user reaches everything as today.
- [ ] **Step 6: Commit.** `feat(academy): enforce the onboarding lockout on the server`

---

### Task 7: Block renderer and module page

**Files:**
- Create: `components/academy/BlockRenderer.tsx`, `components/academy/blocks/*.tsx`, `components/academy/ModulePage.tsx`, `components/academy/ModuleRail.tsx`, `components/academy/CompleteFooter.tsx`, `components/academy/useModuleProgress.ts`, `components/academy/brand.ts`, `components/academy/fonts.ts`
- Modify: `app/(evaluator)/onboarding/[moduleSlug]/page.tsx`; move the legacy client page to `app/(evaluator)/onboarding/[moduleSlug]/LegacyModulePage.tsx`, unchanged
- Test: `tests/academy-module-view.test.ts`

**Interfaces:**
- Consumes: `loadModule`'s `ModuleView`, the Task 4 and Task 5 routes
- Produces: `<ModulePage view={ModuleView} />`

Rules:
- The page is a server component: flag off renders `LegacyModulePage`; flag on checks the session, calls `loadModule`, and maps `AcademyError` 403/404 to a redirect to `/onboarding`.
- `useModuleProgress` sends events through a single in-order queue, and updates ticks optimistically. On failure it reverts and shows a toast with the server's message.
- The end-of-content sentinel uses `IntersectionObserver` and fires `SCROLLED_END` once. If the content already fits the screen, it fires on first paint.
- The disabled reason is plain text next to the button and also the tooltip, so it's visible on touch screens.
- On complete, show the check animation and the toast "Nice, Module 4 done — next up: How We Work", then go to `nextSlug`, or Home after the last module.
- `richText` uses `react-markdown` with `remark-gfm` and no raw HTML. External links open in a new tab with `rel="noopener noreferrer"`.
- `CompleteFooter` is sticky, with Back and "Mark complete and continue". It's safe-area aware on phones, and doesn't cover the last line of content.
- Layout per design §7: left rail on desktop; slim bar plus "Modules" drop-down on mobile; blue header band with "MODULE 03 OF 14"; 720px column.
- Brand tokens per design §7 and §13 live in `brand.ts`. `fonts.ts` loads EB Garamond with `next/font`. Value colours aren't used in stage 2.
- Use the impeccable or frontend-design skill for the visual pass on this task.

- [ ] **Step 1: Write the failing test** for `moduleNumberLabel(3, 14)` → `'MODULE 03 OF 14'`, and for the view mapping that returns the disabled reason.
- [ ] **Step 2: Run it to confirm it fails.** Expected: FAIL.
- [ ] **Step 3: Move the legacy page and build the renderer and page.** Every block type from Task 1 renders. A type with no renderer is a TypeScript error, via an exhaustive `switch`.
- [ ] **Step 4: Run the tests, `npx tsc --noEmit` and `npx next build`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add the module page and block renderer`

---

### Task 8: Onboarding Home

**Files:**
- Create: `components/academy/AcademyHome.tsx`, `components/academy/ModuleCard.tsx`, `components/academy/ProgressRing.tsx`
- Modify: `app/(evaluator)/onboarding/page.tsx`; move the legacy page to `app/(evaluator)/onboarding/LegacyOnboardingHub.tsx`, unchanged
- Test: `tests/academy-home-view.test.ts`

**Interfaces:**
- Consumes: `loadHome`'s `HomeView`, Task 2's `moduleCardState`
- Produces: `<AcademyHome view={HomeView} />`, `moduleCardCopy(card): { label: string; chip: string | null }`

Rules, per spec section 6 screens 1 and 2 and design §7:
- Hero: "WELCOME TO THE TEAM, {preferred name}", title and department, ring with "6 of 14 modules" and the due date.
- One next-up card with a large "Continue".
- Side cards: "Your calls" and "Your buddy", with a copy button for the Discord username.
- Groups: Day 1, Week 1, Final Step: Culture Quiz. Grid of 3, 2 and 1 columns.
- The quiz card reads "Your culture quiz will appear here." until stage 3.
- Before release, a friendly waiting screen. After all 14: "All 14 modules done. Your culture quiz is next."
- An existing user who somehow reaches `/onboarding` with the flag on and no course sees a short "Nothing to do here" panel and a link home; they are never redirected in a loop.
- Compass opens to Home at login until the course is complete: confirm the existing redirect in `SidebarLayout.tsx` does this.

- [ ] **Step 1: Write the failing test** for `moduleCardCopy`: Locked → "Complete Module 3 first"; Available → "Start"; In progress → "Continue"; Completed → "Completed 4 Dec 2026"; overdue adds the chip "Overdue" on any unfinished state and never on a completed one.
- [ ] **Step 2: Run it to confirm it fails.** Expected: FAIL.
- [ ] **Step 3: Move the legacy page and build Home.**
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add the onboarding home`

---

### Task 9: End-to-end check and carry-forward

**Files:**
- Create: `tests/academy-course-flow.integration.test.ts`, an E2E spec in the repo's Playwright test folder (check `package.json` and the Playwright config for its location)
- Modify: `prisma/seed-academy.ts` warning text, the design's §10 "stage 2 or later" wording, this plan

- [ ] **Step 1: Start the local test database** from the project memory's binaries, on port 5433, and push the schema. Every test command sets `DATABASE_URL` to `compass_weekly_test` and `WEEKLY_DB_TEST=true`. Confirm the URL before each run.
- [ ] **Step 2: Write the flow test.** Seed, set up a fictional PK hire, release, complete modules 1–14 in order through the services with the real rules, and assert that `done = 14`, the quiz card state is reached, `onboardingCompleted` stays `false`, and `Benefit` counts are unchanged. Repeat for a fictional contractor with no payroll profile created at any point.
- [ ] **Step 3: Write the E2E spec.** A hire finishes a Day 1 module (Module 5) on desktop and on a mobile viewport, and HR releases a course from the setup section.
- [ ] **Step 4: Update the docs.** Seed warnings and design §10 no longer say "stage 2 or later"; they say the seed and cutover run once, around the push that makes the Academy the default. Design §12 gains the flag-removal step and the cleanup push. Add an "After stage 2" section to this plan with:
  - the "Lost or stolen" box pinned to everyone's home screen (spec, Module 7), not in any stage
  - Security call time missing from the setup fields
  - `accountNumber` still returned by `GET /api/admin/users`
  - pending bank details aren't visible to HR or OA until the stage 4 tracker
  - stage 4 auto-ticks, derived from stored data at backfill
  - bank letter download, once HR sends the text
- [ ] **Step 5: Run everything.** `npx tsc --noEmit`, `npm test`, `npm run test:academy-db`, `npx next build`, and `prisma migrate diff` from migrations to the schema. Expected: tsc clean, academy tests all pass, the same 18 server-only failures as the baseline, build passes, empty diff.
- [ ] **Step 6: Commit.** `test(academy): cover the course flow end to end`


---

## After stage 2

Carried forward. None of this is built in stage 2. `2026-11-05-onboarding-academy-payroll-separation.md` replaced the payroll links in the tasks above.

**Needs a user decision before main**
- **Header forwarding on a preview build.** The lockout reads the path the middleware forwards in `x-compass-pathname`. It was proven on `next dev`. Verify it on a Vercel preview build before main. `tests/academy-lockout-wiring.test.ts` fails if the `isLockedOut` check leaves `getSession` or the middleware stops setting the header, but only a deployed build proves the header arrives.

**Stage 3 first**
- Quiz reset still sets the linked `NewHire` to ONBOARDING, and the HR quiz page still says "reset locked users".

**Must close before main**
- **`ONBOARDING_FIELD_ENCRYPTION_KEY`** must be set on every environment. There is no root `.env.example` to document it in.
- Modules 1 and 2 complete on open until the real video player (VIDEO_95) ships.
- Saves of payment details are only a log line, so they need an audit row.

**Stage 3 (quiz)**
- Stage 3's test pass: route-level tests for the new routes.
- The quiz reset keeps `NewHire.status` set to ONBOARDING, so a completed hire can show as ONBOARDING while `onboardingCompleted` stays true. With the flag on the reset no longer relocks anyone, yet the HR quiz page still says "reset locked users" and toasts "Quiz attempts reset". Revisit both when the quiz is rebuilt.

**Stage 4 (HR operations)**
- Store who released a course (`_actorId` is unused).
- Module management must create progress rows for hires whose course is already released.
- Reuse `linkedinUrlSchema` for Verify.
- Route-level tests.
- **OA's read view of payment details.** The tracker shows `OnboardingPaymentDetails` through the existing masked API (`GET /api/admin/onboarding/payout/[userId]`) and its logged reveal, for PK and contractor rows alike. Until then OA can only reach them through that API. Show OA what is new, since they enter it into payroll by hand.
- Checklist auto-ticks are derived from stored data at backfill, not recorded as events.
- Early-unlocked modules need `ModuleCardView` support, so Home can show them as such.
- The bank letter download, once HR sends the text. Until then Module 11 says "HR will share your bank letter".

**Not in any stage yet**
- The "Lost or stolen" box pinned to everyone's home screen (spec, Module 7).
- Security call time is missing from the setup fields, so the Home side card shows HR and team calls only.
- `accountNumber` is still returned by `GET /api/admin/users`.
