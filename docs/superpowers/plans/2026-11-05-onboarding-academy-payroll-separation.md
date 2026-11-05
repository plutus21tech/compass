# Onboarding Academy — Separate Onboarding from Payroll

> **For agentic workers:** one implementer, one review, on `feat/onboarding-academy-stage-2`.

**Goal:** Remove every link from onboarding into payroll. Onboarding collects bank details or a preferred way of being paid in its own table. HR and OA read them, masked with logged reveals, and OA enters them into payroll by hand.

**User decision (2026-11-05):** "Nothing in onboarding should be linked to the payroll section. it just just be a way for the team to get access to their bank details or prefered way of payment and then the OA team can add them to payroll themselves. This concept should be applied to all sensitive modules like payroll."

This replaces D4 and D4a in the design.

## Global Constraints

- Never use the root `.env`: it is production. Local database only.
- `git diff main...HEAD` must show no change to these, so payroll and Users behave exactly as on main with the flag on or off:
  - `lib/payroll/**`
  - `app/api/payroll/**`
  - `app/api/admin/users/reactivate/route.ts`
- `app/api/admin/users/route.ts` and `app/(hr)/admin/users/page.tsx` keep only the Academy attribute and contact fields. No Academy code may read or write any payroll column or decide whether a payroll write happens.
- No code outside onboarding, Users and auth imports `lib/academy`.
- These migrations have never reached production, so rewrite them rather than adding drop migrations. The result must leave no dead columns or tables.
- Fictional test data only.

## Changes

**Remove writes**
1. `saveBankDetails` no longer writes to `PayrollEmployeeProfile`.
2. Delete `applyPendingBankDetails`, its safe wrapper, and every hook.
3. Delete the joining-date copy into payroll and the contractor gate in `finishNewHireLink`, and the link-time copying of contract type into payroll. Restore the admin users route's payroll behaviour to main's.
4. Delete `omitBankIdentifiers` and `withoutBlankBankLabels`.
5. Remove `iban` and `branch` from `PayrollEmployeeProfile` in the schema and the stage 1 migration.
6. Restore `lib/payroll/sensitive-fields.ts` to main's version.

**One store**
7. Replace `ContractorPayoutDetails`, `ContractorPayoutRevealLog` and `OnboardingPendingBankDetails` with `OnboardingPaymentDetails` and `OnboardingPaymentRevealLog`. One row per user. `method` gains `PK_BANK`, with `accountTitle`, `bankName`, `branch`, `iban`.
8. Rewrite the two migrations to match. There is no held state any more: a saved row is simply saved.
9. Module 11 version A saves through this store. `paymentFacts` reads only this table. The rule is the same as before, contract type chooses the form, and the bank module lock stays. Copy: "Accounts will take it from here." replaces "HR will add them to your payroll profile."
10. Access stays as stage 1 built it: owner reads own, HR and OA read masked, every reveal logged.

**Own encryption**
11. New `lib/academy/field-encryption.ts`, using `ONBOARDING_FIELD_ENCRYPTION_KEY`, with the same AES-GCM label-based format. Nothing in `lib/academy` imports `lib/payroll`. Document the new variable in `.env.example` if the repo has one.

**Remove reads**
12. Commute rates: new `OnboardingConfig.commuteRates` (JSON), editable in Links & settings, as the product spec says. Seed empty; never read payroll for it. An empty table shows "Ask HR for the current rates."
13. Remove the contract-type prefill from payroll in `prefillFromTeamTag` and its callers.

**Reads kept for now, pending the user's answer**
- Holidays read `PayrollPublicHoliday`: it's the company calendar, with no pay data.
- Lead and buddy eligibility reads `isPayrollActive`, as main's `lib/onboarding.ts` does, because it's where Compass stores whether an account is active.

Isolate both in one small file, `lib/academy/service/shared-reads.ts`, so they can be swapped.

**Docs**
14. Update the design: D4, D4a, §5.1, §5.9, §9, §10, §13, §14. Update the stage 1 and stage 2 plans' carry-forward sections: remove items that no longer apply, and add the new env var and OA's read view for stage 4.
15. Add to the design's §3: sensitive modules are changed only by the team that owns them.

## Tests

- A guard test fails if any file under `lib/academy`, `components/academy`, `app/api/onboarding/academy` or `prisma/seed-academy*` imports `lib/payroll` or uses `payroll` on the Prisma client, apart from `shared-reads.ts`.
- A guard test fails if any file under `app/api/payroll` or `lib/payroll` imports `lib/academy`.
- Completing Module 11 for a PK hire with a payroll profile leaves that profile byte-identical.
- PK and contractor flows both save to `OnboardingPaymentDetails`; profile counts unchanged throughout.
- Commute table renders from config; empty shows the fallback.
- Masking and reveal log cover `PK_BANK`.
- `tsc`, `npm test` (same baseline), `test:academy-db`, `next build`, E2E, and an empty `migrate diff`.
