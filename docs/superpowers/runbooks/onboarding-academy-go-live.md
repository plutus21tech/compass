# Onboarding Academy: go-live runbook

This is the order of steps for the push that makes the Academy the only onboarding. Every step that touches production is marked **Needs the owner's go-ahead**. Do not do one until the owner has said yes to that step.

Background: design `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md` (section 10, "Feature flag and cutover"). The Academy is built behind `ONBOARDING_ACADEMY_ENABLED`. Nothing in this runbook has been run against production.

## Rules for whoever runs this

- The root `.env` in the main checkout points at the production database. Run a production step only on purpose, and read the "Database host" line each script prints before you let it write.
- Run the seed and the cutover script once, around this release. Never on every deploy.
- Vercel runs `prisma migrate deploy` as part of `npm run build`, so the new migrations are applied by the deploy itself. They only add tables and columns (no `DROP` or `RENAME` in any Academy migration).
- A single database serves preview and production, so a preview deploy applies the migrations too. The seed and the cutover script change data, not schema, and only run when you run them.

## 1. Pre-flight checklist

Tick every line before step 2.

- [ ] The stage 5 branch is reviewed, and `npx tsc --noEmit`, `npm test`, `npm run test:academy-db`, `npm run test:e2e:academy` and `npx next build` all pass on it. (`npm test` has a known baseline of 19 failures outside the Academy: 18 api-integration and 1 rate-limit.)
- [ ] `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <a scratch database>` reports no difference.
- [ ] The owner has chosen the release: which of the two ways in step 6 to use, and the day.
- [ ] `CRON_SECRET` is set on Vercel (the hourly job refuses requests without it).
- [ ] Academy emails link to the fixed address in `lib/compass-url.ts` (not an environment variable), so check that address is the live one.
- [ ] HR knows the Academy is going live and who the legacy hires are (step 4).
- [ ] The open product items (section 9) are understood. None of them blocks go-live; each has a fallback in the product.

## 2. Set `ONBOARDING_FIELD_ENCRYPTION_KEY` everywhere

**Needs the owner's go-ahead.**

1. Generate a 32-byte key as 64 hex characters (for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). It is separate from payroll's key. Keep it in the team's secret store.
2. Add `ONBOARDING_FIELD_ENCRYPTION_KEY` to Production and Preview (and any local environment that saves payment details). Use the same value everywhere that shares the production database, or saved details will not decrypt in the other environment.
3. Redeploy so the value is picked up.

Check afterwards: on a preview build, open Module 11 as a test hire and save fictional bank details. It must succeed. Without the key, saving payment details fails.

## 3. Check the lockout header and the hourly cron on a preview build

**Needs the owner's go-ahead** (a preview deploy of the stage 5 branch, with `ONBOARDING_ACADEMY_ENABLED=true` set for Preview only).

The lockout reads the path from the `x-compass-pathname` header that the middleware forwards. It was proven on `next dev`; only a deployed build proves the header arrives.

1. Sign in on the preview as a user with `onboardingCompleted = false`. Open `/dashboard`. You must be sent to `/onboarding`. Open `/handbook` and `/profile`; both must open.
2. Sign in as a finished user. `/dashboard` must open and nothing redirects.
3. Confirm the cron. `vercel.json` already lists `/api/cron/onboarding` at `0 * * * *`. After the first hour, check the function log for that path: a request authorised by `CRON_SECRET` returns `{ success: true, ... }` with the flag on, and `{ skipped: 'The Onboarding Academy is off' }` with it off. If the plan refuses an hourly cron, use the fallback in design section 8.

## 4. Dry-run, then run, the test-account cutover and close legacy hires

**Needs the owner's go-ahead for each of the two parts.**

### 4a. Test accounts: `completeTestUsers`

The script is `scripts/academy-cutover-complete-test-users.ts`. It marks every user with `onboardingCompleted = false` as complete. It is a dry run unless you pass `--apply`.

