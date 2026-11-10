# Onboarding Academy — Stage 5 (Video and Polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Academy. This stage adds:
- the real YouTube player for Modules 1 and 2, with chapters, captions, a transcript and the no-skip rule
- quiz links back to the right chapter
- "Preview as" in the module editor
- the most-missed questions report
- the polish carried forward from earlier stages
- a written go-live runbook

**Architecture:** Same layout as earlier stages. The player is a client component on the YouTube IFrame Player API with its own control bar. It reports the furthest second watched, and the server decides completion from HR-entered durations, never from client claims alone.

**Tech Stack:** Next.js 16, React 18, Prisma 5, TypeScript, Zod 4, YouTube IFrame Player API (`https://www.youtube.com/iframe_api`, no npm package), `node --test` with tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md` (§6.4, §6.5, §7), plus spec module 1 and 2 build notes and screen 4 in `Compass Onboarding Academy_ Product Spec.docx` (parent checkout). Read "After stage 4" in the stage 4 plan.

**Branch:** `feat/onboarding-academy-stage-5`, from `feat/onboarding-academy-stage-4` at b98dd898.

## Global Constraints

- Every constraint in the earlier plans still applies:
  - additive migrations
  - never use the root `.env` (it is production)
  - fictional test data
  - flag off means no change
  - onboarding never touches payroll
  - roles enforced on the server
  - notices once-only, sent after commit
- **No video, no block.** With no ready video, Modules 1 and 2 keep the "Video coming soon" card and `SCROLL_END`. Adding a video later never resets anyone who has already completed the module (§6.4).
- **The server decides 95%.** The duration comes from HR's config. A reported position can't move further ahead than the real time that has passed allows, plus a small tolerance.
- **Privacy:** embed from `https://www.youtube-nocookie.com`. Load the API script only on pages with a ready video.
- **Accessibility:**
  - captions on by default
  - every control works by keyboard
  - transcript readable without playing
  - reduced motion respected
  - WCAG AA
- **Copy is warm, short and second person.** Don't invent company facts. List any added line in the report.
- **The flag stays in this stage.** Removing it is part of the go-live push, done with the seed and the cutover, as the runbook in Task 7 sets out.

**Plan decisions (correct them here if wrong):**
- **HR enters the duration in seconds with the video ID,** because the server can't ask YouTube without an API key. A video is ready only with an ID, a duration and at least one chapter.
- **Chapters are `{key, label, start}` rows.** Module 2's keys come from the quiz bank (`innovation`, `integrity`, `collaboration`, `speed`, `what-we-expect`, `a-safe-place`, `how-we-treat-each-other`, `client-centric`), so quiz links work once matching chapters exist.
- **Transcripts are plain text per language** (`en`, `fr`, `es`). An empty transcript hides that option.
- **Captions come from YouTube's own tracks.**
- **The end screen** shows "Next: Module N".
- **Preview as** renders the draft or live version for chosen facts: location, remote country, work mode, contract, status, wing, client account. People and per-hire data show labelled samples.
- **The most-missed report** counts Academy attempts only, over all attempts and over first attempts. It's a tracker panel.
- **The bank letter** still waits for HR's text.

## Review Focus

1. **Faking 95%.** A large reported position, rapid reports, or a seek past the furthest point must not complete early. Pinned in Task 2.
2. **A missing or broken video.** No ID, a wrong ID, a blocked script, or a slow network must all leave the hire a way to finish. Pinned in Tasks 2 and 3.
3. **HR replacing the video.** It must not reset finished hires, and a half-watched hire must get a fair resume. Pinned in Task 2.
4. **Preview leaking or writing data.** Preview never writes progress or shows a real person's data, and is HR only. Pinned in Task 4.
5. **Keyboard and screen-reader use** of play, pause, chapters and the transcript. Pinned in Task 3.

---

### Task 1: Video config and its editor

