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
- [ ] The owner knows step 3a (restore point) comes before any data change.
- [ ] The owner has chosen the release: which of the two ways in step 6 to use, and the day.
- [ ] `CRON_SECRET` is set on Vercel (the reminder job refuses requests without it).
- [ ] Academy emails link to the fixed address in `lib/compass-url.ts` (not an environment variable), so check that address is the live one.
- [ ] HR knows the Academy is going live and who the legacy hires are (step 4).
- [ ] The open product items (section 9) are understood. None of them blocks go-live; each has a fallback in the product.

## 2. Set `ONBOARDING_FIELD_ENCRYPTION_KEY` everywhere

**Needs the owner's go-ahead.**

1. Generate a 32-byte key as 64 hex characters (for example `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). It is separate from payroll's key. Keep it in the team's secret store.
2. Add `ONBOARDING_FIELD_ENCRYPTION_KEY` to Production and Preview (and any local environment that saves payment details). Use the same value everywhere that shares the production database, or saved details will not decrypt in the other environment.
3. Redeploy so the value is picked up.

**The key is set-once.** Changing or rotating it makes already-saved payment details unreadable. Never replace it after a hire has saved details.

Check afterwards: the variable is listed for Production and for Preview in the Vercel project settings (`lib/academy/field-encryption.ts` reads it; without it, saving payment details fails). Do not try to save bank details on a preview yet: Preview shares the production database, and the course is not seeded until step 5. The save-and-decrypt proof is in step 7.

## 3. Check the lockout header on a preview build

**Needs the owner's go-ahead** (a preview deploy of the stage 5 branch, with `ONBOARDING_ACADEMY_ENABLED=true` set for Preview only). Preview shares the production database, so use only fictional or the owner's own test accounts.

The lockout reads the path from the `x-compass-pathname` header that the middleware forwards. It was proven on `next dev`; only a deployed build proves the header arrives.

1. Sign in on the preview as a user with `onboardingCompleted = false`. Open `/dashboard`. You must be sent to `/onboarding`. Open `/handbook` and `/profile`; both must open.
2. Sign in as a finished user. `/dashboard` must open and nothing redirects.

Vercel runs cron jobs only on production deployments, so the reminder job cannot be proven on a preview; its real check is in step 7. An optional proof of the route itself before production: call the preview's `/api/cron/onboarding` by hand with the header `Authorization: Bearer <CRON_SECRET>`. With the flag off it answers `{ "skipped": "The Onboarding Academy is off" }`; with it on it runs the job and answers `{ "success": true, ... }` (the job may send real reminder emails to hires on the shared database, so skip this proof if that is a worry). Without the secret it answers 401.

`ONBOARDING_ACADEMY_ENABLED=true` may stay on Preview afterwards, since Preview is for testing. Remember that Preview shares the production database, so a preview with the flag on reads the same hires and course as production.

## 3a. Make a restore point before touching data

**Needs the owner's go-ahead.** Steps 4 and 5 change production data. Before them, create a Neon branch of production (or record the point-in-time-restore timestamp, in UTC, if branching is not available on the plan). Write the branch name or timestamp here and in the release notes: `____________`. Section 8 uses it as the first rollback option.

Check afterwards: the branch is listed in the Neon console, or the timestamp is inside the plan's restore window.

## 4. Dry-run, then run, the test-account cutover and close legacy hires

**Needs the owner's go-ahead for each of the two parts.**

### 4a. Test accounts: `completeTestUsers`

The script is `scripts/academy-cutover-complete-test-users.ts`. It marks every user with `onboardingCompleted = false` as complete. It is a dry run unless you pass `--apply`.

1. Dry run against production. The owner supplies the production `DATABASE_URL` explicitly on the command line, for this command only, and never from an ambient `.env` file or an exported shell variable: `DATABASE_URL='<production url from the secret store>' npx tsx scripts/academy-cutover-complete-test-users.ts`. It prints the database host and every name it would change, and writes nothing.
2. Read the printed "Database host" line, and confirm it is the production host, before you ever add `--apply`. Then read the names. They should be the test accounts from March to April 2026. **If any real hire is listed, stop and tell the owner.**
3. With the owner's go-ahead on that exact list, run the same command with the same explicit `DATABASE_URL` and `--apply` added.

Check afterwards: run the dry run again. It must list zero users.

### 4b. Legacy new hires

Legacy `NewHire` rows in PENDING or ONBOARDING have no checklist (the checklist is created at a hire's first setup save, and the job never creates one), so they would show on the tracker with nothing under them. The design notes 4 such rows in production (section 4, "What happens to the existing foundation"; they look like test data), and the rule that they are marked COMPLETED before the push is in section 10, "Cutover, legacy hires". "Closing" a hire means setting its `status` to `COMPLETED`. Do not delete any row.

1. List them, read-only (with the owner's explicit `DATABASE_URL`, as in 4a):

   ```sql
   SELECT id, name, status FROM "NewHire" WHERE status IN ('PENDING','ONBOARDING');
   ```

2. The owner says which rows to close. If one is a real hire, leave it alone and tell the owner.
3. Close only the approved rows, naming each id (a reviewed one-off statement, never a bare `WHERE status ...`):

   ```sql
   UPDATE "NewHire" SET status = 'COMPLETED', "updatedAt" = now()
   WHERE id IN ('<approved id 1>', '<approved id 2>');
   ```

4. Run the SELECT again. It must list only the rows the owner chose to keep (normally zero).

Check afterwards: the tracker shows no legacy hire without a checklist.

## 5. Run the seed once, against production

**Needs the owner's go-ahead.** This is the step with consequences: it retires the legacy onboarding.

The seed is `prisma/seed-academy.ts` (`npm run seed:academy`). It refuses to run unless both variables are set:

```
DATABASE_URL='<production URL, supplied by the owner>' ONBOARDING_ACADEMY_ENABLED=true ONBOARDING_ACADEMY_SEED_CONFIRM=yes npm run seed:academy
```

As in step 4a, give `DATABASE_URL` explicitly on the command line. Never rely on an ambient `.env`. The seed prints "Seeding the Academy into database host: …" and carries straight on without pausing. So check the host inside the URL before pressing Enter, and stop it at once (Ctrl+C) if the printed host is not the one you meant.

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
- do not run it a second time to "check": a re-run creates nothing new, but it renumbers the order index of the existing course modules back to the seeded values (any reordering done since is undone) and resets their other seeded settings; HR's edited titles, lead-in words and version 1 blocks are kept

The seed has to land with the release. Old modules retired while the old flow is still the default would break it, and the Academy turned on without the seed would lock hires out of an empty course.

## 6. Turn the Academy on in the same release

**Needs the owner's go-ahead.** Pick one of two ways with the owner. The stage 5 code keeps the flag, so the first is the one the code supports today.

**Way A (flag on, no code change):** run steps 4 and 5 first, in the order given in section 10 below. Then set `ONBOARDING_ACADEMY_ENABLED=true` on Vercel Production and redeploy, as the LAST action.

Between the seed and the flag-on deploy the old flow is broken, because the seed retires the legacy modules and questions (`prisma/seed-academy.ts` deactivates them and moves them to order index 1000 and above). So have the flag change ready and deploy immediately after the seed, with nobody onboarding in between.

**Way B (flag removed from the code):** a release that deletes the flag checks (29 source files read `isAcademyEnabled` or the variable, and `vercel.json`'s cron should stay) so the Academy is unconditional. This is a code change and its own review; the seed's guard also reads the flag and would change with it.

Whichever way: the seed (step 5) and the cutover (step 4) must be done in the same release window, not weeks before or after.

## 7. Smoke checks after the deploy

Do these on production, with fictional or the owner's own test accounts, in this order.

1. `/login` works. A finished user lands on the dashboard with no redirect.
2. HR: `/admin/onboarding/tracker` loads, shows the hires, and shows the "Most-missed questions" panel (it says there are no answers yet on day one).
3. HR: open a module in the module editor and press "Preview as". It renders the module and nothing is saved.
4. HR: `/admin/onboarding/academy/videos` shows two videos. If neither has a video yet, Modules 1 and 2 show "Video coming soon" and finish by scrolling to the end.
5. A new hire made for the purpose: release the course from the new-hire page. The hire sees 14 modules, with Module 1 open and the rest locked. A locked hire cannot open `/dashboard` and can open `/onboarding`, `/profile` and `/handbook`.
6. Save fictional bank details in Module 11 for that hire. It must succeed (this proves the encryption key). Check no payroll profile appears.
7. The reminder job (the real cron check; Vercel runs crons on production only). It runs daily at 05:00, 10:00 and 16:00 UTC; Hobby fires each one at some minute inside that hour. After the next of those hours, the log shows `/api/cron/onboarding` returning `success`.
8. Delete nothing and leave the test hire for HR to close.

## 8. Rollback

Because every Academy migration only adds, the schema never needs to be rolled back. The code can be rolled back or the flag turned off at any time.

- **First choice, after the seed: restore the point from step 3a.** Restore the Neon branch (or the point-in-time timestamp) written down there. That puts the legacy rows back exactly as they were. It also discards anything written to the database since that point, including Academy progress, so use it only if nothing worth keeping has happened, or when the owner has decided what may be lost.
- **Turn the flag off (Way A):** set `ONBOARDING_ACADEMY_ENABLED` to anything but `true` and redeploy. With the flag off the old onboarding flow behaves exactly as it did before the seed, the lockout stops applying, and the reminder cron answers `skipped`. After the seed that holds only once the legacy rows are reactivated or the Neon branch is restored. New tables and columns stay and are ignored.
- **Fallback: reactivate the legacy rows by hand (the seed's retirement of legacy modules needs care).** The seed does not delete the legacy modules or questions: it deactivates them and moves them to order index 1000 and above. Turning the flag off therefore does **not** bring the old modules back on its own. To restore the old flow after a seed, reactivate those rows (`isActive` true, original order index = current minus 1000, and `retiredAt` null on the legacy questions) with the owner's go-ahead, from a reviewed statement. Do that before telling anyone the old flow is back. Course modules cannot be switched off from the admin page, so the repair is a database change, not a click.
- **Way B:** roll back with the previous deployment in Vercel. The same retirement caveat applies.
- **Hires who started the Academy:** their progress rows, acknowledgements and quiz attempts stay in place. Turning the flag back on later picks them up where they were. Do not delete any of those rows.
- **Test accounts marked complete in step 4a** stay complete. That is harmless.

## 9. Open product items (not blocking)

None of these stops go-live. Each has a stated fallback.

- **The bank letter text.** Until HR sends the account-opening-letter template text, Module 11 says "HR will share your bank letter" instead of offering a download. When the text arrives it needs a small build, which is not in stage 5.
- **Videos.** HR enters, for each of the two videos, the YouTube ID, the length in seconds and at least one chapter, and may add transcripts (English, French, Spanish) on the Videos page (`/admin/onboarding/academy/videos`). The length must be typed correctly: a wrong one only shifts the 95% point, but a length longer than the real video strands a hire on "Saving your progress". A video is ready only with an ID, a length and a chapter. The video must be public or unlisted on YouTube, with embedding allowed: a private video, or one with embedding disabled, shows every hire the "couldn't load" card. Until then Modules 1 and 2 stay on "Video coming soon" with scroll-to-end. Adding a video later never resets anyone who has finished the module. If a ready video will not load for a hire, HR uses "Mark watched" in the tracker drawer, which is logged with who, when and why.
- **Key Contacts.** The key-contact groups are seeded empty. HR fills them in under Onboarding settings; a few placeholders (for example the security contacts in the dashboard "lost or stolen" box) show nothing until then.
- **The checklist draft.** The HR checklist template (design section 5.8) is our draft. HR corrects the items, owners and deadlines in Onboarding settings.
- **Links with no handbook page yet** (Discord training manual and video, incident inquiry form, Cyber Security SOP, health-insurance presentation and claim kit, invoice templates). HR enters these in settings.

## 10. The order, in one list

1. Pre-flight checklist (section 1).
2. `ONBOARDING_FIELD_ENCRYPTION_KEY` everywhere (step 2).
3. Preview build: lockout header (step 3).
3a. Restore point: Neon branch or restore timestamp (step 3a).
4. Dry-run, then run, `completeTestUsers`; close legacy PENDING or ONBOARDING hires (step 4).
5. Seed once with the confirm flag (step 5).
6. Turn the flag on (deploy ready right after the seed), or remove the flag checks, in the same release (step 6).
7. Smoke checks (step 7).

Steps 3a to 6 belong to one release window. Check after each step before starting the next.

## 11. The later cleanup push (separate, after the Academy is live)

This is its own change, started only when the owner says the Academy is settled. Nothing in it is part of go-live.

- Remove the legacy onboarding code and the flag branches it guards.
- Remove dead columns the Academy left behind, for example `OnboardingConfig.maxQuizAttempts` (retakes are never capped, so it is unused) and `OnboardingModule.content` (the old text body; Academy content lives in versions).
- Legacy rows (retired modules, retired questions, old progress and attempt rows) are **only deleted with the owner's say-so**, row set by row set, after a read-only count shows what would go. The default is to keep them.
- Other minor items carried in the "After stage" sections of the stage plans can ride along if the owner wants.
