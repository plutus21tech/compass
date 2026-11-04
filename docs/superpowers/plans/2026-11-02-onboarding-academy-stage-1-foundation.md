# Onboarding Academy — Stage 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the data and admin foundation for the Onboarding Academy:
- the full schema
- the person attributes that adapt content
- the new-hire setup and its readiness check
- the team lead input
- contractor payout storage
- the benefits/reimbursements library, key contacts and links
- the seed and cutover scripts

No hire-facing course screens are in this stage.

**Architecture:** A new `lib/academy/` module, laid out like `lib/security-checks/`:
- pure, unit-tested rules at the top level
- DB access in `lib/academy/service/*`
- thin route handlers in `app/api/onboarding/**` and `app/api/admin/onboarding/**`

Everything new is gated by `ONBOARDING_ACADEMY_ENABLED`. With the flag off, Compass behaves exactly as today.

**Tech Stack:** Next.js App Router, Prisma 5 / Postgres (Neon), TypeScript, Zod 4, `node --test` with tsx, existing `lib/email.ts`.

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md`. Read §3, §5, §9, §10 and §12 before starting.

## Global Constraints

- **Additive migrations only.** No dropped or renamed columns. Every new column is nullable or has a default, so the migration is safe on prod. Vercel runs `prisma migrate deploy` on build.
- **Never use the root `.env` for migrations, tests or scripts.** It points at the shared **production** database. Generate migrations and run integration tests against the local `compass_weekly_test` database only, using the URL `npm run test:weekly-db` uses.
- **`BenefitCategory` / `Benefit` rows and code are untouched** (D3).
- **Contractors never get a `PayrollEmployeeProfile`.** No code in this stage creates a payroll profile (D4a, §9).
- **Bank and payout details:** only HR and OA can read them, masked by default. Every reveal is logged. The owner can read their own.
- **Content-adapting attributes:** only HR edits them. Employees see them read-only.
- **Feature flag:** `ONBOARDING_ACADEMY_ENABLED === 'true'` enables new routes and nav. With it off, new routes return 404 and the UI shows nothing new.
- **Test data:** fictional people only; the repo is public.
- **Plan decision:** library-card eligibility filters on **country** (derived from location), not on office location. Mapping: KARACHI→PK, CASABLANCA→MA, BOGOTA→CO, DALLAS→US, REMOTE→`remoteCountry` (ISO-3166 alpha-2). This matches the spec's benefits matrix, which is laid out by country.
- **Plan decision:** the Karachi commute rate table is read from the existing `PayrollTravelAllowanceTier` rows (stage 2 renders them). No new settings table.

## Review Focus

1. **HR edits a hire's attribute after the account is linked.** The change must land on `User`, the source of truth after linking, and not on a stale `NewHire` column. Pinned in Task 5.
2. **An employee with any attribute missing**, including `REMOTE` without `remoteCountry`, must see only universal cards and never group-restricted ones. Pinned in Task 3.
3. **Saving contractor payout details** must never create or modify a `PayrollEmployeeProfile`. Pinned in Task 6.
4. **Re-running the seed** must be idempotent, must not change `Benefit`/`BenefitCategory` counts, and must not collide on the unique `orderIndex` with retired modules. Pinned in Task 8.
5. **A link configured as `javascript:…` or `http://…`** must be rejected on save and never rendered. Pinned in Task 7.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/<ts>_onboarding_academy_foundation/` | All §5 schema, in one migration |
| `lib/academy/flag.ts` | `isAcademyEnabled()` |
| `lib/academy/attributes.ts` | Attribute enums and lists, Zod schema, `countryOf`, `missingAttributes`, `prefillFromTeamTag` |
| `lib/academy/eligibility.ts` | `isCardEligible` |
| `lib/academy/setup.ts` | Setup Zod schema, `leadInputDueAt`, `getSetupReadiness` |
| `lib/academy/links.ts` | Link value schema, `resolveAcademyLink`, `ACADEMY_LINK_KEYS` |
| `lib/academy/payout.ts` | Payout Zod schema per method, `maskPayout`, `canReadPayoutDetails` |
| `lib/academy/http.ts` | `requireAcademySession`, `academyErrorResponse`, `AcademyError` |
| `lib/academy/service/attributes.ts` | Read/write person attributes; copy setup→User at link |
| `lib/academy/service/setup.ts` | Save setup, team members, readiness, lead input |
| `lib/academy/service/payout.ts` | Save/read/reveal contractor payout |
| `lib/academy/service/library.ts` | Library cards, key contacts, config links CRUD |
| `lib/payroll/sensitive-fields.ts` | Generalised encrypt/decrypt; add `iban`, `branch` |
| `prisma/seed-academy.ts` | Re-runnable seed (§10) |
| `scripts/academy-cutover-complete-test-users.ts` | One-off D11 script, dry-run by default |
| `tests/helpers/academy-test-db.ts` | DB guard and fixtures (reuses `isWeeklyTestDatabase`) |

---