**Files:**
- Create: `lib/academy/video.ts`, `app/api/admin/onboarding/videos/route.ts`, `app/(hr)/admin/onboarding/academy/videos/page.tsx`, `components/academy/hr/VideoConfigForm.tsx`
- Modify: `lib/academy/service/library.ts`, `components/layout/sidebar-nav.ts`, `next.config.js` (CSP report-only: `script-src https://www.youtube.com`, `frame-src https://www.youtube-nocookie.com`, `img-src https://i.ytimg.com`)
- Test: `tests/academy-video.test.ts`

**Interfaces:**
- `videoConfigSchema` for `OnboardingConfig.videos`: `{ VIDEO_1?: VideoConfig, VIDEO_2?: VideoConfig }`, where `VideoConfig` is:
  - `youtubeId`: 11 characters of `[A-Za-z0-9_-]`
  - `durationSeconds`: an integer from 30 to 7200
  - `chapters`: `{key, label, start}`, 1 to 30 of them, starts unique and ascending, the first at 0, all below the duration
  - `transcripts`: `{ en?, fr?, es? }`, each up to 100,000 characters
- `readVideo(stored, key): VideoConfig | null` never throws.
- `isVideoReady(v): boolean`
- `chapterStart(v, chapterKey): number | null`

Rules: HR only. Saving never changes progress. The duration field also accepts `m:ss`, with the hint "Total length, for example 6:30".

- [ ] **Step 1: Write the failing tests:**
  - a valid config parses
  - each of these is refused: a bad ID, a first chapter not at 0, chapters out of order, a chapter past the duration, a duration out of range
  - `readVideo` returns null for junk
  - `m:ss` is converted
- [ ] **Step 2: Run them to confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit.** `feat(academy): add the video settings`

---

### Task 2: Server rules for watching

**Files:**
- Modify: `lib/academy/completion.ts`, `lib/academy/progress.ts`, `lib/academy/service/progress.ts`, `lib/academy/service/course.ts`, `lib/academy/view.ts`, the events route
- Create: `app/api/onboarding/academy/videos/[key]/transcript/route.ts`
- Test: `tests/academy-video-progress.test.ts`, `tests/academy-video-progress.integration.test.ts`

**Interfaces:**
- `ProgressEvent` gains `{ type: 'VIDEO_PROGRESS'; seconds: number }`.
- `ProgressState` gains `video?: { furthest: number; reportedAt: string; durationSeconds: number }`.
- `applyVideoProgress(state, seconds, now, durationSeconds)`:
  - the new furthest is `min(seconds, previous + elapsed × 1.1 + 15, duration)`
  - it never drops
  - it restarts from 0 if the stored duration differs
- `effectiveRule` treats `VIDEO_95` as real only when the module's video is ready; otherwise it stays `SCROLL_END`.
- `VIDEO_95` is met when `furthest ≥ 0.95 × duration`.
- The `ModuleView` video block gains `{ ready, youtubeId, durationSeconds, chapters, transcriptLanguages, furthest, completed }` when ready. Transcripts load separately.

Rules:
- Progress goes through the existing row lock.
- Completion stays the existing POST, re-checked on the server.
- A completed row ignores progress events.
- A config change never touches rows.
- The transcript route serves a person who can open that module, and HR. It returns `no-store`.

- [ ] **Step 1: Write the failing tests:**
  - posting 600 seconds right after the start gives at most 15
  - reports every 10 seconds reach 95% only after about 95% of the duration, using an injected `now`
  - furthest never drops
  - an unready video keeps the rule at `SCROLL_END`, and a ready one makes it `VIDEO_95`
  - completing early gives 409
  - a completed row is unchanged after a config change
  - a duration change restarts a half-watched row
  - the transcript route refuses someone who can't open the module
- [ ] **Step 2: Run them to confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them, `npm run test:academy-db`, `npx tsc --noEmit`.**
- [ ] **Step 5: Commit.** `feat(academy): count video watching on the server`

---

### Task 3: The player

