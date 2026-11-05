# Onboarding Academy — Stage 3 (Quiz and Completion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a hire finish the Academy: take the culture quiz, see their results, retake if needed, sign the values acknowledgement, and reach the completion screen with a downloadable certificate, at which point the lockout lifts and HR and the team lead are told.

**Architecture:** Same layout as stages 1 and 2: pure rules in `lib/academy/*`, DB access in `lib/academy/service/*`, thin routes under `app/api/onboarding/academy/**`, server pages that hand a plain view to client components. Grading, the answer key, the cooldown and completion all live on the server.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 / Postgres, TypeScript, Zod 4, PDFKit (already used by the repo), `framer-motion`, `node --test` with tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-02-onboarding-academy-design.md` (§5.5, §5.7, §6.5, §6.6, §7). Question bank and screens: `Compass Onboarding Academy_ Product Spec.docx` section 5 and section 6 screens 5 and 6, in the parent checkout, untracked. Read `docs/superpowers/plans/2026-11-05-onboarding-academy-payroll-separation.md` and "After stage 2" in the stage 2 plan.

**Branch:** `feat/onboarding-academy-stage-3`, cut from the tip of `feat/onboarding-academy-stage-2`, in the worktree with no `.env`.

## Global Constraints

- Every constraint in the earlier plans still applies: additive migrations, never the root `.env` (it is production), fictional test data, flag off means no change.
- **Onboarding never writes to payroll.** Nothing here imports `lib/payroll`, including for the certificate PDF. `tests/academy-payroll-separation.test.ts` must stay green.
- **No schema change is expected.** `OnboardingQuizQuestion`, `QuizAttempt`, `OnboardingAcknowledgement` and `OnboardingConfig` already hold what's needed.
- **The client never receives an answer key before submitting.** The paper has no `correctAnswer`, `explanation` or `valueKey`.
- **Retakes are never capped** (§14). `maxQuizAttempts` isn't read anywhere new.
- **Quiz copy is the spec's text, word for word.** The bold options in the Word file are the correct answers; the table in Task 1 records them.
- **Value colours are fills and strips with navy text**, never coloured text on white (§13).
- **Respect `prefers-reduced-motion`**, including confetti. Lucide icons at 24px, no emoji, phone-friendly, WCAG AA.

**Plan decisions (not in the design; correct them here if wrong):**
- **Two emails ship here, not stage 4,** because they're direct results of quiz events and need no cron: HR on each failure threshold crossing, and the completion notice. A failed email never fails the action.
- **"Once per threshold crossing"** means at every multiple of `failAlertThreshold` (3, 6, 9 failed attempts).
- **A passed hire can't resubmit.** The quiz is done once passed.
- **Chapter links wait for stage 5.** `videoChapterKey` is stored, but "Watch this part" shows only when the video exists, so stage 3 shows no link.
- **Certificate date** is the values acknowledgement's `signedAt`, the moment the course completed.
- **Quiz reset with the flag on:** it clears attempts, which lifts the cooldown, and changes nothing else. It's refused for a user who has finished onboarding.
- **HR downloads of acknowledgements** stay in stage 4 with the tracker.

## Review Focus

1. **Reading the answers from the network.** The paper response must hold no answer data, and a submission with a question missing, added or repeated must be refused. Pinned in Task 2.
2. **Beating the cooldown or double-submitting.** Two tabs, a double click, or a submit during the wait must not create a second attempt or skip the 15 minutes. Pinned in Task 2.
3. **HR changes the question set while a hire is mid-quiz.** The hire gets a clear message to start again, with no wrong score recorded. Pinned in Task 2.
4. **Completion out of order or twice.** Signing twice, a reload on the acknowledgement, or reaching the signature without a pass must not complete the course or send two emails. Pinned in Task 3.
5. **Someone else's certificate, or one not earned yet.** The certificate is served only to its owner, after completion. A name with unusual characters still produces a valid PDF. Pinned in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `lib/academy/quiz.ts` | `shuffled`, `toPaper`, `gradeAttempt`, `quizStatus`, `crossesFailThreshold`, submission schema, `VALUES_STATEMENT` |
| `prisma/seed-academy-quiz.ts` | The 12 questions, pure data |
| `lib/academy/service/quiz.ts` | `loadQuiz`, `submitQuiz`, `clearQuizAttempts` |
| `lib/academy/service/completion.ts` | `signValuesAcknowledgement`, `finishCourseIfDone`, `loadCompletion` |
| `lib/academy/certificate.ts`, `certificate-assets.ts` | Certificate PDF and embedded logo |
| `app/api/onboarding/academy/quiz/route.ts` | GET paper, POST submit |
| `app/api/onboarding/academy/quiz/acknowledgement/route.ts` | POST sign |
| `app/api/onboarding/academy/certificate/route.ts` | GET PDF |
| `components/academy/quiz/*` | Question screen, dots, results, cooldown, acknowledgement |
| `components/academy/CompletionScreen.tsx`, `Confetti.tsx` | Completion screen |
| `app/(evaluator)/onboarding/quiz/page.tsx`, `app/(evaluator)/onboarding/complete/page.tsx` | Pages |

---

### Task 1: Quiz rules and question bank

**Files:**
- Create: `lib/academy/quiz.ts`, `prisma/seed-academy-quiz.ts`
- Modify: `prisma/seed-academy.ts`
- Test: `tests/academy-quiz.test.ts`, extend `tests/academy-seed.integration.test.ts`

**Interfaces:**
- Produces:
  - `type StoredQuestion = { id: string; questionText: string; options: string[]; correctAnswer: string; explanation: string; valueKey: string | null; videoChapterKey: string | null }`
  - `shuffled<T>(items: readonly T[], random?: () => number): T[]`
  - `toPaper(questions: StoredQuestion[], random?: () => number): QuizPaper`, where `QuizPaper = { questions: Array<{ id: string; text: string; options: string[] }> }`
  - `submissionSchema`: `{ answers: Array<{ questionId: string; chosen: string }> }`, 1 to 50 entries
  - `gradeAttempt(questions, answers, passPercent): GradedAttempt`, which throws `AcademyError` 409 when the submitted IDs don't exactly match the active set, and 400 when a `chosen` isn't one of that question's options
  - `GradedAttempt = { score: number; total: number; passed: boolean; answersJson: AttemptAnswer[] }`; `AttemptAnswer = { questionId: string; chosen: string; correct: boolean; shownIndex: number }`
  - `quizStatus(input: QuizStatusInput): QuizStatus`
  - `crossesFailThreshold(failedCount: number, threshold: number): boolean`
  - `VALUES_STATEMENT`, exactly: `I have watched the culture video, passed the culture quiz, and I agree to follow the Plutus21 values and code of conduct.`

`QuizStatus` is one of: `LOCKED`; `READY`; `COOLDOWN`; `PASSED_UNSIGNED`; `DONE`. `QuizStatusInput = { modulesDone: boolean; latest: { passed: boolean; createdAt: Date } | null; valuesSigned: boolean; cooldownMinutes: number; now: Date }`. Also export `retakeAt(createdAt: Date, cooldownMinutes: number): Date`.

Question bank (text and options from spec section 5, in spec order):

| # | Correct answer starts | valueKey | videoChapterKey |
|---|---|---|---|
| 1 | Share the idea with your lead | innovation | innovation |
| 2 | Tell your lead straight away | integrity | integrity |
| 3 | Send them what they need now | collaboration | collaboration |
| 4 | Speed | speed | speed |
| 5 | Integrity | integrity | integrity |
| 6 | You are trusted to manage your own work | accountability | what-we-expect |
| 7 | Report it to HR | integrity | a-safe-place |
| 8 | Disclose it to HR. | integrity | how-we-treat-each-other |
| 9 | Let the organiser and team know | accountability | what-we-expect |
| 10 | Listen, ask questions | collaboration | how-we-treat-each-other |
| 11 | Respectfully disagreeing with your lead in a meeting | integrity | a-safe-place |
| 12 | Take it seriously, discuss it with your lead | clientCentric | client-centric |

`explanation` is the spec's "Why:" text without the "Why: " prefix. `valueKey` is a key of `VALUE_COLOURS`. Value and chapter assignments are our call where the spec doesn't name one; HR can change them in stage 4.

Seed: create a question when no row has the same `questionText`; never overwrite. `orderIndex` 1 to 12. Retiring legacy questions already runs first.

- [ ] **Step 1: Write the failing tests.**
  - Bank: 12 questions, each with 4 unique options, `correctAnswer` among them, a non-empty `explanation` with no "Why:", and a `valueKey` in `VALUE_COLOURS`.
  - `toPaper` output, stringified, has no `correctAnswer`, `explanation` or `valueKey` key; with a seeded `random`, questions and options are both reordered and nothing is lost.
  - `gradeAttempt`: 10 of 12 with pass 80 passes; 9 of 12 fails; all wrong is 0.
  - A missing question, an extra one, and a repeated one each give 409. An unknown option gives 400.
  - `quizStatus`: modules not done is LOCKED; failed 14 minutes ago with 15 is COOLDOWN; at exactly 15 minutes READY; passed and unsigned is PASSED_UNSIGNED; passed and signed is DONE. `retakeAt` is 15 minutes after `createdAt`.
  - `crossesFailThreshold`: 2→false, 3→true, 4→false, 6→true, 0→false.
  - Seed: the first run creates 12; a second creates 0; an edited explanation stays edited; retired legacy questions don't collide.
- [ ] **Step 2: Run them to confirm they fail.** `node --import tsx --test tests/academy-quiz.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Use a Fisher-Yates shuffle with `Math.random` as the default.
- [ ] **Step 4: Run the tests and `npm run test:academy-db`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add the culture quiz rules and questions`

---

### Task 2: Quiz service and routes

**Files:**
- Create: `lib/academy/service/quiz.ts`, `app/api/onboarding/academy/quiz/route.ts`
- Modify: `lib/email.ts`, `app/api/admin/onboarding/quiz-attempts/reset/route.ts`, `app/(hr)/admin/onboarding/quiz/page.tsx`, `lib/academy/lockout.ts`, `lib/academy/service/course.ts`, `lib/academy/view.ts`
- Test: `tests/academy-quiz-service.integration.test.ts`, extend `tests/academy-lockout.test.ts`

**Interfaces:**
- Consumes: Task 1; `listCourseModules`
- Produces:
  - `loadQuiz(db, userId): Promise<QuizView>`
  - `submitQuiz(db, userId, submission): Promise<{ result: QuizResultView; failAlertDue: boolean }>`
  - `clearQuizAttempts(db, userId): Promise<void>`
  - `QuizView = { status: QuizStatus; dueAt: string | null; paper: QuizPaper | null; lastResult: QuizResultView | null; retakeAt: string | null; failedCount: number }`
  - `QuizResultView = { score: number; total: number; passed: boolean; passPercent: number; review: Array<{ question: string; chosen: string; correctAnswer: string; correct: boolean; explanation: string; valueKey: string | null }> }`
  - `HomeView` gains `quiz: { status: QuizStatus; dueAt: string | null; overdue: boolean; retakeAt: string | null; failedCount: number }`
  - `sendQuizFailAlert(userId: string, failedCount: number)` in `lib/email.ts`, to HR recipients

Rules:
- `loadQuiz` needs a released course (`buildAcademyContext`), otherwise 404. `paper` is set only in `READY`. `lastResult` is the latest attempt, resolved through its stored question IDs, so retired questions still show; it's null before any attempt.
- `submitQuiz` runs in one transaction with `COURSE_TX_OPTIONS`. It takes `SELECT id FROM "User" WHERE id = $1 FOR NO KEY UPDATE`, re-reads status under that lock, and refuses anything but `READY`: 403 "Finish all 14 modules first." for `LOCKED`; 409 "You can retake the quiz after {time}." for `COOLDOWN`; 409 "You've already passed." otherwise. It reads active questions (`isActive`, `retiredAt` null) and pass percent from config, grades, and creates the attempt.
- A changed question set gives 409 "The quiz has been updated. Please start again."
- `failAlertDue` is true when this attempt failed and `crossesFailThreshold(failed count, config.failAlertThreshold)`. The route sends `sendQuizFailAlert` after commit; a failed email is logged and doesn't fail the response.
- The GET and POST use `requireAcademySession`; POST uses `guardAcademyMutation`. Responses use the `{ success, ... }` envelope with `Cache-Control: no-store`.
- `clearQuizAttempts`: 409 "This person has finished onboarding." when `onboardingCompleted` is true; otherwise it deletes their attempts and changes nothing else. The reset route calls it when `isAcademyEnabled()`, and keeps its existing code path with the flag off, including setting `onboardingCompleted` false. Simplify `quizResetUserData` away if that leaves it unused.
- HR quiz page, flag on only: heading text "Manage onboarding quiz questions and clear a hire's quiz attempts." and toast "Quiz attempts cleared". Read how the page can learn the flag from existing layout data. Flag off: unchanged.
- `/api/onboarding/academy/quiz` is already covered by the lockout allowlist; add a test that says so.

- [ ] **Step 1: Write the failing integration tests.**
  - Modules unfinished: GET gives `LOCKED` with no paper; POST gives 403.
  - GET in `READY`: `JSON.stringify` of the view contains no key named `correctAnswer` and none of the 12 explanations.
  - A passing submission stores an attempt whose `answersJson` has 12 rows with `chosen`, `correct`, `shownIndex`, and returns a full review with explanations.
  - After a failure: status `COOLDOWN`, and a POST gives 409 with no new attempt. With `createdAt` moved back 15 minutes it's `READY` again.
  - Two concurrent POSTs (`Promise.all`) create exactly one attempt; the other gets 409.
  - Third failure: `failAlertDue` true; fourth: false; sixth: true.
  - Deactivating a question between GET and POST gives 409 "The quiz has been updated. Please start again." with no attempt saved.
  - A retired question still resolves in `lastResult`.
  - `clearQuizAttempts` lifts the cooldown, leaves `onboardingCompleted` and `NewHire.status` unchanged, and is refused for a completed user.
- [ ] **Step 2: Run them to confirm they fail.** Use the local DB. Expected: FAIL, module not found.
- [ ] **Step 3: Implement the service, routes, email and reset changes.**
- [ ] **Step 4: Run `test:academy-db`, the lockout tests and `npx tsc --noEmit`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): add quiz attempts, grading and retakes`

---

### Task 3: Values acknowledgement, completion and certificate

**Files:**
- Create: `lib/academy/service/completion.ts`, `lib/academy/certificate.ts`, `lib/academy/certificate-assets.ts`, `app/api/onboarding/academy/quiz/acknowledgement/route.ts`, `app/api/onboarding/academy/certificate/route.ts`
- Modify: `lib/academy/service/fields.ts`, `next.config.js`
- Test: `tests/academy-completion-service.integration.test.ts`, `tests/academy-certificate.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2
- Produces:
  - `signValuesAcknowledgement(db, userId, typedName): Promise<{ signedAt: Date; completed: boolean }>`
  - `finishCourseIfDone(tx, userId): Promise<boolean>`
  - `loadCompletion(db, userId): Promise<CompletionView | null>`, where `CompletionView = { name: string; preferredName: string; completedAt: string }`
  - `buildCertificatePdf(input: { name: string; completedOn: string }): Promise<Buffer>`
  - `pdfSafeName(name: string): string`
  - `isTypedNameValid(typedName, name)`, exported from `fields.ts` and shared with the Security acknowledgement

Rules:
- `signValuesAcknowledgement` runs in one transaction, taking the same user row lock as `submitQuiz`. It requires a passed attempt, or 403 "Pass the culture quiz first." It checks the name with the same message as the Security acknowledgement, and stores `kind: VALUES_CODE_OF_CONDUCT`, `statementText: VALUES_STATEMENT`, `moduleVersionId: null`, `typedName: user.name`. Signing twice keeps the first row. It then calls `finishCourseIfDone`.
- `finishCourseIfDone` sets `User.onboardingCompleted = true` and `NewHire.status = COMPLETED` only when all 14 course rows are COMPLETED, a passed attempt exists, and both acknowledgements exist. It returns true only on the call that changed `onboardingCompleted`.
- The route sends `sendOnboardingCompletedNotification(userId)` after commit, only when `completed` is true. A failed email is logged and doesn't fail the response.
- `loadCompletion` returns null unless `onboardingCompleted` is true and a values acknowledgement exists. `completedAt` is its first `signedAt`.
- Certificate: A4 landscape, PDFKit with built-in fonts, the logo at top, "Certificate of Completion", "This certifies that", the name, "has completed the Plutus21 Onboarding Academy", and the date formatted like "4 December 2026". Use Plutus Blue and Deep Navy.
- Keep the logo as base64 in `certificate-assets.ts`, generated from `public/images/logo.png`, because serverless bundles don't reliably include `public/`. `lib/payroll/payslip-assets.ts` explains this pattern; follow it without importing it.
- `pdfSafeName` keeps Latin-1 characters, because PDFKit's built-in fonts can't draw others, and removes the rest. If no letters are left it returns "Plutus21 team member", so a PDF always results.
- Add `/api/onboarding/academy/certificate` to `outputFileTracingIncludes` for PDFKit's data files, as the payslip route does.
- The certificate route uses `requireAcademySession`, gives 404 when `loadCompletion` is null, and responds `application/pdf`, `Content-Disposition: attachment; filename="plutus21-academy-certificate.pdf"`, `no-store`. It takes no user ID.

- [ ] **Step 1: Write the failing tests.**
  - Signing with no pass gives 403 and no row.
  - Wrong name gives the name message.
  - Pass plus all rows plus Security signed: `completed` true, `onboardingCompleted` true, `NewHire.status` COMPLETED, and `Benefit` count unchanged.
  - Missing Security acknowledgement: signed, `completed` false, user still locked.
  - Signing twice: one row, first `signedAt` kept, second call `completed` false.
  - Two concurrent signatures: one row, exactly one `completed` true.
  - `loadCompletion` is null before completion and for an existing employee with no course.
  - `buildCertificatePdf` returns a Buffer starting `%PDF-`, for "Cara Lindqvist", for "Zoë Ñandú", and for a name of only non-Latin characters.
  - `pdfSafeName('زارا')` gives `'Plutus21 team member'`; `pdfSafeName('Zoë')` gives `'Zoë'`.
- [ ] **Step 2: Run them to confirm they fail.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, `npx tsc --noEmit` and `tests/academy-payroll-separation.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(academy): finish the course with the values acknowledgement and certificate`

---

### Task 4: Quiz and completion screens

**Files:**
- Create: `components/academy/quiz/QuizFlow.tsx`, `QuestionScreen.tsx`, `ProgressDots.tsx`, `ResultsScreen.tsx`, `CooldownPanel.tsx`, `ValuesAcknowledgement.tsx`, `ScoreRing.tsx`; `components/academy/CompletionScreen.tsx`, `components/academy/Confetti.tsx`; `app/(evaluator)/onboarding/complete/page.tsx`
- Modify: `app/(evaluator)/onboarding/quiz/page.tsx`, `components/academy/AcademyHome.tsx`, `lib/academy/view-labels.ts`, `app/(evaluator)/onboarding/page.tsx`
- Test: `tests/academy-quiz-view.test.ts`

**Interfaces:**
- Consumes: `loadQuiz`, `loadCompletion`, the Task 2 and 3 routes
- Produces: `quizCardCopy(quiz): { label: string; chip: string | null; href: string | null }` in `lib/academy/view-labels.ts`

Rules, per spec section 5 and section 6 screens 5 and 6:
- Quiz page: server component. Flag off renders `LegacyQuizPage`, unchanged. Flag on with no released course redirects to `/onboarding`; `LOCKED` redirects to `/onboarding`; `DONE` redirects to `/onboarding/complete`.
- One question per screen, 12 dots, answers as large tappable cards using `radio` semantics, with Back and Next. Answers live in client state until submitted; a reload starts again.
- Results: score in a large ring, pass or retry, and each question with the right answer and its explanation beside a strip in the value's colour. Text stays navy.
- A pass goes on to the acknowledgement: navy panel, the statement, a checkbox, a full-name field and today's date filled in. After signing, go to `/onboarding/complete`.
- A failure shows the results and a retake button once the wait is over, with a live countdown. The server stays the authority; a 409 shows its message.
- A hire who passed but hasn't signed returns to the acknowledgement.
- The Final Step card on Home uses `quizCardCopy`:
  - `LOCKED` → "Finish all 14 modules first" (no link)
  - `READY` → "Start", or "Retake" when `failedCount > 0`; links to the quiz
  - `COOLDOWN` → "Retake after {time}", links to the quiz, where the results stay readable
  - `PASSED_UNSIGNED` → "Sign your acknowledgement"
  - `DONE` → "Completed"
  - overdue adds "Overdue" on any state but `DONE`.
  Remove `QUIZ_PLACEHOLDER`.
- When `onboardingCompleted` is true and a course exists, `/onboarding` redirects to `/onboarding/complete`.
- Completion: full-width blue screen, "WELCOME TO THE Journey" in the headline pattern, the line "You are not just starting a new job. You are joining a team that believes in you.", a "Download your certificate" button linking to the certificate route, and a "Go to Compass" link to `/dashboard`.
- Confetti: `framer-motion` only, no new dependency, plays once per browser using a `localStorage` key that includes the user ID, and never with `prefers-reduced-motion`.
- After signing, do a full navigation to `/onboarding/complete`, so the layout re-reads `onboardingCompleted` and the full sidebar returns.
- Use the `impeccable:impeccable` skill for the visual pass. Reuse `components/academy/brand.ts` and match Home and the module page.

- [ ] **Step 1: Write the failing test** for `quizCardCopy` across every status, with and without overdue, and with and without a previous attempt.
- [ ] **Step 2: Run it to confirm it fails.** Expected: FAIL.
- [ ] **Step 3: Build the screens.**
- [ ] **Step 4: Walk it in a browser** with Playwright at 1280px and 390px against the local DB: pass, fail with countdown, retake, sign, completion, certificate download, reload at each stage. Run axe at both widths. Expected: no failures and no violations in Academy content.
- [ ] **Step 5: Run the tests, `npx tsc --noEmit` and `npx next build`.** Expected: PASS.
- [ ] **Step 6: Commit.** `feat(academy): add the quiz and completion screens`

---

### Task 5: End-to-end check and carry-forward

**Files:**
- Modify: `e2e/academy.spec.ts`, `tests/academy-course-flow.integration.test.ts`, this plan, the stage 2 plan, the design

- [ ] **Step 1: Extend the flow test.** After Module 14: fail twice, move `createdAt` back to clear the wait, pass, sign, and assert `onboardingCompleted` true, `NewHire.status` COMPLETED, `shouldBlockSession` false for the user, and payroll profile count unchanged. Do this for the PK hire and the contractor.
- [ ] **Step 2: Extend the E2E spec,** which also serves as the route-level tests stage 2 carried forward, because routes have no session seam:
  - a hire passes the quiz, signs, sees the completion screen, downloads a PDF, and then reaches `/dashboard`
  - a fail shows the wait
  - anonymous requests to the new routes get 401
  - a non-HR `POST` to the release route is refused
  - the certificate route gives 404 for a hire who hasn't finished
  - a unit test of `requireAcademySession` shows new routes give 404 with the flag off
- [ ] **Step 3: Update the docs.** Move finished items out of "After stage 2", and add "After stage 3" with what remains: HR acknowledgement downloads, the quiz editor keeping `explanation` (the legacy HR quiz page can blank it, and a blank explanation lets a re-seed retire the question), most-missed report, chapter links in stage 5, and `maxQuizAttempts` for the cleanup push. Record the plan decisions above in the design.
- [ ] **Step 4: Run everything.** `npx tsc --noEmit`, `npm test` with no DB env, `npm run test:academy-db`, `npm run test:e2e:academy`, `npx next build`, and `prisma migrate diff`. Expected: tsc clean, academy tests pass, the same 19 baseline failures, E2E passes, build passes, empty diff.
- [ ] **Step 5: Commit.** `test(academy): cover the quiz and completion end to end`
