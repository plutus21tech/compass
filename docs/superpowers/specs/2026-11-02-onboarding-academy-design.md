# Compass Onboarding Academy — Design

**Date:** 2026-11-02
**Source spec:** `Compass Onboarding Academy_ Product Spec.docx` (HR's product spec, sections 1–6). Section 7 (video scripts) is not needed for the build. Section 8 (HR onboarding checklist) is still to come from the user.
**Builds on:** the onboarding module shipped in Feb–Mar 2026 (`lib/onboarding.ts`, `app/(evaluator)/onboarding/*`, `app/(hr)/admin/onboarding/*`, `app/api/onboarding/*`, `prisma/seed-onboarding.ts`).

Wherever this document says "the spec", it means the product spec above. Copy, question banks, tables and module-by-module screen text come from the spec and are not repeated here.

---

## 1. Intent

HR currently onboards people with six or more emails, a Canva deck edited by hand for each hire, Notion and Drive links, and Discord messages. The content has drifted apart: the deck and the culture email disagree on the values and on where leave is applied for. HR also can't see what anyone has read.

The Academy replaces all of that with one guided course inside Compass, done in the hire's first week:
- 14 modules and a culture quiz, in a fixed order
- content that adapts to the person
- proof of completion and signed acknowledgements
- HR's own checklist kept next to the hire's progress

HR edits the content once in Compass, without needing an engineer.

The user wants it to feel **friendly**. The reference point is compliance-training portals such as Delve, KnowBe4 and Vanta-style employee portals:
- one clear "what to do next"
- a visible task list with plain statuses
- due dates and overdue flags
- a satisfying finish with a certificate

### Success (from the spec)
- 90% of hires finish all modules by the end of week 1.
- 80% pass the quiz on their first attempt.
- 95% of HR checklist steps close on time, with a reason recorded for every miss.
- Emails HR sends by hand per hire drop from about 8 to 1.

## 2. Goals, non-goals, anti-goals

**Goals**
- The new-hire course from spec sections 2, 4 and 5: 14 modules, the quiz, both acknowledgements, and the completion screen with a certificate.
- HR setup fields on the new-hire record (spec section 3), plus a team lead input request.
- An HR tracker (table and side drawer) and Onboarding settings (content editors with a preview).
- An HR onboarding checklist with deadlines, reminders and automatic ticks (spec section 8, still to come).
- Reminders and notifications by email.
- Content versioning, "ask everyone to re-read", and assigning a single module to existing staff.

**Non-goals (spec, "out of scope for now")**
- Offboarding.
- Client-specific training (3Echo, Noble).
- Access before the company email exists.
- Invoice upload inside Compass. The spec calls this an "optional later phase".
- KPIs in Module 4. The user said the KPI module was removed, so Module 4 has no KPI section.

**Anti-goals (would be a failure even if it technically works)**
- A hire who can't finish because content or videos are missing. Every module must have a working fallback; see §6.4.
- Showing a hire benefits, pay steps or reimbursements that don't apply to them.
- Bank details visible to anyone except HR, OA and the hire.
- Breaking what HR uses today:
  - Positions → NewHire pipeline
  - team lead form
  - security checklist
  - existing benefit categories and benefits (**must not be wiped**)
- Locking an existing employee out of Compass because they were assigned a single module.
- A hire who completed a module seeing their record change when HR edits that module later.

## 3. Decisions already made (by the user)

| # | Decision |
|---|---|
| D1 | Positions, the team lead form and the security checklist **stay**. They are HR's side of onboarding. Positions is HR's pre-onboarding step. The Academy is added on top. |
| D2 | **New hires stay locked out of Compass until they finish the Academy.** The lockout applies only to new hires (`onboardingCompleted = false`). Existing staff assigned a single module are not locked. |
| D3 | **Do not wipe benefit data.** `BenefitCategory` and `Benefit` are used today and must be left as they are. |
| D4 | Joining date and bank details for **Pakistan employment contracts** use the existing **payroll profile**. Bank details are visible only to **HR and OA** (O&A: operations and accounting, role `OA`). "Accounts" in the spec means OA. |
| D4a | **Contractors never get a payroll profile.** Their payout details are kept separately (§5.9), entered by the hire and read-only for HR and OA. They may be paid by Wise, bank transfer, Payoneer or anything else. |
| D10 | Location, work mode, contract type and employment status are stored on **every employee's profile**, not only on new hires, so single-module assignments and re-reads can filter content. **HR backfills current staff.** |
| D11 | At cutover, users already marked `onboardingCompleted = false` are test accounts. **Mark them complete.** |
| D5 | Drop KPIs from Module 4. |
| D6 | Time zone comes from office location (Karachi, Casablanca, Bogotá, Dallas, or the remote country). Working days use the **existing holiday calendar**. No per-person time-zone field. |
| D7 | Videos are hosted on **YouTube** (unlisted). They haven't been filmed yet. |
| D8 | Ship in stages, each behind a feature flag (as Security Checks did). See §12. |
| D9 | The UI must be friendly, drawing on similar module-based training platforms (Delve was named). |

## 4. What happens to the existing foundation

| Existing | Fate |
|---|---|
| `Position`, `NewHire`, `TeamLeadForm`, `SecurityChecklist` + routes and pages | **Keep.** `NewHire` gains the setup fields (§5.1). `TeamLeadForm` gains the lead-input fields (§5.2). Its existing fields stay. |
| `OnboardingModule` (11 text modules) | **Retire, don't delete.** Set `isActive = false` and seed the 14 new modules. |
| `OnboardingProgress` | **Extend** (§5.4). Rows for the old modules are left alone. |
| `OnboardingQuizQuestion`, `QuizAttempt`, `OnboardingConfig` | **Extend.** Retire the old questions (`isActive = false`) and seed the spec's 12. |
| `BenefitCategory`, `Benefit` | **Untouched** (D3). The Academy's benefits use a new library (§5.6). |
| Client-side lockout in `components/layout/SidebarLayout.tsx` | **Keep, and add server-side enforcement** (§9). It is client-only today. |
| `ONBOARDING_SIDEBAR` | Keep. Add the Company Dashboard link (§9). |
| The 4 `NewHire` rows in prod (Abc, Test, Sana Khan, Maria) | Leave in place. They look like test data. Don't delete without asking. |

## 5. Data model

All changes are additive Prisma migrations. Vercel runs migrations on build, and the local `.env` points at the shared prod Neon DB, so migrations must be **additive and safe to run against prod**.

### 5.1 HR setup fields: on `NewHire`

Spec section 3 lists the fields. Here is where each one lives:

| Spec field | Storage |
|---|---|
| Full name | `NewHire.name` (exists) |
| Preferred name | `NewHire.preferredName` (new, required) |
| Title | `NewHire.title` (exists) |
| Department | `NewHire.department` (exists). Use the same department list Compass uses elsewhere. |
| Company wing | New `NewHire.companyWing` enum column (CAPITAL / PARTNERS). Backfill from the existing free-text `company` where it matches. |
| Client account | `NewHire.clientAccount` (new, optional). Free text with suggestions: 3Echo, Noble, Lambda Surgical, Internal. |
| Office location | **Profile attribute** (§5.3): `officeLocation` (enum: KARACHI, CASABLANCA, BOGOTA, DALLAS, REMOTE) + `remoteCountry` (when REMOTE) |
| Work mode | **Profile attribute** (§5.3): `workMode` (enum: OFFICE, HYBRID, REMOTE) |
| Contract type | **Profile attribute** (§5.3): `contractType` (enum: PK_EMPLOYMENT, INDEPENDENT_CONTRACTOR, OTHER_EMPLOYMENT). Prefilled from `PayrollEmployeeProfile.employmentType` where a payroll profile exists. Contract type is never written to payroll, and no payroll profile is created for contractors (D4a). |
| Employment status | **Profile attribute** (§5.3): `employmentStatus` (enum: PERMANENT, FIXED_TERM, INTERN) |
| Date of joining | `NewHire.onboardingDate` (exists). For PK_EMPLOYMENT hires with a payroll profile, copy it into `PayrollEmployeeProfile.joiningDate` when linking, if empty. |
| HR onboarding call, team onboarding call | `NewHire.hrCallAt`, `NewHire.teamCallAt` (new, DateTime) |
| Team lead | `NewHire.teamLeadId` (exists) |
| Team members | New join table `NewHireTeamMember (newHireId, userId)` |
| Buddy | `NewHire.buddyId` (exists) |
| Core hours | `NewHire.coreHoursStart` / `coreHoursEnd` (new, "HH:mm" in the location's time zone). Defaults to the department's hours if Compass has them; otherwise HR types them. |
| Course release | `NewHire.academyReleasedAt` (new). The spec says the course is released at the HR onboarding call. HR presses "Release course" in the tracker. Release is blocked until every required field and the lead input are complete. Compass lists what's missing. |

### 5.2 Team lead input: extend `TeamLeadForm`

Add these fields, all filled by the team lead or HR:
- `roleExpectations` (rich text)
- `day1Goal`, `week1Goal`, `month1Goal`, `month3Goal`. The spec table lists three goals, but Module 4's copy also shows a Day 1 goal, so include it as optional.
- `tutorials` (JSON: `[{title, url}]`)
- `teamTools` (JSON: `[{name, purpose, url?}]`)
- `leadInputDueAt`, which is the joining date minus 7 days

Existing fields (email groups, Discord channels, etc.) stay for HR's use.

When HR saves the setup, Compass emails the lead to fill in or review this input. The page `app/(evaluator)/team-lead-form/[newHireId]` and the pending-forms dashboard card already exist; extend both.

### 5.3 Profile fields: on `User`

**Contact fields.** Add `discordUsername` and `linkedinUrl`. Both are optional and editable on the profile page for everyone. Module 6 writes `discordUsername`. Module 8 writes `linkedinUrl` once HR verifies it. The existing `discordId` is separate.

**Content-adapting attributes** (D10). Add these to `User`, all nullable:
- `officeLocation`, `remoteCountry`
- `workMode`
- `contractType`
- `employmentStatus`

These are what eligibility filtering, `conditional` blocks and Module 11's A/B switch read, for new hires and existing staff alike.
- **New hires:** HR enters them in the new-hire setup. Before an account is linked they are held on `NewHire` (same columns); at link time they are copied to `User`, and `User` is the source of truth from then on.
- **Existing staff:** HR backfills them in Admin › Users (an editable column set, with a "missing attributes" filter). The form is prefilled where data exists:
  - location from `teamTag` (PAKISTAN → Karachi, MOROCCO → Casablanca, COLOMBIA → Bogotá)
  - contract type from the payroll employment type
- **Missing attributes:** a person with any attribute still empty only sees library cards and conditional content that apply to everyone, never content restricted to a group. The tracker and settings show a count of staff with missing attributes.
- **Editing:** only HR can edit these attributes. Employees can see them on their profile but not change them.

### 5.4 Module content, versions and progress

- **`OnboardingModule`**: add these fields:
  - `phase` (DAY_1 | WEEK_1)
  - `estimatedMinutes`
  - `headlineLead` and `headlineAccent` (the spec's "UPPERCASE + italic word" pattern)
  - `icon` (a Lucide icon name)
  - `completionRule` (enum, §6.2)
  - `currentVersionId`
  - `heroImageUrl?`
- **`OnboardingModuleVersion`** (new): `moduleId`, `version`, `blocks` (JSON, validated by Zod §6.1), `publishedAt`, `publishedById`, `changeNote`.
  - HR edits a draft and then publishes it. Publishing creates a new version.
  - Completed progress keeps a pointer to the version the hire completed.
- **`OnboardingProgress`**: add these fields:
  - `versionId` (version completed)
  - `dueAt`
  - `source` (COURSE | SINGLE_ASSIGNMENT | REREAD)
  - `assignedById?`
  - `unlockedEarlyById?`
  - `state` (JSON: checklist ticks, tutorial-open timestamps, video furthest-second, scrolled-to-end, field values that aren't stored elsewhere)
- **`OnboardingProgressHistory`** (new): when a completed module is reopened for a re-read, copy the old completion here (`userId`, `moduleId`, `versionId`, `completedAt`). The progress row then resets to IN_PROGRESS. This keeps "existing hires keep the version they completed" true while `@@unique([userId, moduleId])` stays.

### 5.5 Acknowledgements

**`OnboardingAcknowledgement`** (new) stores:
- `userId`
- `kind` (SECURITY_SOPS | VALUES_CODE_OF_CONDUCT)
- `statementText` (a snapshot of the exact wording signed)
- `moduleVersionId?`
- `typedName`
- `signedAt`

HR can download these from the tracker drawer, one at a time as a PDF, or all of them as a CSV export.

### 5.6 Libraries and central lists (Onboarding settings)

- **`OnboardingLibraryCard`** (new): one table for both benefits and reimbursements. It is separate from the existing `Benefit` table, per D3.
  - Fields: `kind` (BENEFIT | REIMBURSEMENT), `title`, `icon`, `body` (rich text with `{placeholders}`), `links` (JSON), `orderIndex`, `isActive`.
  - Eligibility arrays: `locations[]`, `workModes[]`, `contractTypes[]`, `employmentStatuses[]`. An empty array means everyone.
  - Seed from the spec's benefits matrix and the Module 12 copy.
  - Cells the spec marks "HR to confirm" are seeded as **not eligible**, so they stay hidden until HR sets them.
- **`OnboardingKeyContact`** (new): `group` (HR | SECURITY_IT | ACCOUNTS | EXECUTION), `userId?` (a Compass profile gives the photo, title and Discord), `label?`, `email?`, `orderIndex`.
- **Karachi commute rate table:** payroll already holds travel allowance data. The builder checks whether those rates can be shown directly. If not, store an editable table in settings (JSON on `OnboardingConfig`).
- **Policy links come from the Compass handbook.** A link field in settings can point either at a handbook page (picked from a list) or at an external URL. Seed these handbook links:
  - travel-policy
  - company-equipment-policy
  - sop-faulty-equipment
  - discord-channels-guide
  - leave-policy
  - core-hours-policy
  - zero-tolerance-policy
  - principles-of-conduct

  If a link is empty, its card is hidden. It never shows as a broken link.
- **`OnboardingConfig`** gains:
  - links with no handbook page: Discord training manual, Discord training video, incident form, Cyber Security SOP, health-insurance presentation and claim kit
  - invoice-template link per department (JSON)
  - the account-opening-letter template (rich text with placeholders)
  - quiz settings: `retakeCooldownMinutes = 15`, `failAlertThreshold = 3`
  - the Weekly Blockers Call time, stored in US Central Time
  - the two videos' YouTube IDs, chapter lists and transcripts
  - `maxQuizAttempts` stays in the schema but no longer locks anyone out; the spec says notify HR after 3 failed attempts.

### 5.7 Quiz

- **`OnboardingQuizQuestion`**: add `explanation`, `valueKey` (which value it maps to, for colour), `videoChapterKey`, `retiredAt`. Questions are retired, never deleted, so old attempts still resolve.
- **`QuizAttempt`**: `answersJson` records, per question, the question ID, the chosen option, whether it was correct, and the order shown.

### 5.8 HR onboarding checklist (section 8, still to come)

- **`OnboardingChecklistTemplateItem`**: `title`, `ownerRole` (HR | SECURITY | OA | TEAM_LEAD), `dueOffsetDays` (relative to joining date, can be negative), `autoTickEvent?`, `orderIndex`, `isActive`.
- **`OnboardingChecklistItem`** (one per hire): `newHireId`, `templateItemId`, `dueAt`, `doneAt?`, `doneById?`, `autoTicked`, `missReason?`.
  - Created when the setup is saved.
  - Overdue items ask for a `missReason` when they are finally ticked, which feeds the "reason for every miss" success measure.
- **Auto-tick events named in the spec:**

  | Event | Ticks |
  |---|---|
  | `DISCORD_USERNAME_SAVED` (Module 6) | "Creation Discord Account (with profile photo)" |
  | `LINKEDIN_VERIFIED` (Module 8 verify) | "LinkedIn Profile Update" |
  | `PAYMENT_SETUP_DONE` (Module 11) | "Invoice Sharing/Bank Account Setup + Accounting Team Updated" |
  | `LEAD_INPUT_SUBMITTED` | "KPIs and tutorials and documentation from Team Manager" |

  The full list is seeded once section 8 arrives.
- "Completion of Manager's Onboarding Checklist" is owned by the team lead and is never auto-ticked.

### 5.9 Contractor payout details (Module 11, version B)

Contractors are kept **out of payroll** (D4a). New model **`ContractorPayoutDetails`**, one row per user:
- `userId` (unique)
- `method` (WISE | BANK_TRANSFER | PAYONEER | OTHER)
- `accountHolderName`
- method-specific fields:
  - **Wise or Payoneer:** `payoutEmail`
  - **Bank transfer:** `bankName`, `accountNumberOrIban`, `swiftBic`, `bankCountry`, `bankAddress?`
  - **Other:** `instructions` (free text)
- `currency`
- `submittedAt`, `updatedAt`

The Module 11 form shows only the fields for the method the hire picks.

**Security.** Account numbers, IBANs, emails and instructions are encrypted at rest, reusing the payroll sensitive-field encryption helper (`lib/payroll/sensitive-fields.ts`) without touching payroll tables.

**Access.**
- The hire enters and can update their own details.
- **HR and OA can read them only**: read-only, masked by default, with a "Reveal" action that is logged.
- No other role can see them.

Changing the details later notifies OA.

## 6. The course

### 6.1 Content blocks

A module version is an ordered list of typed blocks, stored as JSON and validated with a Zod discriminated union. Block types (spec section 6, item 3):
- `video`
- `richText`
- `valueCards`
- `peopleCards` (source: lead / team / buddy / keyContacts)
- `linkCards` (with an open-tracking flag)
- `checklist`
- `dataTable`
- `warningBox`
- `inputField` (with a target: discordUsername, linkedinUrl, bank fields, payout fields)
- `acknowledgement`
- `copyText`
- `timeline` (90-day plan, review moments)
- `toolTiles`
- `libraryCards` (BENEFIT | REIMBURSEMENT)
- `callTimes`
- `conditional` (shows its children only if a rule matches, e.g. `clientAccount set`, `contractType = PK_EMPLOYMENT`, `location = KARACHI`)

**Placeholders.** `{preferred name}`, `{title}`, `{lead first name}`, `{core hours}`, `{local time}` and the rest are filled at render time from a single `OnboardingContext` built server-side for the hire. An unknown placeholder renders as empty, never as raw braces, and is flagged in the settings preview.

**Per-hire data blocks.** Some content comes from the hire's record rather than from module copy:
- people cards
- role expectations
- goals
- tutorials
- team tools
- call times

These blocks pull it at render time, so HR never edits those per hire inside the module.

### 6.2 Completion rules (`completionRule`)

| Rule | Modules | Behaviour |
|---|---|---|
| `VIDEO_95` | 1, 2 | Completes automatically at 95% watched. No button. The end screen shows "Next: Module N". |
| `SCROLL_END` | 5, 9, 10, 12, 13 | The "Mark complete and continue" button activates after a sentinel at the end of the content is seen. While disabled, a tooltip says why. |
| `BUDDY_HELLO` | 3 | Tick "I have said hello to my buddy on Discord". |
| `ALL_LINKS_OPENED` | 4 | Every tutorial card opened, then mark complete. If there are no tutorials, falls back to SCROLL_END. |
| `CHECKLIST_AND_FIELD` | 6 | Every checklist item ticked and the Discord username saved. |
| `CHECKLIST_AND_ACK` | 7 | 2FA checklist ticked and the acknowledgement signed. |
| `FIELD_SUBMITTED` | 8 | LinkedIn URL submitted. The module completes for the hire. HR's Verify step is a separate checklist tick. *(Builder's call: verification doesn't block the hire.)* |
| `PAYMENT_SETUP` | 11 | Version A (PK employment): bank fields saved to the payroll profile. Version B (everyone else): `ContractorPayoutDetails` saved (§5.9) and "I've copied my invoice template" ticked. Notifies OA. |
| `LINK_OPENED` | 14 | The Company Dashboard link has been opened. |

Completion is **validated on the server** against `state` (for example, the server checks that the checklist ticks and the field are present). The client only reports events.

### 6.3 Ordering, due dates and unlocking

- **Unlocking:** module N+1 unlocks when N completes. The quiz unlocks when all 14 are done. HR can unlock any module early for a person from the tracker drawer.
- **Due dates:**
  - Day 1 modules are due at the end of the joining date, in the hire's local time.
  - Week 1 modules and the quiz are due five working days after joining. Weekends and the location's holidays (from the existing holiday calendar) are skipped.
  - `dueAt` is computed when the course is released and recomputed if the joining date changes.
- **Overdue:** a module is overdue if it isn't completed and `now > dueAt`. Overdue shows in red for both the hire and HR.

### 6.4 Video (YouTube)

- Use the YouTube IFrame Player API with YouTube's own controls hidden and a **custom control bar** on top. The custom bar is needed because the spec wants chapter markers on the progress bar and a no-skip-ahead rule.
  - Play/pause, a scrubber with chapter ticks, a chapter menu, captions on by default, a caption-language picker (English/French/Spanish, from the YouTube tracks) and a Transcript drawer.
- **First viewing:** a seek past the furthest point watched (plus a small tolerance) is snapped back. Rewinding is always allowed. After completion, seeking is free.
- **Reporting:** the client sends the furthest-second watched every ~10s and on pause or end. The server completes the module once the furthest point reaches 95% of the duration.
- **Videos not filmed yet:** while a video ID is missing, the module shows a branded "Video coming soon" card with a short text summary and switches to `SCROLL_END`. Hires are never blocked. Once HR adds the ID, hires who already completed the module are not reset.
- **Quiz links to chapters:** quiz explanations open Module 2 at the chapter's timestamp. Chapter keys are stored with the video config, so the links survive when a new video replaces the old one.

### 6.5 Quiz behaviour (spec section 5)

- **Format:** 12 questions; pass mark 10/12 (driven by the config percentage). Questions and options are shuffled on every attempt. One question per screen, with a progress bar of 12 dots.
- **Results screen:** the score shown in a ring, pass or retry, and every question with its correct answer and an explanation in the value's colour, plus a "Watch this part" chapter link.
- **Retakes:** allowed after a 15-minute wait. After 3 failed attempts, HR gets an email (once per threshold crossing) to arrange a short conversation. Retakes continue to be allowed.
- **On pass:** the values and code-of-conduct acknowledgement, then the completion screen.

### 6.6 Completion

When all 14 modules are done, the quiz is passed and both acknowledgements are signed:
- `User.onboardingCompleted = true` and `NewHire.status = COMPLETED`
- HR and the team lead are emailed
- the lockout lifts

The completion screen shows "WELCOME TO THE Journey", plays a light confetti once, and offers a downloadable certificate (PDF with the logo, name and date). The builder should reuse whichever PDF approach Compass already uses for payslips.

## 7. Screens and UX

The layout follows spec section 6 (screens 1–8, brand tokens, card states). The friendly layer borrows from compliance-training portals:

- **The next step is always obvious.** The Home hero carries a progress ring ("6 of 14", plus the due date) and a single large "Continue" card for the next module. Below it is the module grid grouped by phase: Day 1, Week 1, Final step.
- **Plain statuses everywhere.** Each card shows Locked ("Complete Module {n-1} first"), Start, Continue (with a thin progress bar), Completed {date}, or a red "Overdue" chip. These match the spec's state table.
- **Module page:**
  - a left rail with every module and its status
  - on mobile, a slim progress bar with a "Modules" drop-down instead
  - a blue header band showing "MODULE 03 OF 14"
  - a 720px content column
  - a sticky footer with Back and "Mark complete and continue"
  - the reason the button is disabled is always visible
- **Resume where you left off.** Checklist ticks, the video position, opened links and typed fields persist on the server, so a hire can close the tab and come back.
- **Small, warm moments.** A brief check animation and "Nice, Module 4 done — next up: How We Work" toast on completion. The tone follows the spec copy: second person, short sentences. No emoji; Lucide icons in Plutus Blue at 24px.
- **Accessibility:** WCAG AA throughout, navy text on yellow, sky blue and green, full keyboard support, and every module completable on a phone.
- **Brand tokens:** Plutus Blue #3463EC, Deep Navy #2A2F40, Paper #FCFCFC, Inter + EB Garamond Italic, 16px card radius, value colours as listed in the spec. Excellence red, Collaboration green and Accountability pink are still unconfirmed in the Canva file. Use placeholder tokens and list them as an open item.

During the build, run the design pass with the project's frontend-design / impeccable skills against these tokens.

### HR side

- **Tracker** at `/admin/onboarding`, replacing or extending the current dashboard:
  - columns per spec screen 7, with filters for location, department and status
  - the row drawer shows:
    - module-by-module progress with versions and dates
    - an "Unlock early" control
    - signed acknowledgements with downloads
    - the LinkedIn Verify button
    - quiz attempts with the questions answered wrongly
    - the full HR checklist with tick and miss-reason controls
  - a "Most missed questions" panel
- **New-hire setup:** a section on the existing new-hire detail page.
  - Required-field status ("3 fields missing: …") and the lead-input status.
  - A "Release course" button.
- **Onboarding settings:**
  - editors for module blocks (draft → publish, with a change note and a "Ask everyone to re-read" option)
  - libraries, key contacts, quiz questions, video config and links
  - every editor has a **preview as**: pick a location, work mode, contract type and status, and see the rendered module
- **Assign a module to staff:** from settings, pick a module and one or more existing employees (or "all active").
  - Each person gets a SINGLE_ASSIGNMENT progress row and an email.
  - They see an "Assigned to you" card on their dashboard and can open `/onboarding/[slug]` directly.
  - They are **never locked out**; see D2.

## 8. Notifications and scheduled jobs

All notifications are email, using the existing `lib/email.ts` / `EmailQueue` pattern. Links use `COMPASS_URL`.

| Trigger | To |
|---|---|
| Setup saved | Team lead: please fill/review input (due joining − 7 days); reminder daily once overdue |
| Course released | Hire: welcome + link |
| Joining date | Buddy: "You're {name}'s buddy" |
| Overdue module | Hire at 10:00 local time, daily while anything is overdue; team lead copied from the 2nd overdue day |
| 3rd failed quiz attempt | HR |
| Module 11 completed | OA |
| LinkedIn submitted | HR (to verify) |
| Course complete | HR + team lead |
| Module assigned / re-read requested | Each assignee |
| HR checklist item due/overdue | Item owner (role or lead) |

**Cron.** One endpoint, `/api/cron/onboarding`, does all of the scheduled work. It runs **hourly** and sends local-10-AM reminders to people whose location's local hour is 10. It is idempotent per person per day.

If the Vercel plan doesn't allow hourly crons, fall back to one run per time zone or a daily batch at 05:00 UTC (10:00 PKT), and record that in this document. Authentication uses the existing `lib/cron-auth.ts`.

## 9. Access and lockout

- **Lockout rule:** a user with `onboardingCompleted = false` can only reach:
  - `/onboarding/**`
  - `/profile`
  - the Company Dashboard pages (`/handbook/**`, read-only). Module 14 has to open it. *(Builder's call: Company Dashboard = the Compass handbook.)*
  - the APIs those pages need
- **Server-side enforcement:** add it to the existing client redirect, in `middleware.ts` or the API auth helpers, whichever the session model allows.
- **Module 9's "Go to Leave in Compass" button** shows as "Available after onboarding" for locked hires. Leave isn't needed in week one. *(Builder's call.)*
- **Bank details (PK employment)** are written to the payroll profile. Only HR, OA and the hire can read them; the hire sees them masked after submission.
  - Add `branch` and `iban` to `PayrollEmployeeProfile`. `bankName` and `accountTitle` already exist.
  - If a PK-employment hire has no payroll profile yet, the details are held until HR/OA creates the profile. Module 11 never creates a payroll profile itself, so nobody is pulled into payroll runs by accident.
- **Contractor payout details** follow §5.9: separate from payroll, read-only for HR and OA.
- **Permissions:**
  - **Onboarding settings and the tracker:** HR only.
  - **Tracker read access:** OA can read the payment-related columns.
  - **Lead input:** the assigned team lead or HR.
  - **Security checklist:** HR or Security (unchanged).

## 10. Feature flag and cutover

`ONBOARDING_ACADEMY_ENABLED` (env).
- **Off:** today's onboarding behaves exactly as it does now.
- **On:** the new course, tracker and settings replace it.

The flag is server-read and exposed to the layout the same way `SECURITY_CHECKS_ENABLED` is.

**Cutover (D11).** Before the server-side lockout goes live, a script marks every user with `onboardingCompleted = false` as complete. These are test accounts from March–April 2026. The script prints the names it changes, and it is run once, deliberately, not on every build.

**Seeding.** A seed script, safe to re-run and checked into `prisma/`, does the following:
- retires the old 11 modules and the old quiz questions
- creates the 14 modules with version 1 content taken from the spec copy
- creates the 12 quiz questions with explanations
- seeds the library cards from the spec matrix and the key-contact groups (empty)
- seeds the HR checklist template once section 8 arrives

## 11. Testing

The test-first workflow follows the repo rules.
- **Unit tests:**
  - due-date calculation (weekends, holidays, time zones)
  - eligibility filtering
  - placeholder rendering
  - block Zod schemas
  - completion-rule validation
  - unlock and version logic
  - quiz grading, shuffle, cooldown and the threshold alert
  - checklist auto-ticks
- **Integration tests** against the local test DB (as the weekly-evaluation suite does): setup → release → progress → quiz → completion, single-module assignment for an existing employee (no lockout), re-read reopening with history kept, and bank-field access control.
- **E2E (Playwright):** a hire completing a Day-1 module on desktop and on a mobile viewport; HR releasing a course from the tracker.

## 12. Stages

Each stage is a PR behind the flag.

1. **Foundation:**
   - schema migrations
   - setup fields on the new-hire page
   - lead-input extension
   - profile fields, the four content-adapting attributes, and the HR backfill view in Admin › Users
   - `ContractorPayoutDetails` model and its access rules
   - libraries and settings data (basic editors)
   - seed script
2. **Course:**
   - Home, module page, block renderer
   - completion rules and unlocking, due dates
   - server-side lockout
   - Modules 3–14 working (1–2 on the "video coming soon" fallback)
3. **Quiz and acknowledgements:** the quiz flow, the results screen, both acknowledgements, the completion screen and the certificate.
4. **HR operations:**
   - tracker and drawer
   - checklist (needs section 8)
   - the cron and all notifications
   - re-read, single-module assignment and unlock-early
5. **Video and polish:**
   - YouTube player with chapters and the no-skip rule
   - transcript
   - settings preview-as
   - most-missed report
   - the design polish pass

## 13. Open items

| Item | Owner |
|---|---|
| Spec section 8: the HR onboarding checklist (items, owners, deadlines, which ones auto-tick) | User/HR, needed before stage 4 |
| YouTube IDs, chapter timestamps and transcripts for Videos 1 and 2 | HR, after filming |
| Links with no handbook page yet: Discord Training Manual, Discord training video, incident inquiry form, Cyber Security SOP, health-insurance presentation and claim kit, invoice templates per team | HR, entered in settings (not blocking) |
| Value colours | **Settled.** The spec's four hex codes are Canva's default palette, so the other three use the same palette: Innovation #FFBD59, Integrity #CB6CE6, Excellence #FF5757, Client-centric #38B6FF, Collaboration #7ED957, Accountability #FF66C4, Speed #FF914D. They are used only as fills and strips. Text on or beside them is Deep Navy, or white on a navy panel, never coloured text on white, so everything stays WCAG AA. |
| Account-opening-letter template text. Until it is entered, Module 11 says "HR will share your bank letter" instead of showing a download. | HR (not blocking) |
| "HR to confirm" benefit cells for other locations | HR |

## 14. Calls made by the designer (not decided by the user)

- The Academy's benefits and reimbursements live in a **new library table**, not in the existing `Benefit` table, so today's benefit data stays untouched.
- Old modules and quiz questions are **retired, not deleted**. The 4 existing NewHire rows are left alone.
- Company Dashboard means the Compass handbook (`/handbook`), and locked hires can read it.
- The Leave button in Module 9 is disabled until onboarding is complete.
- The LinkedIn module completes on submission. HR's Verify step ticks the checklist but doesn't block the hire.
- A missing video falls back to a text summary with scroll-to-complete.
- A Day 1 goal is included as an optional field.
- Quiz retakes are never capped. After 3 failed attempts, HR is told.
- There is one hourly cron, with a documented fallback if the plan disallows it.
- **No new invite flow.** HR keeps creating the account in Admin › Users and linking it to the NewHire, as today. "Release course" is blocked until a user is linked, and the setup page lists "No Compass account linked" among the missing items. Contract type and joining date are copied into payroll at link time.
- **Holidays for due dates.** Use the hire's `teamTag` holidays (`PayrollPublicHoliday`) when a tag is set. Otherwise map the location: Karachi → PAKISTAN, Casablanca → MOROCCO, Bogotá → COLOMBIA. Dallas and unmapped remote countries skip holidays and count weekends only.