**Files:**
- Create: `components/academy/video/VideoPlayer.tsx`, `ControlBar.tsx`, `ChapterMenu.tsx`, `TranscriptDrawer.tsx`, `useYouTube.ts`, `lib/academy/video-player.ts`
- Modify: `components/academy/blocks/VideoBlock.tsx`, `components/academy/useModuleProgress.ts`
- Test: `tests/academy-video-view.test.ts`, plus E2E

Rules, per §6.4 and the spec's module 1 and 2 build notes:
- **The page:** only the title, the estimated time and the player, which fills the column.
- **Embed:**
  - `youtube-nocookie.com` with `controls=0`, `cc_load_policy=1`, `rel=0`, `playsinline=1`
  - the API script loads once
  - if the player isn't ready within 10 seconds, show the coming-soon card with the summary and the line "The video couldn't load, so you can read this instead."; the rule falls back to scrolling
- **Control bar:**
  - play/pause
  - a scrubber with chapter ticks
  - elapsed and total time
  - a chapter menu
  - a captions toggle with a language picker from the player's tracks
  - a Transcript button
  - all labelled, with focus rings and keyboard support: space, arrow keys, Home, End
- **No skipping ahead on first viewing:** a seek past furthest plus 2 seconds snaps back; rewinding is fine; after completion seeking is free.
- **Reporting:** every 10 seconds while playing, and on pause, on end and on page hide.
- **Completion:**
  - at 95% call complete and show the end screen with one button, "Next: Module N"
  - if the server refuses, keep playing and retry on the next report
- **Deep links:** `?chapter=key` starts there, but never past furthest on first viewing.
- **Transcript drawer:** loads on open, uses the chosen language, closes with Escape and returns focus.

- [ ] **Step 1: Write the failing tests** for pure helpers in `lib/academy/video-player.ts`: `snapSeek(target, furthest, completed)`, `formatClock(seconds)`, `chapterAt(chapters, seconds)`, `tickPositions(chapters, duration)`.
- [ ] **Step 2: Run them to confirm they fail.**
- [ ] **Step 3: Build the player.** Use the `impeccable:impeccable` skill.
- [ ] **Step 4: Walk it in a browser** on the local DB with a short public test video, not company content. Check, at 1280px and 390px, and run axe:
  - play, rewind, a blocked forward seek, a chapter jump
  - captions on, a language switch, the transcript
  - completion, the end screen
  - resume after a reload
  - the fallback with the script blocked
- [ ] **Step 5: Run tests, `npx tsc --noEmit`, `npx next build`.**
- [ ] **Step 6: Commit.** `feat(academy): add the video player`

---

### Task 4: Quiz chapter links and Preview as

**Files:**
- Modify: `components/academy/quiz/ResultsScreen.tsx`, `lib/academy/service/quiz.ts`, `components/academy/hr/ModuleEditor.tsx`, `lib/academy/service/content.ts`
- Create: `app/api/admin/onboarding/content/[moduleId]/preview/route.ts`, `components/academy/hr/PreviewAs.tsx`
- Test: `tests/academy-preview.integration.test.ts`, extend the quiz service tests

Rules:
- **Chapter links:**
  - review items gain `chapterHref` only when Module 2's video is ready and has the question's `videoChapterKey`
  - the link is `/onboarding/culture-values?chapter=key`, shown as "Watch this part"
- **Preview as:**
  - HR picks the facts and sees the draft or live version rendered by the real block renderer
  - the server builds a synthetic context with no person; people show labelled samples
  - no event or completion calls
  - unknown placeholders are listed as a warning
  - HR only, `no-store`

- [ ] **Step 1: Write the failing tests:**
  - `chapterHref` only when ready and matched
  - preview writes no progress row
  - an employee gets 403
  - a PK preview of Module 11 shows `bank`, a contractor preview shows `payout`
  - a REMOTE preview with no country shows universal cards only
  - no real person's name appears
- [ ] **Step 2: Run them to confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, `npm run test:academy-db`, `npx tsc --noEmit`.**
- [ ] **Step 5: Commit.** `feat(academy): link quiz answers to chapters and add Preview as`

---

### Task 5: The most-missed report