1. Dry run against production: `npx tsx scripts/academy-cutover-complete-test-users.ts` (with `DATABASE_URL` pointing at production). It prints the database host and every name it would change, and writes nothing.
2. Read the names. They should be the test accounts from March to April 2026. **If any real hire is listed, stop and tell the owner.**
3. With the owner's go-ahead on that exact list: `npx tsx scripts/academy-cutover-complete-test-users.ts --apply`.

Check afterwards: run the dry run again. It must list zero users.

### 4b. Legacy new hires

Legacy `NewHire` rows in PENDING or ONBOARDING have no checklist (the checklist is created at a hire's first setup save, and the job never creates one), so they would show on the tracker with nothing under them. Before the push, with the owner's go-ahead, mark them COMPLETED. The design (section 14) notes 4 such rows existed when it was written; list the real ones first with a read-only query and name each row in a reviewed one-off statement. Do not delete any row.

Check afterwards: the tracker shows no legacy hire without a checklist.

## 5. Run the seed once, against production

**Needs the owner's go-ahead.** This is the step with consequences: it retires the legacy onboarding.

The seed is `prisma/seed-academy.ts` (`npm run seed:academy`). It refuses to run unless both variables are set:

```
ONBOARDING_ACADEMY_ENABLED=true ONBOARDING_ACADEMY_SEED_CONFIRM=yes npm run seed:academy
```

What it does, all re-runnable:

- retires the legacy modules and legacy quiz questions (it sets `isActive` to false, moves them to order index 1000 and above, and sets `retiredAt` on questions; it deletes nothing)
- creates the 14 course modules with version 1 content
- creates the 12 quiz questions with explanations
- creates library cards, default links and the HR checklist template
- never overwrites text HR has edited: titles, lead-in words and version 1 blocks that already have content stay as they are

It prints the database host first and a warning. Read both. It prints a result with counts when it finishes.

Check afterwards:

- the printed counts look right on the first run (14 modules created; 12 questions created; old modules retired)
- the Academy module editor (Onboarding settings) lists the 14 modules, each with a live version
- the quiz editor shows the 12 questions as usable
- run it a second time only if you need to; it must report nothing created

The seed has to land with the release. Old modules retired while the old flow is still the default would break it, and the Academy turned on without the seed would lock hires out of an empty course.

## 6. Turn the Academy on in the same release

**Needs the owner's go-ahead.** Pick one of two ways with the owner. The stage 5 code keeps the flag, so the first is the one the code supports today.

**Way A (flag on, no code change):** set `ONBOARDING_ACADEMY_ENABLED=true` on Vercel Production and redeploy. Then run steps 4 and 5 in the order given in section 10 below.

**Way B (flag removed from the code):** a release that deletes the flag checks (about 28 files read `isAcademyEnabled` or the variable, and `vercel.json`'s cron should stay) so the Academy is unconditional. This is a code change and its own review; the seed's guard also reads the flag and would change with it.

Whichever way: the seed (step 5) and the cutover (step 4) must be done in the same release window, not weeks before or after.

## 7. Smoke checks after the deploy

Do these on production, with fictional or the owner's own test accounts, in this order.

1. `/login` works. A finished user lands on the dashboard with no redirect.
2. HR: `/admin/onboarding/tracker` loads, shows the hires, and shows the "Most-missed questions" panel (it says there are no answers yet on day one).
3. HR: open a module in the module editor and press "Preview as". It renders the module and nothing is saved.
4. HR: `/admin/onboarding/academy/videos` shows two videos. If neither has a video yet, Modules 1 and 2 show "Video coming soon" and finish by scrolling to the end.
5. A new hire made for the purpose: release the course from the new-hire page. The hire sees 14 modules, with Module 1 open and the rest locked. A locked hire cannot open `/dashboard` and can open `/onboarding`, `/profile` and `/handbook`.
6. Save fictional bank details in Module 11 for that hire. It must succeed (this proves the encryption key). Check no payroll profile appears.
7. The hourly job: within the hour, the log shows `/api/cron/onboarding` returning `success`.
8. Delete nothing and leave the test hire for HR to close.

## 8. Rollback

Because every Academy migration only adds, the schema never needs to be rolled back. The code can be rolled back or the flag turned off at any time.

- **Turn the flag off (Way A):** set `ONBOARDING_ACADEMY_ENABLED` to anything but `true` and redeploy. With the flag off the old onboarding flow behaves exactly as it did, the lockout stops applying, and the hourly cron answers `skipped`. New tables and columns stay and are ignored.
- **The seed's retirement of legacy modules needs care.** The seed does not delete the legacy modules or questions: it deactivates them and moves them to order index 1000 and above. Turning the flag off therefore does **not** bring the old modules back on its own. To restore the old flow after a seed, reactivate those rows (`isActive` true, original order index = current minus 1000, and `retiredAt` null on the legacy questions) with the owner's go-ahead, from a reviewed statement. Do that before telling anyone the old flow is back. Course modules cannot be switched off from the admin page, so the repair is a database change, not a click.
- **Way B:** roll back with the previous deployment in Vercel. The same retirement caveat applies.
- **Hires who started the Academy:** their progress rows, acknowledgements and quiz attempts stay in place. Turning the flag back on later picks them up where they were. Do not delete any of those rows.
- **Test accounts marked complete in step 4a** stay complete. That is harmless.

## 9. Open product items (not blocking)

None of these stops go-live. Each has a stated fallback.

- **The bank letter text.** Until HR sends the account-opening-letter template text, Module 11 says "HR will share your bank letter" instead of offering a download. When the text arrives it needs a small build, which is not in stage 5.
- **Videos.** HR enters, for each of the two videos, the YouTube ID, the length in seconds and at least one chapter, and may add transcripts (English, French, Spanish) on the Videos page (`/admin/onboarding/academy/videos`). The length must be typed correctly: a wrong one only shifts the 95% point, but a length longer than the real video strands a hire on "Saving your progress". A video is ready only with an ID, a length and a chapter. Until then Modules 1 and 2 stay on "Video coming soon" with scroll-to-end. Adding a video later never resets anyone who has finished the module. If a ready video will not load for a hire, HR uses "Mark watched" in the tracker drawer, which is logged with who, when and why.
- **Key Contacts.** The key-contact groups are seeded empty. HR fills them in under Onboarding settings; a few placeholders (for example the security contacts in the dashboard "lost or stolen" box) show nothing until then.
- **The checklist draft.** The HR checklist template (design section 5.8) is our draft. HR corrects the items, owners and deadlines in Onboarding settings.
- **Links with no handbook page yet** (Discord training manual and video, incident inquiry form, Cyber Security SOP, health-insurance presentation and claim kit, invoice templates). HR enters these in settings.

## 10. The order, in one list

1. Pre-flight checklist (section 1).
2. `ONBOARDING_FIELD_ENCRYPTION_KEY` everywhere (step 2).
3. Preview build: lockout header and hourly cron (step 3).
4. Dry-run, then run, `completeTestUsers`; close legacy PENDING or ONBOARDING hires (step 4).
5. Seed once with the confirm flag (step 5).
6. Turn the flag on, or remove the flag checks, in the same release (step 6).
7. Smoke checks (step 7).

Steps 4 to 6 belong to one release window. Check after each step before starting the next.

## 11. The later cleanup push (separate, after the Academy is live)

This is its own change, started only when the owner says the Academy is settled. Nothing in it is part of go-live.

- Remove the legacy onboarding code and the flag branches it guards.
- Remove dead columns the Academy left behind, for example `OnboardingConfig.maxQuizAttempts` (retakes are never capped, so it is unused) and `OnboardingModule.content` (the old text body; Academy content lives in versions).
- Legacy rows (retired modules, retired questions, old progress and attempt rows) are **only deleted with the owner's say-so**, row set by row set, after a read-only count shows what would go. The default is to keep them.
- Other minor items carried in the "After stage" sections of the stage plans can ride along if the owner wants.
