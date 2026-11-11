# Task 2 report: live summary and request form model

Files: lib/time-off/request-summary.ts, lib/time-off/request-form.ts (new); lib/leave-transition-plan.ts (MAX_ROWS -> exported MAX_TRANSITION_TASKS); tests/time-off-request-summary.test.ts, tests/time-off-request-form.test.ts.
Controller ruling applied: LEAVE_TYPE_LABEL re-exported from lib/leave-type-style (no new map). lib/time-off stays React-free.

TDD: first run of both new test files failed (modules missing). After implementing:
`node --import tsx --test tests/time-off-request-summary.test.ts tests/time-off-request-form.test.ts tests/leave-transition-plan.test.ts` -> tests 59, pass 59, fail 0.
`npx tsc --noEmit` -> clean (no output).

Parity: POST/PUT payload key order and values match leave/page.tsx lines 651-664 and 894-908 (tests assert key order, stale half-day values dropped for Annual, transitionPlan || undefined, end forced to start for half day). Dates use Date.UTC from keys; maths via lib/leave-utils.

Notes: payload does not send form.tasks (today's page doesn't either; tasks go through the separate plan flow). stepError step 2 task-limit message uses MAX_TRANSITION_TASKS (=50). Full unit suite not run (only targeted files + tsc).