**Files:**
- Create: `lib/academy/most-missed.ts`, `app/api/admin/onboarding/tracker/most-missed/route.ts`, `components/academy/hr/MostMissedPanel.tsx`
- Modify: the tracker screen
- Test: `tests/academy-most-missed.test.ts`, `tests/academy-most-missed.integration.test.ts`

**Interfaces:**
- `mostMissed(attempts, questions)` returns rows of `{ questionId, question, attempts, wrong, wrongRate, firstAttempts, firstWrong, retired }`, sorted by `wrongRate` descending.

Rules:
- Academy attempts only.
- Retired questions are kept and labelled.
- HR only.
- Fewer than 5 attempts shows "Not enough answers yet".

- [ ] **Step 1: Write the failing tests:**
  - rates are correct
  - first attempts are counted per person
  - retired questions are labelled
  - legacy attempts are ignored
  - the note shows under 5
  - an employee gets 403
- [ ] **Step 2: Run them to confirm they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and `npx tsc --noEmit`.**
- [ ] **Step 5: Commit.** `feat(academy): add the most-missed questions report`

---

### Task 6: Polish carried forward

- **Module 11 re-read:** a PK employee re-reading Module 11 doesn't see the bank form; it's hidden for non-COURSE rows.
- **Tracker drawer:**
  - `act` gets a ref guard against double clicks
  - reloads use a per-request counter
  - focus moves to the reason field and back
- **`PaymentDetailsScreen`:** clears stale errors and ignores responses for a closed row.
- **Labels:**
  - "30 days" from `FINISHED_WINDOW_DAYS`
  - the checklist bar's empty label is "No checklist yet"
  - the column reads "Overdue modules"
- **Quiz:**
  - submit gets a ref guard
  - Retake waits for the server's time
  - confetti spans are removed after the animation
- **Editor:**
  - plain formatting hints instead of `###` and `**`
  - refusal text shown once
  - blank table headers allowed
- **The mine endpoint** answers an empty list for any hire the viewer can't see, instead of 404.
- **`listAssignable`** uses one query.
- **Design pass** with the `impeccable:impeccable` skill over Home, the module page, the quiz, the completion screen and the tracker: spacing, type scale, empty states, 390px, contrast. Fix what it finds in Academy screens only. Shared tokens, such as the 4.4:1 primary button, go in the report and stay unchanged.

- [ ] **Step 1: Write tests** for each behaviour change that can be tested.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Walk the screens** at 1280px and 390px, and run axe.
- [ ] **Step 4: Run tests, `npx tsc --noEmit`, `npx next build`.**
- [ ] **Step 5: Commit.** `fix(academy): polish carried forward`

---

### Task 7: End-to-end check and go-live runbook

**Files:**
- Modify: `e2e/academy.spec.ts`, `tests/academy-course-flow.integration.test.ts`, the design, this plan
- Create: `docs/superpowers/runbooks/onboarding-academy-go-live.md`

- [ ] **Step 1: Extend the flow test:** with ready videos, a hire completes Modules 1 and 2 by reported progress and finishes the course.
- [ ] **Step 2: Extend E2E:**
  - the player completes with a public test video, skipped when YouTube is unreachable
  - "Watch this part" opens the chapter
  - Preview as renders for HR
  - the most-missed panel shows
- [ ] **Step 3: Write the runbook,** in order:
  - set `ONBOARDING_FIELD_ENCRYPTION_KEY` everywhere
  - check the lockout header and hourly cron on a preview build
  - dry-run, then run, `completeTestUsers`, and close legacy PENDING or ONBOARDING hires
  - run the seed once with its confirm flag against production
  - remove the flag checks, or turn the flag on, in the same release
  - smoke checks after deploy, and how to roll back

  Each production step is marked "needs the owner's go-ahead". The later cleanup push (legacy code, dead columns such as `maxQuizAttempts` and `OnboardingModule.content`) is a separate step. Rows are only deleted with the owner's say-so.