### Task 1: Schema, migration and flag

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_onboarding_academy_foundation/migration.sql` (generated)
- Create: `lib/academy/flag.ts`
- Test: `tests/academy-flag.test.ts`

**Interfaces:**
- Produces: every Prisma model and enum below; `isAcademyEnabled(env?: Record<string, string | undefined>): boolean`.

- [ ] **Step 1: Write the failing test.** `tests/academy-flag.test.ts`: `isAcademyEnabled({ ONBOARDING_ACADEMY_ENABLED: 'true' }) === true`; `'false'`, `'1'` and `undefined` all give `false`. Mirror `lib/security-checks/flag.ts`.
- [ ] **Step 2: Run it.** `node --import tsx --test tests/academy-flag.test.ts` should FAIL (module not found).
- [ ] **Step 3: Implement `lib/academy/flag.ts`.**
- [ ] **Step 4: Run it.** The test should PASS.
- [ ] **Step 5: Add the schema.**

  **Enums:**
  - `OfficeLocation` (KARACHI, CASABLANCA, BOGOTA, DALLAS, REMOTE)
  - `WorkMode` (OFFICE, HYBRID, REMOTE)
  - `ContractType` (PK_EMPLOYMENT, INDEPENDENT_CONTRACTOR, OTHER_EMPLOYMENT)
  - `EmploymentStatus` (PERMANENT, FIXED_TERM, INTERN)
  - `CompanyWing` (CAPITAL, PARTNERS)
  - `OnboardingPhase` (DAY_1, WEEK_1)
  - `OnboardingCompletionRule` (VIDEO_95, SCROLL_END, BUDDY_HELLO, ALL_LINKS_OPENED, CHECKLIST_AND_FIELD, CHECKLIST_AND_ACK, FIELD_SUBMITTED, PAYMENT_SETUP, LINK_OPENED)
  - `OnboardingProgressSource` (COURSE, SINGLE_ASSIGNMENT, REREAD)
  - `AcknowledgementKind` (SECURITY_SOPS, VALUES_CODE_OF_CONDUCT)
  - `LibraryCardKind` (BENEFIT, REIMBURSEMENT)
  - `KeyContactGroup` (HR, SECURITY_IT, ACCOUNTS, EXECUTION)
  - `ChecklistOwnerRole` (HR, SECURITY, OA, TEAM_LEAD)
  - `PayoutMethod` (WISE, BANK_TRANSFER, PAYONEER, OTHER)

  **Columns on existing models** (all nullable unless a default is given):
  - `User`: `discordUsername`, `linkedinUrl`, `officeLocation`, `remoteCountry` (String, 2 chars), `workMode`, `contractType`, `employmentStatus`
  - `NewHire`: `preferredName`, `companyWing`, `clientAccount`, `officeLocation`, `remoteCountry`, `workMode`, `contractType`, `employmentStatus`, `hrCallAt`, `teamCallAt`, `coreHoursStart`, `coreHoursEnd` (String "HH:mm"), `academyReleasedAt`
  - `TeamLeadForm`: `roleExpectations`, `day1Goal`, `week1Goal`, `month1Goal`, `month3Goal`, `tutorials Json?`, `teamTools Json?`, `leadInputDueAt`. The lead's submit uses the existing `submittedAt`.
  - `OnboardingModule`: `phase`, `estimatedMinutes Int?`, `headlineLead`, `headlineAccent`, `icon`, `completionRule`, `currentVersionId`, `heroImageUrl`
  - `OnboardingProgress`: `versionId`, `dueAt`, `source OnboardingProgressSource @default(COURSE)`, `assignedById`, `unlockedEarlyById`, `state Json?`
  - `OnboardingQuizQuestion`: `explanation`, `valueKey`, `videoChapterKey`, `retiredAt`
  - `OnboardingConfig`:
    - `links Json @default("{}")`
    - `invoiceTemplates Json @default("{}")`
    - `bankLetterTemplate String?`
    - `retakeCooldownMinutes Int @default(15)`
    - `failAlertThreshold Int @default(3)`
    - `blockersCallCt String @default("WED 07:00")`
    - `videos Json @default("{}")`
  - `PayrollEmployeeProfile`: `branch`, `iban`

  **New models:**
  - `NewHireTeamMember` (newHireId, userId, `@@unique([newHireId, userId])`, cascade on NewHire)
  - `OnboardingModuleVersion` (moduleId, version Int, blocks Json, publishedAt, publishedById?, changeNote?, `@@unique([moduleId, version])`)
  - `OnboardingProgressHistory` (userId, moduleId, versionId?, completedAt, createdAt)
  - `OnboardingAcknowledgement` (userId, kind, statementText, moduleVersionId?, typedName, signedAt, `@@index([userId, kind])`)
  - `OnboardingLibraryCard` (kind, title, icon, body, links Json @default("[]"), countries String[], workModes WorkMode[], contractTypes ContractType[], employmentStatuses EmploymentStatus[], orderIndex, isActive @default(true), timestamps, `@@index([kind, isActive, orderIndex])`)
  - `OnboardingKeyContact` (group, userId?, label?, email?, orderIndex, timestamps)
  - `OnboardingChecklistTemplateItem` (`key` unique, `autoTickEvent String?`) and `OnboardingChecklistItem`, fields per spec §5.8, `@@unique([newHireId, templateItemId])`
  - `ContractorPayoutDetails` (userId @unique, method, accountHolderName, payoutEmail?, bankName?, accountNumberOrIban?, swiftBic?, bankCountry?, bankAddress?, instructions?, currency, submittedAt, updatedAt)
  - `ContractorPayoutRevealLog` (payoutUserId, viewerId, createdAt, `@@index([payoutUserId, createdAt])`)

  Add back-relations on `User` only where a relation is declared.
- [ ] **Step 6: Generate the migration against the local test DB only.**
  - Run: `DATABASE_URL="<local compass_weekly_test URL>" npx prisma migrate dev --name onboarding_academy_foundation`
  - Expected: a migration is created and applied, and the client is generated.
- [ ] **Step 7: Check the SQL is additive.**
  - Run: `grep -E -i "DROP|RENAME|ALTER COLUMN .* (SET NOT NULL|TYPE)" prisma/migrations/*_onboarding_academy_foundation/migration.sql`
  - Expected: no output.
- [ ] **Step 8: Typecheck and run the suite.**
  - Run: `npx tsc --noEmit && npm test`
  - Expected: both pass.
- [ ] **Step 9: Commit.**
  - `git add prisma lib/academy/flag.ts tests/academy-flag.test.ts`
  - `git commit -m "feat(academy): add onboarding academy schema and flag"`

### Task 2: Generalise field encryption

**Files:**
- Modify: `lib/payroll/sensitive-fields.ts`
- Test: `tests/payroll-sensitive-fields.test.ts` (create, or extend if it exists)

**Interfaces:**
- Produces:
  - `encryptSensitiveValue(label: string, value: string | null | undefined): string | null`
  - `decryptSensitiveValue(label: string, value: string | null | undefined): string | null`
  - the existing payroll exports are unchanged in behaviour
  - `iban` and `branch` are added to `SENSITIVE_PAYROLL_PROFILE_FIELDS`

- [ ] **Step 1: Write the failing tests.** With a 64-hex test key in `env`:
  - **Round trip:** `decryptSensitiveValue('contractorPayout.accountNumberOrIban', encryptSensitiveValue('contractorPayout.accountNumberOrIban', 'GB33BUKB20201555555555'))` returns the original.
  - **Label binding:** decrypting with a different label throws.
  - **Backward compatibility:** a value produced by `encryptPayrollField('accountNumber', 'x')` decrypts with `decryptSensitiveValue('accountNumber', …)`.
  - **New payroll fields:** `encryptSensitivePayrollProfileFields({ iban: 'PK36SCBL0000001123456702' }).iban` starts with `p21enc:v1:`.
- [ ] **Step 2: Run it.** `node --import tsx --test tests/payroll-sensitive-fields.test.ts` should FAIL.
- [ ] **Step 3: Implement.** Move the cipher logic into the two label-based functions. The AAD is the label, so existing payroll ciphertexts, whose AAD is the field name, stay valid. The payroll functions call through to them.
- [ ] **Step 4: Run it.** It should PASS, and so should `npm test`.
- [ ] **Step 5: Commit.** `git commit -m "refactor(payroll): label-based sensitive field encryption; encrypt iban and branch"`

### Task 3: Person attributes and eligibility (pure rules)

**Files:**
- Create: `lib/academy/attributes.ts`
- Create: `lib/academy/eligibility.ts`
- Test: `tests/academy-attributes.test.ts`
- Test: `tests/academy-eligibility.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PersonAttributes {
    officeLocation: OfficeLocation | null; remoteCountry: string | null
    workMode: WorkMode | null; contractType: ContractType | null; employmentStatus: EmploymentStatus | null
  }
  export const personAttributesSchema: z.ZodType<PersonAttributes> // remoteCountry required iff REMOTE, /^[A-Z]{2}$/
  export function countryOf(a: Pick<PersonAttributes, 'officeLocation' | 'remoteCountry'>): string | null
  export function missingAttributes(a: PersonAttributes): Array<keyof PersonAttributes>
  export function prefillFromTeamTag(teamTag: TeamTag | null, payrollEmploymentTypeName: string | null): Partial<PersonAttributes>
  export interface EligibilityRules { countries: string[]; workModes: WorkMode[]; contractTypes: ContractType[]; employmentStatuses: EmploymentStatus[] }
  export function isCardEligible(card: EligibilityRules, person: PersonAttributes): boolean
  ```

- [ ] **Step 1: Write the failing tests.**
  - **`countryOf`:** KARACHI→'PK', CASABLANCA→'MA', BOGOTA→'CO', DALLAS→'US', REMOTE+'ID'→'ID', REMOTE+null→null, null→null.
  - **`missingAttributes`:**
    - all set gives `[]`
    - `{officeLocation:'REMOTE', remoteCountry:null, …}` includes `'remoteCountry'`
    - all null lists all five except `remoteCountry` (which is only required for REMOTE)
  - **`personAttributesSchema`:**
    - rejects REMOTE without `remoteCountry`
    - rejects `remoteCountry: 'pak'`
    - strips `remoteCountry` when the location isn't REMOTE
  - **`prefillFromTeamTag`:**
    - PAKISTAN→`{officeLocation:'KARACHI'}`, MOROCCO→CASABLANCA, COLOMBIA→BOGOTA
    - NOBLE and THREE_E_* → `{}`
    - a payroll name matching `/contract/i` → `contractType: 'INDEPENDENT_CONTRACTOR'`
    - a name matching `/permanent|employ/i` → `PK_EMPLOYMENT`, but only when the tag is PAKISTAN
  - **`isCardEligible`:**
    - all-empty rules are eligible for a person with every attribute null
    - `{countries:['PK'], workModes:['OFFICE','HYBRID']}` is eligible for KARACHI/OFFICE and not for KARACHI/REMOTE or CASABLANCA/OFFICE
    - `{employmentStatuses:['PERMANENT']}` is not eligible for INTERN
    - **Review Focus 2:** any card with a non-empty rule is **not** eligible when the person has any missing attribute, including REMOTE with a null `remoteCountry`
- [ ] **Step 2: Run them.** `node --import tsx --test tests/academy-attributes.test.ts tests/academy-eligibility.test.ts` should FAIL.
- [ ] **Step 3: Implement both files.** Import the enum types from `@prisma/client`. Export the value lists (`OFFICE_LOCATIONS`, etc.) as `as const` arrays for the Zod schemas and UI.
- [ ] **Step 4: Run them.** They should PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(academy): person attribute and eligibility rules"`

### Task 4: Attributes on profiles: service, admin API, Users page, profile page

**Files:**
- Create: `lib/academy/http.ts`
- Create: `lib/academy/service/attributes.ts`
- Create: `tests/helpers/academy-test-db.ts`
- Modify: `app/api/admin/users/route.ts`
  - PUT: accept the attributes and save them through the service; HR only
  - GET: include the attributes and `missingAttributes`
- Modify: `app/api/users/me/route.ts`
  - accept `discordUsername` and `linkedinUrl` (LinkedIn must be `https://(www.)linkedin.com/…`)
  - reject the attribute keys with 403
- Modify: `app/(hr)/admin/users/page.tsx`
  - an "Onboarding attributes" fieldset in the edit dialog, prefilled via `prefillFromTeamTag` when empty
  - a "Missing attributes" filter chip
  - the edit fieldset goes in a new component, `app/(hr)/admin/users/_components/AttributeFields.tsx`; the page is already 1,257 lines
- Modify: `app/(evaluator)/profile/page.tsx`
  - Discord username and LinkedIn as editable fields
  - the four attributes as read-only
- Modify: `package.json`
  - add `"test:academy-db": "node --import tsx --test --test-concurrency=1 tests/academy-*.integration.test.ts"`
- Test: `tests/academy-attributes.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `personAttributesSchema`, `missingAttributes`.
- Produces:
  ```ts
  // lib/academy/http.ts
  export class AcademyError extends Error { constructor(message: string, readonly status: number) }
  export async function requireAcademySession(): Promise<SafeUser> // 404 when flag off, 401 no session
  export function academyErrorResponse(error: unknown): NextResponse // AcademyError→status, ZodError→400, else 500 + console.error
  // lib/academy/service/attributes.ts
  export async function getPersonAttributes(db: PrismaClient | Prisma.TransactionClient, userId: string): Promise<PersonAttributes>
  export async function setPersonAttributes(db: PrismaClient | Prisma.TransactionClient, userId: string, input: unknown): Promise<PersonAttributes>
  export async function copySetupToUser(tx: Prisma.TransactionClient, newHireId: string, userId: string): Promise<void>
  // tests/helpers/academy-test-db.ts
  export const ACADEMY_DB_TEST: { skip: string | false } // same guard as WEEKLY_DB_TEST
  export async function resetAcademyFixtures(db: PrismaClient): Promise<void> // deletes only rows with ids prefixed 'act-'
  export const P: Record<'hr' | 'oa' | 'lead' | 'buddy' | 'staff' | 'hire', { id: string; name: string; role: UserRole; email: string }>
  ```

- [ ] **Step 1: Write the failing integration tests** (skipped unless `ACADEMY_DB_TEST` is set):
  - **`setPersonAttributes`:** saves valid input, and throws a ZodError for REMOTE without a country.
  - **`copySetupToUser`:** copies the attributes from a NewHire onto the user and copies `onboardingDate` into an **existing** payroll profile's empty `joiningDate`. When the user has no payroll profile, `prisma.payrollEmployeeProfile.count({ where: { userId } })` stays 0.
- [ ] **Step 2: Run them.**
  - Run: `WEEKLY_DB_TEST=true DATABASE_URL="<local test URL>" npm run test:academy-db`
  - Expected: FAIL.
- [ ] **Step 3: Implement** the service and `http.ts`.
- [ ] **Step 4: Wire the link step.**
  - In the `POST` transaction in `app/api/admin/users/route.ts`, after `newHire.update`, call `copySetupToUser(tx, linkedNewHire.id, createdUser.id)`, but only when `isAcademyEnabled()`.
  - Leave the existing old-module progress initialisation exactly as it is when the flag is off.
- [ ] **Step 5: Wire PUT/GET** in the admin users route, `/api/users/me`, and the two pages.
- [ ] **Step 6: Run the tests.** `npm run test:academy-db` with the local URL, plus `npm test` and `npx tsc --noEmit`, should all PASS.
- [ ] **Step 7: Check by hand.**
  - Run `npm run dev` with the local DB and `ONBOARDING_ACADEMY_ENABLED=true`.
  - Edit a user's attributes as HR and check the filter chip.
  - As an employee, check the fields are read-only on the profile page.
- [ ] **Step 8: Commit.** `git commit -m "feat(academy): person attributes on profiles with HR backfill"`

### Task 5: New-hire setup, readiness and team lead input

**Files:**
- Create: `lib/academy/setup.ts`
- Create: `lib/academy/service/setup.ts`
- Create: `app/api/admin/onboarding/new-hires/[id]/setup/route.ts` (GET readiness + setup, PUT setup)
- Modify: `app/api/onboarding/team-lead-form/[newHireId]/route.ts` (accept the lead-input fields)
- Modify: `app/(evaluator)/team-lead-form/[newHireId]/page.tsx` (add the fields)
- Modify: `app/(hr)/admin/onboarding/new-hires/[id]/page.tsx`
  - render a new `_components/OnboardingSetupSection.tsx`, only when the flag is on
- Modify: `lib/email.ts`
  - add `sendLeadInputRequest(newHireId: string): Promise<void>`, sent on the first setup save and whenever the team lead changes
  - follow `sendTeamLeadFormRequestNotification`; links use `COMPASS_URL`
- Test: `tests/academy-setup.test.ts`
- Test: `tests/academy-setup.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 attribute schema; Task 4 `setPersonAttributes`, `copySetupToUser`, `requireAcademySession`.
- Produces:
  ```ts
  export const setupSchema: z.ZodObject<...> // preferredName, title, department, companyWing, clientAccount?, attributes (PersonAttributes),
    // onboardingDate, hrCallAt, teamCallAt, teamLeadId, teamMemberIds: string[], buddyId, coreHoursStart, coreHoursEnd ("HH:mm", start < end)
  export const leadInputSchema: z.ZodObject<...> // roleExpectations (1..10000), day1Goal?, week1Goal, month1Goal, month3Goal (1..1000),
    // tutorials: {title 1..200, url https}[] max 30, teamTools: {name 1..80, purpose 1..200, url? https}[] max 30
  export function leadInputDueAt(joiningDate: Date): Date // joiningDate − 7 calendar days
  export type MissingItem = { key: string; label: string }
  export function getSetupReadiness(input: SetupSnapshot): { ready: boolean; missing: MissingItem[] }
  // service
  export async function saveSetup(db: PrismaClient, newHireId: string, input: unknown, actorId: string): Promise<void>
  export async function loadSetup(db: PrismaClient, newHireId: string): Promise<{ setup: SetupSnapshot; readiness: ReturnType<typeof getSetupReadiness> }>
  ```
  `SetupSnapshot` is defined in `lib/academy/setup.ts`. It holds the setup fields plus `userLinked: boolean` and `leadInputSubmitted: boolean`. When a user is linked, its attributes are read from `User`; otherwise from `NewHire`.

- [ ] **Step 1: Write the failing unit tests** in `tests/academy-setup.test.ts`.
  - `leadInputDueAt(new Date('2026-11-16'))` returns 2026-11-09.
  - **`getSetupReadiness`:**
    - a full snapshot gives `{ready:true, missing:[]}`
    - each missing required field appears with a human label, e.g. `{key:'buddyId', label:'Onboarding buddy'}`
    - `userLinked:false` adds `{key:'account', label:'No Compass account linked'}`
    - `leadInputSubmitted:false` adds `{key:'leadInput', label:'Team lead input (role expectations, goals)'}`
    - an empty `teamMemberIds` is missing ('Team members')
  - **`setupSchema`:**
    - rejects `coreHoursStart '18:00'` with end `'09:00'`
    - rejects the buddy equal to the hire's own user id when one is passed
  - **`leadInputSchema`:** rejects a tutorial URL `javascript:alert(1)`.
- [ ] **Step 2: Run it.** It should FAIL.
- [ ] **Step 3: Implement `lib/academy/setup.ts`.** The tests should PASS.
- [ ] **Step 4: Write the failing integration tests.**
  - **Before linking:** `saveSetup` writes the NewHire columns, replaces the team members (re-saving with a different list leaves exactly the new list), and sets `TeamLeadForm.leadInputDueAt`.
  - **After linking:** `saveSetup` writes the attributes to `User`, and `User.workMode` reflects the new value (Review Focus 1).
  - **Readiness:** `loadSetup` returns the readiness.
- [ ] **Step 5: Implement the service and the routes.**
  - **Setup route:** HR only, via `canManageOnboarding`.
  - **Team-lead route:** the assigned lead or HR, keeping the existing check.
  - **Lead submit:** sets `submittedAt`.
- [ ] **Step 6: Build the UI.** `OnboardingSetupSection` is a form with these parts:
  - **Readiness:** a "N items missing" banner that lists the labels.
  - **Pickers:** the existing user picker pattern for lead, buddy and team members.
  - **Course release:** a disabled "Release course" button with the tooltip "Available in a later release". Release itself is built in stage 2.
- [ ] **Step 7: Run the tests.** `npm test`, `npm run test:academy-db` (local URL) and `npx tsc --noEmit` should all PASS.
- [ ] **Step 8: Commit.** `git commit -m "feat(academy): new-hire setup, readiness and team lead input"`

### Task 6: Contractor payout details

**Files:**
- Create: `lib/academy/payout.ts`
- Create: `lib/academy/service/payout.ts`
- Create: `app/api/onboarding/payout/route.ts` (GET own, PUT own)
- Create: `app/api/admin/onboarding/payout/[userId]/route.ts` (GET masked)
- Create: `app/api/admin/onboarding/payout/[userId]/reveal/route.ts` (POST returns unmasked and logs)
- Modify: `lib/permissions.ts`
- Test: `tests/academy-payout.test.ts`
- Test: `tests/academy-payout.integration.test.ts`

**Interfaces:**
- Consumes: Task 2 `encryptSensitiveValue` / `decryptSensitiveValue` (labels `contractorPayout.<field>`); Task 4 `requireAcademySession`.
- Produces:
  ```ts
  export const payoutSchema: z.ZodDiscriminatedUnion<'method', ...>
    // WISE|PAYONEER: accountHolderName, payoutEmail (email), currency (/^[A-Z]{3}$/)
    // BANK_TRANSFER: accountHolderName, bankName, accountNumberOrIban (5..64), swiftBic (/^[A-Z0-9]{8}([A-Z0-9]{3})?$/), bankCountry (/^[A-Z]{2}$/), bankAddress?, currency
    // OTHER: accountHolderName, instructions (5..2000), currency
  export type PayoutView = { method: PayoutMethod; accountHolderName: string; currency: string; fields: Record<string, string | null>; submittedAt: string }
  export function maskPayout(view: PayoutView): PayoutView // keep last 4 chars of accountNumberOrIban; email → first char + *** + @domain; instructions → '••••'
  export function canReadPayoutDetails(role: string | null | undefined): boolean // HR | OA
  // service
  export async function savePayout(db: PrismaClient, userId: string, input: unknown): Promise<void> // encrypts, upserts; refuses when user.contractType === 'PK_EMPLOYMENT' (400)
  export async function readPayout(db: PrismaClient, userId: string, opts: { reveal: boolean; viewerId: string }): Promise<PayoutView | null> // reveal writes ContractorPayoutRevealLog
  ```

- [ ] **Step 1: Write the failing unit tests.**
  - **Schema:** BANK_TRANSFER without `swiftBic` fails; WISE with an invalid email fails.
  - **Masking:** `maskPayout` turns `accountNumberOrIban 'GB33BUKB20201555555555'` into `'••••5555'` and `payoutEmail 'sam@example.com'` into `'s***@example.com'`.
  - **Permissions:** `canReadPayoutDetails` is true for HR and OA, and false for EMPLOYEE, SECURITY and EXECUTION.
- [ ] **Step 2: Run it.** It should FAIL. Then implement `lib/academy/payout.ts` and the permission, and run it to PASS.
- [ ] **Step 3: Write the failing integration tests.**
  - **Encryption at rest:** after `savePayout`, the stored row's `accountNumberOrIban` starts with `p21enc:v1:`.
  - **No payroll profile (Review Focus 3):** the `payrollEmployeeProfile` count for that user is unchanged and still 0.
  - **Masked read:** `readPayout` with `reveal:false` is masked and writes no log.
  - **Revealed read:** `reveal:true` is unmasked and writes exactly one `ContractorPayoutRevealLog`.
  - **PK employment refused:** `savePayout` for a PK_EMPLOYMENT user throws an `AcademyError` with status 400.
- [ ] **Step 4: Implement the service and the routes.**
  - **Owner routes:** the session user only.
  - **Admin routes:** `canReadPayoutDetails`; anyone else gets 403.
  - **Mutations:** guard the PUT and POST with the existing same-origin check (`assertSameOrigin` from `lib/security/same-origin`) and the `checkRateLimit` key `academy:${userId}`.
  - **Notification:** on any update after the first submission, email OA through `lib/email.ts` ("Payout details updated for {name}"). No details go in the email.
- [ ] **Step 5: Run the tests.** All suites and `tsc` should PASS.
- [ ] **Step 6: Commit.** `git commit -m "feat(academy): contractor payout details outside payroll"`

### Task 7: Library, key contacts and links (data, API, settings pages)

**Files:**
- Create: `lib/academy/links.ts`
- Create: `lib/academy/service/library.ts`
- Create: `app/api/admin/onboarding/library/route.ts` (GET by kind, POST)
- Create: `app/api/admin/onboarding/library/[id]/route.ts` (PUT, DELETE = soft `isActive=false`)
- Create: `app/api/admin/onboarding/key-contacts/route.ts` (GET, PUT replaces the whole ordered list)
- Create: `app/api/admin/onboarding/academy-config/route.ts` (GET, PUT links, invoiceTemplates, bankLetterTemplate, blockersCallCt, retakeCooldownMinutes, failAlertThreshold)
- Create pages under `app/(hr)/admin/onboarding/academy/`:
  - `library/page.tsx` (two tabs: Benefits, Reimbursements)
  - `contacts/page.tsx`
  - `links/page.tsx`: the link fields, an invoice template URL per department (https only), the bank letter template textarea, the Blockers Call time and the two quiz numbers
- Modify: `components/layout/AppSidebar.tsx`
  - add "Academy library", "Key contacts" and "Links & settings" under the Onboarding group, shown only when the flag is on
  - expose the flag to the layout the same way security checks does
- Test: `tests/academy-links.test.ts`
- Test: `tests/academy-library.integration.test.ts`

**Interfaces:**
- Consumes: Task 3 `EligibilityRules`, `isCardEligible`, `PersonAttributes`; Task 4 `requireAcademySession`.
- Produces:
  ```ts
  export const ACADEMY_LINK_KEYS = ['COMPANY_DASHBOARD','TRAVEL_POLICY','EQUIPMENT_POLICY','FAULTY_EQUIPMENT_SOP','DISCORD_CHANNELS_GUIDE','LEAVE_POLICY','CORE_HOURS_POLICY','ZERO_TOLERANCE_POLICY','PRINCIPLES_OF_CONDUCT','DISCORD_TRAINING_MANUAL','DISCORD_TRAINING_VIDEO','INCIDENT_FORM','CYBER_SECURITY_SOP','HEALTH_INSURANCE_PRESENTATION','HEALTH_CLAIM_KIT'] as const
  export type AcademyLink = { kind: 'handbook'; slug: string } | { kind: 'url'; url: string }
  export const academyLinkSchema: z.ZodType<AcademyLink> // slug /^[a-z0-9-]*$/ (empty = dashboard root); url must parse and be https:
  export function resolveAcademyLink(link: AcademyLink | null | undefined): string | null // handbook → `/handbook` or `/handbook/${slug}`
  export const libraryCardSchema: z.ZodObject<...> // kind, title 1..120, icon (Lucide name /^[A-Z][A-Za-z0-9]+$/), body 1..5000, links: {label, link: AcademyLink}[] max 5, + EligibilityRules (countries /^[A-Z]{2}$/)
  export interface AcademyConfigView { links: Partial<Record<(typeof ACADEMY_LINK_KEYS)[number], AcademyLink>>; invoiceTemplates: Record<string, string>; bankLetterTemplate: string | null; blockersCallCt: string; retakeCooldownMinutes: number; failAlertThreshold: number }
  // service
  export async function listLibraryCards(db: PrismaClient, kind: LibraryCardKind, opts?: { includeInactive?: boolean }): Promise<OnboardingLibraryCard[]>
  export async function eligibleCards(db: PrismaClient, kind: LibraryCardKind, person: PersonAttributes): Promise<OnboardingLibraryCard[]>
  export async function saveKeyContacts(db: PrismaClient, contacts: unknown): Promise<void>
  export async function getAcademyConfig(db: PrismaClient): Promise<AcademyConfigView>
  export async function updateAcademyConfig(db: PrismaClient, input: unknown): Promise<AcademyConfigView>
  ```

- [ ] **Step 1: Write the failing unit tests.**
  - **Valid links:** `academyLinkSchema` accepts `{kind:'handbook', slug:'travel-policy'}` and `{kind:'url', url:'https://forms.gle/abc'}`.
  - **Rejected links (Review Focus 5):** it rejects `{kind:'url', url:'javascript:alert(1)'}`, `{kind:'url', url:'http://example.com'}` and `{kind:'handbook', slug:'../admin'}`.
  - **`resolveAcademyLink`:** `{kind:'handbook', slug:''}` resolves to `'/handbook'`, and null to null.
- [ ] **Step 2: Run them.** They should FAIL. Implement `lib/academy/links.ts` and run them to PASS.
- [ ] **Step 3: Write the failing integration tests.**
  - **Eligibility:** `eligibleCards('BENEFIT', KARACHI/OFFICE/PK_EMPLOYMENT/PERMANENT)` includes a PK office card and excludes a MA-only card. With all attributes null, it returns only the cards whose rules are all empty.
  - **Soft delete:** a soft-deleted card is excluded.
  - **Config validation:** `updateAcademyConfig` with an invalid link throws a ZodError and persists nothing.
  - **Key contacts:** `saveKeyContacts` replaces the list in order.
- [ ] **Step 4: Implement the service, the routes and the three pages.**
  - **Access:** routes are HR only (`canManageOnboarding`).
  - **Link fields:** each one is a select of the handbook pages (from the existing handbook query) plus an "External URL" option. Empty means hidden.
  - **Library form:** has an eligibility editor (countries multi-select with PK, MA, CO, US plus a free ISO code; work modes; contract types; statuses), with a hint that empty means everyone.
- [ ] **Step 5: Run the tests.** All suites and `tsc` should PASS. Then click through the three pages locally with the flag on.
- [ ] **Step 6: Commit.** `git commit -m "feat(academy): benefits/reimbursements library, key contacts and links settings"`

### Task 8: Seed and cutover scripts

**Files:**
- Create: `prisma/seed-academy.ts`
- Create: `scripts/academy-cutover-complete-test-users.ts`
- Modify: `package.json` (add `"seed:academy": "tsx prisma/seed-academy.ts"`)
- Test: `tests/academy-seed.integration.test.ts`

**Interfaces:**
- Consumes: Task 1 schema; Task 7 `libraryCardSchema`, `academyLinkSchema`.
- Produces:
  - `export async function seedAcademy(db: PrismaClient): Promise<{ modulesCreated: number; modulesRetired: number; cardsCreated: number; checklistItemsCreated: number }>`
  - `export async function completeTestUsers(db: PrismaClient, opts: { apply: boolean }): Promise<string[]>`, which returns the affected names

**Seed content.** All of it is idempotent: upsert by `slug`, and cards by `(kind, title)`.

1. **Retire old modules.** Every `OnboardingModule` whose slug isn't one of the 14 below gets `isActive=false` and `orderIndex = 1000 + current`, but only if it's still under 1000. Do the same for old quiz questions (`isActive=false`, `orderIndex = 1000 + current`). New quiz questions are seeded in stage 3.
2. **Create the 14 modules,** each with version 1 (`blocks: []`), and set `currentVersionId`. Content blocks come in stage 2.

   | orderIndex | slug | title | phase | min | headlineLead / headlineAccent | icon | completionRule |
   |---|---|---|---|---|---|---|---|
   | 1 | welcome | Welcome to Plutus21 | DAY_1 | 7 | WELCOME TO / Plutus21 | PlayCircle | VIDEO_95 |
   | 2 | culture-values | Culture, Values and Code of Conduct | DAY_1 | 7 | OUR / Values | Heart | VIDEO_95 |
   | 3 | team-contacts | Your Team and Key Contacts | DAY_1 | 5 | MEET YOUR / Team | Users | BUDDY_HELLO |
   | 4 | role-90-days | Your Role and First 90 Days | DAY_1 | 10 | YOUR FIRST 90 / Days | Target | ALL_LINKS_OPENED |
   | 5 | how-we-work | How We Work: Tools and Rhythm | DAY_1 | 6 | HOW WE WORK / Together | Wrench | SCROLL_END |
   | 6 | discord | Discord Setup and Training | DAY_1 | 15 | SET UP / Discord | MessageCircle | CHECKLIST_AND_FIELD |
   | 7 | security | Security, Equipment and Data | DAY_1 | 10 | STAY / Secure | ShieldCheck | CHECKLIST_AND_ACK |
   | 8 | linkedin | Your LinkedIn Profile | WEEK_1 | 5 | MAKE IT LINKEDIN / Official | Linkedin | FIELD_SUBMITTED |
   | 9 | time-off | Working Hours, Time Off and Holidays | WEEK_1 | 10 | TIME / Off | CalendarDays | SCROLL_END |
   | 10 | your-benefits | Your Benefits | WEEK_1 | 6 | WHAT WE / Offer You | Gift | SCROLL_END |
   | 11 | getting-paid | Getting Paid | WEEK_1 | 5 | GETTING / Paid | Wallet | PAYMENT_SETUP |
   | 12 | reimbursements | Reimbursements | WEEK_1 | 4 | CLAIMING / Expenses | Receipt | SCROLL_END |
   | 13 | reviews-growth | Reviews, Feedback and Growth | WEEK_1 | 5 | HOW YOU / Grow | TrendingUp | SCROLL_END |
   | 14 | company-dashboard | The Company Dashboard and Where to Find Things | WEEK_1 | 4 | WHERE TO FIND / Things | BookOpen | LINK_OPENED |

3. **Benefit cards** (kind BENEFIT), one per row of the spec's benefits matrix (spec §4 Module 10 matrix).
   - **Body:** the spec's Module 10 card copy where given (Health insurance, Health insurance stipend, Client and Leadership Track). Otherwise, the matrix row text as a single sentence.
   - **Eligibility rules:**
     - Flexibility, Work from home, Work travel, Team trips, Client and Leadership Track, Team Teach-ins: all empty (everyone)
     - Lunch PKR 600: `countries ['PK']`, `workModes ['OFFICE','HYBRID']`
     - Laptop, phone and phone line: `employmentStatuses ['PERMANENT']`
     - Health insurance: `countries ['PK']`
     - Health insurance stipend MAD 909: `countries ['MA']`
     - Stock options: `countries ['PK','MA']`. "HR to confirm" means not eligible elsewhere.
4. **Reimbursement cards** (kind REIMBURSEMENT), with copy from spec Module 12:
   - Commute: `['PK']`, `OFFICE/HYBRID`. The body ends with `{commute rate table}`, rendered in stage 2 from `PayrollTravelAllowanceTier`.
   - Lunch: `['PK']`, `OFFICE/HYBRID`
   - SIM bundle: `['PK']`
   - Payment: `['PK']`
   - Work travel: everyone, with a link to the TRAVEL_POLICY handbook page
5. **Config links,** set only where the key is currently empty:

   | Key | Handbook slug |
   |---|---|
   | COMPANY_DASHBOARD | `''` |
   | TRAVEL_POLICY | travel-policy |
   | EQUIPMENT_POLICY | company-equipment-policy |
   | FAULTY_EQUIPMENT_SOP | sop-faulty-equipment |
   | DISCORD_CHANNELS_GUIDE | discord-channels-guide |
   | LEAVE_POLICY | leave-policy |
   | CORE_HOURS_POLICY | core-hours-policy |
   | ZERO_TOLERANCE_POLICY | zero-tolerance-policy |
   | PRINCIPLES_OF_CONDUCT | principles-of-conduct |

6. **HR checklist template:** the 17 rows of spec §5.8, upserted by `key`. Create missing rows only; never overwrite a row HR may have edited.

- [ ] **Step 1: Write the failing integration tests.**
  - **First run:** with an old module at `orderIndex` 1 seeded beforehand, `seedAcademy` creates 14 active modules and retires the old one (`orderIndex` 1001).
  - **Checklist:** the first run gives `checklistItemsCreated: 17`, and `lead-input` has `ownerRole` TEAM_LEAD, `dueOffsetDays` -7 and `autoTickEvent` `LEAD_INPUT_SUBMITTED`.
  - **Idempotency:** a second run gives `modulesCreated: 0`, `checklistItemsCreated: 0` and the same card count. A checklist title edited between runs is left as edited.
  - **Benefits untouched (Review Focus 4):** the `benefit` and `benefitCategory` counts are equal before and after.
  - **Cutover script:** `completeTestUsers(db, {apply:false})` returns the names and changes nothing. `{apply:true}` sets `onboardingCompleted=true` for exactly those users.
- [ ] **Step 2: Run them.** They should FAIL.
- [ ] **Step 3: Implement both scripts.**
  - **Cutover CLI default:** prints the names and does nothing.
  - **Cutover `--apply`:** writes the changes.
  - **Seed CLI:** refuses to run unless `ONBOARDING_ACADEMY_SEED_CONFIRM=yes` and `ONBOARDING_ACADEMY_ENABLED=true` are both set, so it can't be run against prod by accident.
- [ ] **Step 4: Run the tests.** They should PASS, along with the full suites and `tsc`.
- [ ] **Step 5: Commit.** `git commit -m "feat(academy): academy seed and test-user cutover scripts"`

### Task 9: Stage close-out

- [ ] **Step 1: Check with the flag off.**
  - Run `npm run build` locally with the local DB URL. It should succeed.
  - Start `npm run dev` with the flag unset.
  - Check: Admin › Onboarding pages, the new-hire detail page, the team lead form and the Users page behave and look as before. The new nav items are hidden, and `/api/admin/onboarding/library` returns 404.
- [ ] **Step 2: Check with the flag on.** Run through the Task 4–7 screens once.
- [ ] **Step 3: Review.** Run the code-reviewer agent on the branch diff and fix CRITICAL and HIGH findings.
- [ ] **Step 4: Open the PR.** Base `main`, titled "Onboarding Academy — stage 1 foundation". The body must list:
  - the env flag
  - the two scripts, and that neither runs on deploy
  - the PR does **not** run the seed or the cutover

---

## After stage 1: blockers before switch-on, and notes for stage 2

Stage 1 ships dark. None of these affect production while `ONBOARDING_ACADEMY_ENABLED` is off.

**Must be settled before the flag goes on:**
- **Contractors can still get a payroll profile.** `PUT /api/admin/users` upserts `payrollProfile` on every edit, and the Users page always sends it, so the first HR edit of a contractor creates a profile (D4a). The same class of write exists in the deactivate branch of that route and in `app/api/admin/users/reactivate/route.ts`. `app/api/payroll/employees/[id]/profile/route.ts` and the attendance import also upsert; they weren't assessed. This pre-dates the Academy.
- **Payroll entries for a linked contractor are dropped without a message** on create. Show HR a notice, or hide the payroll section for contractors.
- **Null contract type at link time:** a hire linked before HR sets the contract type still gets a profile, and the joining-date fill doesn't run on a later PK setup save.
- **Lead request after a failed email:** `leadInputDueAt` is stamped before sending, and a failed send isn't retried unless the lead changes.
- **Run the seed only at switch-on, and run `completeTestUsers` dry first.** It marks every user with `onboardingCompleted = false`, so check the names for any real hire.

**Stage 2 carry-forward:**
- PK bank details held until a profile exists (§9) have no storage yet. Don't use `OnboardingProgress.state`, which is unencrypted.
- First payout save doesn't notify OA; do that at `PAYMENT_SETUP`.
- `/api/onboarding/payout` must be on the lockout allowlist.
- `HEALTH_*` and `TRAVEL_POLICY` config keys aren't connected to card `links`.
- Once `iban` is written, `GET /api/admin/users` returns it unmasked and unlogged, like `accountNumber` today. That conflicts with "masked by default".
- `{commute rate table}` in the Commute card body must be substituted.
- Legacy `POST /api/admin/users` still creates progress rows for all active modules, with no `dueAt` or `versionId`.
- Stage 3 questions must have an `explanation`, or a re-seed retires them.
- Stage 4 needs `OnboardingChecklistItem` backfill for hires set up earlier.