- [ ] **Step 4: Update the docs.** Add "After stage 5", including the bank letter.
- [ ] **Step 5: Run everything:**
  - `npx tsc --noEmit`
  - `npm test` with no DB env
  - `npm run test:academy-db`
  - `npm run test:e2e:academy` twice
  - `npx next build`
  - `prisma migrate diff`
- [ ] **Step 6: Commit.** `test(academy): cover video and polish end to end; add the go-live runbook`


## After stage 5

Stage 5 is built behind `ONBOARDING_ACADEMY_ENABLED`, like the stages before it. The go-live steps are in `docs/superpowers/runbooks/onboarding-academy-go-live.md`; each production step there is marked "Needs the owner's go-ahead". Nothing has been run against production.

**Needs the owner's go-ahead (the go-live push)**
- Set `ONBOARDING_FIELD_ENCRYPTION_KEY` on every environment.
- Check the lockout header (`x-compass-pathname`) on a preview build. The hourly `/api/cron/onboarding` job cannot be proven on a preview (Vercel runs crons on production only); its real check is the post-deploy smoke.
- Make a restore point first: a Neon branch of production, or a point-in-time-restore timestamp.
- Dry-run, then run, `completeTestUsers`; mark legacy PENDING or ONBOARDING hires COMPLETED, by approved id only.
- Run the seed once with `ONBOARDING_ACADEMY_ENABLED=true ONBOARDING_ACADEMY_SEED_CONFIRM=yes`.
- Turn the flag on, or remove the flag checks, in the same release, as the last action, with the deploy ready right after the seed. The flag stays in the code through stage 5 (ruling R1): deploying without the seed would lock hires out of an empty course.
- Rolling back: restore the Neon branch first; the hand-written reactivation of the retired rows is the fallback. The migrations only add. The seed deactivates legacy modules and questions rather than deleting them, so the flag off alone does not bring the old flow back after a seed.

**Open product items (not blocking)**
- The bank letter text, which the owner will send. Module 11 says "HR will share your bank letter" until then; the download needs a small build once the text exists.
- HR's correction of the checklist draft (design section 5.8).
- HR entering the videos, their lengths and transcripts. Until a video is ready, Modules 1 and 2 keep "Video coming soon" and scroll-to-end.
- The Key Contacts, which are seeded empty.

**Stage 5 rulings**
- R1: the flag is kept through stage 5 and its removal belongs to the go-live push with the seed and cutover, because deploying without the seed would lock hires out of an empty course.
- R2: HR types each video's duration because there is no YouTube API key; a wrong one only shifts the 95% point.
- R3: the watch clock stores `reportedAt` pushed by the spent tolerance, so the +15s tolerance cannot compound; `reportedAt` may run up to about 14s later than real.
- R4: each report counts at most 30s of real time, so an idle open tab cannot complete the video; a hire whose reports stop for a while must rewatch from where they stopped.
- R5: a ready video that will not load is unblocked by HR with a logged "Mark watched" in the tracker drawer, not by reading the transcript, because a read fallback is easy to game.
- R6: the videos editor warns when the player's real length differs from the typed length, because a wrong length strands hires on "Saving your progress".
- R7: the end screen waits for the video's actual end while completion is sent at 95%, so viewers still see the closing seconds.
- R8: Preview-as uses its own `preview` flag rather than `readOnly`, because `readOnly` shows saved values.
- R9: `listAssignable` keeps its per-person active check, because one query would need loosening the payroll guard (cost: a slower assign page with many staff).
- R10: Mark watched stores who, when and why on the progress row (3 nullable columns), so HR's override is traceable; the reopen path copies them into the history.

**Deferred items** (all minor, polish with no safety impact)

| Item | File |
|---|---|
| The length warning appears only after saving. Confirm before saving when the measured length does not match. | `components/academy/hr/VideoConfigForm.tsx` |
| "Saving your progress…" can sit unexplained when the server trails, such as a throttled background tab or a network gap. Add a second line after about 10s. | `components/academy/video/VideoPlayer.tsx` |
| If HR replaces a video with one of a different duration mid-watch, show "This video was updated. Reload to continue." | `components/academy/video/useVideoSession.ts` (`handleAnswer`) |
| `canOpenVideo` loads facts for all 14 rows on every transcript open. Filter to rows whose version has a video block. | `lib/academy/service/transcript.ts` |
| The real-YouTube E2E fails after 120s instead of skipping if the video is removed. Add a video probe, or set `E2E_YOUTUBE_ID`. | `e2e/academy-video.spec.ts` |
| The Preview-as E2E does not assert that switching work mode changed the content. | `e2e/academy.spec.ts` |

The final review confirmed that every deferred minor from stages 1 to 4 and the earlier stage-5 tasks was addressed in the stage 5 T6 and T7 commits.

**Test baseline.** `npm test` without DB env has 19 known failures outside the Academy: 18 in api-integration and 1 in rate-limit.

**Real-YouTube test video.** `e2e/academy-video.spec.ts` plays a third-party public video of about 48 seconds (`wwIt5ZvROrs`). It skips when YouTube is unreachable; if that video is removed, set `E2E_YOUTUBE_ID` and `E2E_YOUTUBE_SECONDS`. Its launch arg `--autoplay-policy=no-user-gesture-required` is scoped to that test and relaxes the browser, so the test does not prove a real user's first-click start.

**Cleanup push (separate, after go-live)**
- Remove the `ONBOARDING_ACADEMY_ENABLED` flag branches. Files that read `isAcademyEnabled` (from `lib/academy/flag.ts`) or the variable, found with `git grep -l "isAcademyEnabled\|ONBOARDING_ACADEMY_ENABLED"`:
  - `app/(evaluator)/onboarding/[moduleSlug]/page.tsx`
  - `app/(evaluator)/onboarding/complete/page.tsx`
  - `app/(evaluator)/onboarding/page.tsx`
  - `app/(evaluator)/onboarding/quiz/page.tsx`
  - `app/(hr)/admin/onboarding/academy/layout.tsx`
  - `app/(hr)/admin/onboarding/modules/page.tsx`
  - `app/(hr)/admin/onboarding/page.tsx`
  - `app/(hr)/admin/onboarding/quiz/page.tsx`
  - `app/(hr)/admin/onboarding/tracker/page.tsx`
  - `app/(oa)/oa/payment-details/page.tsx`
  - `app/api/admin/onboarding/quiz-attempts/reset/route.ts`
  - `app/api/admin/onboarding/quiz-questions/[id]/route.ts`
  - `app/api/admin/onboarding/quiz-questions/route.ts`
  - `app/api/admin/password/route.ts`
  - `app/api/admin/users/route.ts`
  - `app/api/onboarding/academy/assigned/route.ts`
  - `app/api/onboarding/academy/lost-equipment/route.ts`
  - `app/api/onboarding/modules/[id]/route.ts`
  - `app/api/onboarding/new-hires/[id]/route.ts`
  - `app/api/onboarding/progress/route.ts`
  - `app/api/onboarding/security-checklist/[newHireId]/route.ts`
  - `app/api/onboarding/team-lead-form/[newHireId]/route.ts`
  - `app/api/users/me/route.ts`
  - `e2e/academy-env.ts`
  - `lib/academy/flag.ts`
  - `lib/academy/http.ts`
  - `lib/academy/reminders.ts`
  - `lib/auth.ts`
  - `prisma/seed-academy.ts`
- Remove the legacy columns and where they are read:
  - `OnboardingConfig.maxQuizAttempts`: `app/api/onboarding/config/route.ts`, `app/(hr)/admin/onboarding/config/page.tsx`, `app/(evaluator)/onboarding/LegacyOnboardingHub.tsx`, `app/(evaluator)/onboarding/quiz/LegacyQuizPage.tsx`.
  - `OnboardingModule.content`: `app/(hr)/admin/onboarding/modules/LegacyModulesPage.tsx` and the write in `app/api/onboarding/modules/[id]/route.ts`.
- Remove the legacy onboarding code (the `Legacy*` pages above and the old routes they call).
- Delete rows only with the owner's say-so, set by set, after a read-only count.
