# Employee UX refresh, part 2: frame — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every signed-in page sits in one frame: a grouped employee menu, a top bar with search (Ctrl K / ⌘K), a notification bell, the theme toggle and an avatar menu, no splash screen, one page container and one page header on employee pages, and a new People page (My team plus a company map).

**Architecture:** The menus become data plus one pure resolver (`resolveSidebarConfig`) that `SidebarLayout` and the search palette both use, so the sidebar and the palette's "Pages" group cannot disagree. Search is one new endpoint (people, handbook, your work); pages are matched in the browser from the menus the shell already resolved. The bell reads a new additive `UserNotification` table, written next to the existing email sends, merged with `SecurityNotification`. The People page reuses `/api/users/team` and `buildHierarchyOrgChartScene` from `lib/org-chart.ts` through a new employee endpoint that only ever carries TEAM_LEAD lines.

**Tech Stack:** Next.js 16 App Router, React 18, Prisma 5 / Postgres, Tailwind with the tokens in `app/globals.css`, Radix-based `components/ui/*`, `cmdk` 1.1 (already installed), `reactflow` 11 (already installed), sonner, zod, Node test runner (`node --import tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-11-employee-ux-refresh-design.md` — Decisions 1, 2, 3, 6 and 7 (container and header), Delivery part 2, and the appendix checklist. Part 1 (`lib/format-date.ts`, `lib/format-count.ts`) is already on this branch and is reused here.

## Global Constraints

- Work only in the worktree `C:\Users\PC\Desktop\PE Portal\.worktrees\ux-refresh` (branch `feat/ux-refresh`). Commit after each task; never push.
- Commit messages: conventional (`feat:`, `fix:`, `test:`, `refactor:`) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No rebrand.** Keep Compass's current colours, fonts (DM Sans, Instrument Serif) and dark mode. New UI uses existing tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary/10` …), never new hex colours.
- **Admin, OA, Security, Security-Checks console and Execution menus keep every item and their order**; only the visual grouping style changes. `ONBOARDING_SIDEBAR` and the onboarding lockout (`shouldRedirectLockedPage`, `lib/academy/lockout.ts`) are unchanged. The Onboarding Academy (`/onboarding/*`) keeps its own look.
- Footer role switches (Admin Console / Employee View, Payroll (O&A) / Employee View, Security Console / Employee View), the collapse toggle saved in `localStorage` key `sidebar-collapsed`, and the mobile menu sheet stay exactly as today.
- Search, People and the company map never expose: evaluation relationships other than TEAM_LEAD, payroll, bank details, assets of other people, email addresses, roles, or any private field. People results carry only `id`, `name`, `position`, `department`, `href`.
- Company map = TEAM_LEAD reporting lines only (owner confirmed every TEAM_LEAD mapping is a true reporting line); Plutus21 people only; 3E viewers get no Company map tab and the endpoint answers 404 for them. `app/api/admin/org-chart/route.ts` and `app/(hr)/admin/org-chart/page.tsx` are not changed.
- "Active person" everywhere in this part = the existing rule in `/api/users/team` and the admin org chart: no payroll profile, or `isPayrollActive: true`.
- Migration is additive only: one new table `UserNotification` (plus the back-relation field on `User`, which adds no SQL to `User`).
- **Never run anything against the root `.env` database (production).** The worktree has no `.env`; keep it that way. Local test DB only: embedded Postgres on port 5433, user/password `compass`, database `compass_weekly_test`. Start it with
  `"C:/Users/PC/Desktop/PE Portal/.worktrees/ai-evaluations-archive/.pilot-tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe" -D "C:/Users/PC/Desktop/PE Portal/.worktrees/.academy-pg" -o "-p 5433" start`.
  It was built with `prisma db push`, so the migration SQL is produced with `prisma migrate diff` (datamodel to datamodel), never `migrate dev`.
- Unit tests: `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — baseline is **19 known failures (18 api-integration, 1 rate-limit)** and must stay at exactly that baseline.
- DB tests: `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 <files>`. New DB test files are named `*.integration.test.ts`, gate on `WEEKLY_DB_TEST` from `tests/helpers/weekly-test-db.ts`, use id prefixes unique to the file (listed per task), clean up only their own rows, and assert only on their own rows (other suites leave users in this database).
- Test data is fictional (the repository is public). Use invented names like those in `tests/helpers/weekly-test-db.ts`.
- No browser `alert`, `confirm` or `prompt`; use `components/ui/confirm-dialog.tsx` / `dialog.tsx`.
- Files stay under 800 lines. Do not grow files that are already over 800 (`components/projects/ProjectsWorkspace.tsx`, `app/(evaluator)/projects/[id]/page.tsx`, `app/(evaluator)/profile/page.tsx`): edits there are swaps, net line count must not rise.
- Dates in new UI use `lib/format-date.ts` (`formatDate`, `formatDateRange`, `formatDateTime`); counts use `lib/format-count.ts`. No bare `toLocaleDateString()`.
- No email changes: no email template, recipient or send changes. `lib/email.ts` is not edited. Bell rows are written beside existing sends, never instead of them.
- The machine's disk is nearly full: do not install packages and do not run a full `next build`. Type-check with `npx tsc --noEmit`.
- A GateGuard hook may block the first Write of a new file and ask for facts. Answer with the callers, that no duplicate exists, the data it handles, and the user's instruction: "lets finish all parts and open a PR alltogether". Then retry the identical call.

## Review Focus

1. **A Plutus21 person with no department** (`department: null`) must appear in Plutus21 search results and on the company map; a "not 3E" filter written as `NOT { department: '3E' }` silently drops NULLs in SQL. → Task 5 `null-department people are on the map`, Task 9 `people search keeps null-department colleagues`.
2. **Old page names typed into search** ("leave", "my tasks", "device support", "clientele", "org chart", "directory") must still find the renamed pages. → Task 10 `old names find renamed pages`.
3. **A hire still in onboarding** must see the onboarding menu only, must not trigger search or bell requests (the lockout answers 401 for them), and `/people` must send them to `/onboarding`. → Task 2 `locked hires keep the onboarding menu` and wiring test; Task 11 `top bar hides search and bell for a locked hire`.
4. **A failing bell insert must never fail a leave/WFH decision, the transition-plan cron or a weekly email run.** → Task 6 `recordNotificationsSafely logs and swallows`; Task 7 wiring test that every write point uses the safe helper after the state change.
5. **Messy TEAM_LEAD data** — a cycle (A leads B, B leads A), a self-mapping, duplicate rows, or two leads for one person — must not hang or crash the map, and each person appears exactly once. → Task 5 `company map survives cycles, self links and two leads`.

---

### Task 0: Worktree baseline (no commit)

- [ ] Confirm `next-env.d.ts` exists in the worktree root (part 1 copied it). If missing, copy it from `C:\Users\PC\Desktop\PE Portal\next-env.d.ts`.
- [ ] Confirm there is no `.env` in the worktree root (`ls -a`). If one exists, stop and ask.
- [ ] Run `npx tsc --noEmit`. Expected: no errors.
- [ ] Run `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test`. Expected: exactly 19 failures (18 api-integration, 1 rate-limit). Record the number.
- [ ] Start the local DB (command in Global Constraints) and run `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/weekly-notifications.integration.test.ts`. Expected: all pass. This proves the DB is reachable before Task 6 needs it.

---

### Task 1: Grouped menu model and one resolver

Moves the menu data out of the client component into a plain module, adds groups and a pinned section, and turns the inline pipeline in `SidebarLayout` into one pure, tested function.

**Files:**
- Create: `components/layout/sidebar-config.ts` (no `'use client'`; imports `lucide-react` icons)
- Modify: `components/layout/sidebar-nav.ts` (helpers become group/pinned aware; add `withExecutionNav`; `withOaPaymentNav` appends to Work)
- Modify: `components/layout/AppSidebar.tsx` (delete the four config constants and the type definitions; `export type { NavItem, NavGroup, SidebarConfig } from './sidebar-config'` and `export { EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR, ADMIN_SIDEBAR } from './sidebar-config'` so existing imports keep compiling)
- Modify: the six route-group layouts `app/(evaluator)/layout.tsx`, `app/(execution)/layout.tsx`, `app/(hr)/layout.tsx`, `app/(oa)/layout.tsx`, `app/(security)/layout.tsx`, `app/(security-checks)/layout.tsx` — import configs from `@/components/layout/sidebar-config`
- Test: `tests/sidebar-config.test.ts` (new); `tests/sidebar-nav.test.ts` (extend)

**Interfaces:**
- Produces (`components/layout/sidebar-config.ts`):
  - `interface NavItem { label: string; href: string; icon: LucideIcon; badge?: string | number; activePrefix?: string; keywords?: readonly string[] }`
  - `interface NavGroup { label: string; items: NavItem[]; defaultOpen?: boolean; collapsible?: boolean }` — `collapsible` defaults to `true` (admin behaviour); employee groups set `false`.
  - `type SidebarConfig = { items: NavItem[]; groups: NavGroup[]; pinned?: NavItem[] }`
  - `EMPLOYEE_SIDEBAR`, `ONBOARDING_SIDEBAR`, `SECURITY_SIDEBAR`, `ADMIN_SIDEBAR: SidebarConfig`
  - `interface MenuContext { role: string | null | undefined; hasClientele: boolean; weekly: { enabled: boolean; openCount: number }; securityChecks: SecurityChecksNavAccess }`
  - `resolveSidebarConfig(base: SidebarConfig, ctx: MenuContext): SidebarConfig` — the non-onboarding pipeline, in today's order.
  - `resolveLockedSidebarConfig(onboarding: SidebarConfig): SidebarConfig` — `withLockedHandbookNav(onboarding, BookOpen)`.
  - `flattenNav(config: SidebarConfig): NavItem[]` — items, then each group's items in order, then pinned.
  - `interface SearchPage { label: string; href: string; section: string; keywords: readonly string[] }`
  - `searchablePages(current: SidebarConfig, ctx: MenuContext): SearchPage[]`
- Produces (`components/layout/sidebar-nav.ts`, existing names, new reach): `withItemPatched`, `withItemReplaced`, `withItemAfter` find their target in `items`, any group, or `pinned`; `withExecutionNav(config: SidebarConfig, show: boolean, icon: NavItem['icon']): SidebarConfig`.

The exact employee menu (labels, hrefs, icons, keywords):

| Section | Label | href | icon | keywords |
|---|---|---|---|---|
| group You (`collapsible: false`) | Home | `/dashboard` | Home | `['dashboard']` |
| | Time off | `/leave` | Calendar | `['leave','holiday','wfh','work from home','vacation']` |
| | Evaluations | `/evaluations/weekly` (`activePrefix: '/evaluations'`) | ClipboardCheck | `['weekly','questions','review']` |
| group Work (`collapsible: false`) | My work | `/my-tasks` | CheckSquare | `['my tasks','tasks','to do']` |
| | Projects | `/projects` | FolderKanban | `['tasks','sprints']` |
| group Company (`collapsible: false`) | People | `/people` | Users | `['team','directory','org chart','company map']` |
| | Handbook | `/handbook` | BookOpen | `['policies','company dashboard']` |
| | Office | `/office` | Building2 | `['virtual office']` |
| pinned | Help & IT | `/device-support` | Monitor | `['device support','tickets','assets','equipment','security']` |
| | Profile | `/profile` | User | `['account','password']` |

`resolveSidebarConfig` steps, in this order (each is today's rule from `SidebarLayout.tsx` lines 160–205 and `AppSidebar.tsx` lines 300–312):
1. `isAdminConsole` = any href in items or groups starts with `/admin`.
2. Clients: when `ctx.hasClientele && !isAdminConsole` → `withItemAfter(config, { label: 'Clients', href: '/clientele', icon: Handshake, keywords: ['clientele','clients'] }, '/projects')`.
3. Weekly (when `ctx.weekly.enabled`): admin → `withGroupItem(config, 'Performance', { label: 'Evaluation round', href: '/admin/evaluation-round', icon: CalendarCheck }, 'start')`; otherwise `withItemPatched(config, '/evaluations/weekly', openCount > 0 ? { badge: openCount } : {})`.
4. `withSecurityChecksNav(config, ctx.securityChecks, ShieldCheck)`. When it replaces `/device-support` the entry's label is `'Help & IT'` (keeping the pinned item's keywords); when it replaces `/security/device-tickets` it stays `'Security'`; under the admin Operations group it stays `'Security'`.
5. `withAcademyNav(config, { library: BookOpen, contacts: Users, links: Link2, videos: Clapperboard })`.
6. `withExecutionNav(config, ctx.role === 'EXECUTION', Wallet)` → `{ label: 'Subscription Management', href: '/execution/subscriptions' }` appended to the Work group (no-op without a Work group or when already present).
7. `withOaPaymentNav(config, ctx.role === 'OA', CreditCard)` → now appends `{ label: 'Payment details', href: '/oa/payment-details' }` to the Work group.

`searchablePages`: union, first occurrence of an href wins, of `flattenNav(current)`, `flattenNav(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx))`, the role's console (`HR` → `resolveSidebarConfig(ADMIN_SIDEBAR, ctx)`, `SECURITY` → `resolveSidebarConfig(SECURITY_SIDEBAR, ctx)`), and the footer destinations (`HR`: `Admin Console` `/admin`; `OA`: `Payroll (O&A)` `/oa/payroll`; `SECURITY`: `Security Console` `/security`). `section` is the group label, `'Pinned'` for pinned items, `''` for top-level items, `'Console'` for footer destinations; `keywords` defaults to `[]`.

- [ ] **Step 1: Write the failing tests** in `tests/sidebar-config.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_SIDEBAR, EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR,
  flattenNav, resolveLockedSidebarConfig, resolveSidebarConfig, searchablePages,
  type MenuContext, type SidebarConfig,
} from '../components/layout/sidebar-config'

const base: MenuContext = { role: 'EMPLOYEE', hasClientele: false, weekly: { enabled: false, openCount: 0 }, securityChecks: { enabled: false, console: false } }
const ctx = (patch: Partial<MenuContext>): MenuContext => ({ ...base, ...patch })
const shape = (c: SidebarConfig) => ({
  items: c.items.map((i) => i.href),
  groups: c.groups.map((g) => [g.label, ...g.items.map((i) => i.label)]),
  pinned: (c.pinned ?? []).map((i) => i.label),
})
const hrefs = (c: SidebarConfig) => flattenNav(c).map((i) => i.href)

test('the employee menu is grouped You, Work, Company with Help & IT and Profile pinned', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base)), {
    items: [],
    groups: [['You', 'Home', 'Time off', 'Evaluations'], ['Work', 'My work', 'Projects'], ['Company', 'People', 'Handbook', 'Office']],
    pinned: ['Help & IT', 'Profile'],
  })
})

test('every page the old employee menu linked to is still there', () => {
  const now = hrefs(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base))
  for (const href of ['/dashboard', '/my-tasks', '/evaluations/weekly', '/leave', '/projects', '/device-support', '/office', '/handbook', '/profile']) assert.ok(now.includes(href), href)
})

test('Clients follows Projects only with clientele access', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ hasClientele: true }))).groups[1], ['Work', 'My work', 'Projects', 'Clients'])
  assert.ok(!hrefs(resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', hasClientele: true }))).includes('/clientele'))
})

test('Evaluations carries the open count, and no badge at zero', () => {
  const find = (c: SidebarConfig) => flattenNav(c).find((i) => i.href === '/evaluations/weekly')
  assert.equal(find(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ weekly: { enabled: true, openCount: 3 } })))?.badge, 3)
  assert.equal(find(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ weekly: { enabled: true, openCount: 0 } })))?.badge, undefined)
})

test('with Security Checks on, Help & IT opens /security-checks', () => {
  const pinned = resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ securityChecks: { enabled: true, console: false } })).pinned ?? []
  assert.deepEqual(pinned.map((i) => [i.label, i.href]), [['Help & IT', '/security-checks'], ['Profile', '/profile']])
})

test('O&A get Payment details and EXECUTION gets Subscription Management at the end of Work', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'OA' }))).groups[1], ['Work', 'My work', 'Projects', 'Payment details'])
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'EXECUTION', hasClientele: true }))).groups[1], ['Work', 'My work', 'Projects', 'Clients', 'Subscription Management'])
})

test('locked hires keep the onboarding menu', () => {
  assert.deepEqual(hrefs(resolveLockedSidebarConfig(ONBOARDING_SIDEBAR)), ['/onboarding', '/handbook', '/profile'])
})

test('the admin console keeps every item in today\'s order', () => {
  const c = resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', weekly: { enabled: true, openCount: 2 }, securityChecks: { enabled: true, console: true } }))
  assert.deepEqual(hrefs(c), [
    '/admin', '/admin/users', '/admin/org-chart',
    '/admin/evaluation-round', '/admin/settings', '/admin/reports',
    '/admin/clients', '/admin/leave', '/admin/device-tickets', '/admin/assets', '/admin/payroll', '/admin/subscriptions', '/office', '/admin/handbook', '/security-checks',
    '/admin/onboarding', '/admin/onboarding/positions', '/admin/onboarding/new-hires', '/admin/onboarding/academy/modules', '/admin/onboarding/academy/quiz', '/admin/onboarding/benefits', '/admin/onboarding/config',
    '/admin/onboarding/academy/library', '/admin/onboarding/academy/contacts', '/admin/onboarding/academy/links', '/admin/onboarding/academy/assign', '/admin/onboarding/academy/checklist', '/admin/onboarding/academy/videos',
    '/admin/analytics', '/admin/employee-360',
  ])
  assert.deepEqual(c.groups.map((g) => [g.label, g.collapsible ?? true, g.defaultOpen ?? false]), [
    ['People', true, true], ['Performance', true, true], ['Operations', true, false], ['Onboarding', true, false], ['Insights', true, false],
  ])
})

test('the security console keeps its items; Security takes Device Tickets\' place', () => {
  assert.deepEqual(hrefs(resolveSidebarConfig(SECURITY_SIDEBAR, ctx({ role: 'SECURITY' }))), ['/security', '/security/device-tickets', '/security/assets', '/security/onboarding', '/office', '/profile'])
  const on = flattenNav(resolveSidebarConfig(SECURITY_SIDEBAR, ctx({ role: 'SECURITY', securityChecks: { enabled: true, console: true } })))
  assert.deepEqual(on.map((i) => i.label), ['Home', 'Security', 'Assets', 'Onboarding', 'Office', 'Profile'])
})

test('the shared configs are never mutated', () => {
  const before = JSON.stringify([EMPLOYEE_SIDEBAR, ADMIN_SIDEBAR, SECURITY_SIDEBAR].map(hrefs))
  resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'EXECUTION', hasClientele: true, weekly: { enabled: true, openCount: 1 }, securityChecks: { enabled: true, console: true } }))
  resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', weekly: { enabled: true, openCount: 1 }, securityChecks: { enabled: true, console: true } }))
  assert.equal(JSON.stringify([EMPLOYEE_SIDEBAR, ADMIN_SIDEBAR, SECURITY_SIDEBAR].map(hrefs)), before)
})

test('search pages cover the employee menu, the role console and the footer switch, each once', () => {
  const hr = ctx({ role: 'HR' })
  const pages = searchablePages(resolveSidebarConfig(ADMIN_SIDEBAR, hr), hr)
  const all = pages.map((p) => p.href)
  assert.equal(new Set(all).size, all.length)
  for (const href of ['/admin/users', '/leave', '/people', '/admin']) assert.ok(all.includes(href), href)
  assert.equal(pages.find((p) => p.href === '/leave')?.section, 'You')
  const employee = searchablePages(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base), base).map((p) => p.href)
  assert.ok(!employee.some((h) => h.startsWith('/admin') || h.startsWith('/security')))
})
```

  Extend `tests/sidebar-nav.test.ts` with:

```ts
test('helpers reach group and pinned items', () => {
  const grouped: SidebarConfig = { items: [], groups: [{ label: 'Work', items: [item('/my-tasks'), item('/projects')] }], pinned: [item('/device-support')] }
  assert.deepEqual(withItemAfter(grouped, item('/clientele'), '/projects').groups[0].items.map((i) => i.href), ['/my-tasks', '/projects', '/clientele'])
  assert.equal(withItemPatched(grouped, '/device-support', { badge: 1 }).pinned?.[0].badge, 1)
  assert.equal(withItemReplaced(grouped, '/device-support', item('/security-checks')).pinned?.[0].href, '/security-checks')
  assert.equal(withItemAfter(withItemAfter(grouped, item('/clientele'), '/projects'), item('/clientele'), '/projects').groups[0].items.length, 3)
})
```

- [ ] **Step 2: Run to verify they fail.** Run: `node --import tsx --test tests/sidebar-config.test.ts tests/sidebar-nav.test.ts`. Expected: FAIL (`Cannot find module '../components/layout/sidebar-config'`, and the new sidebar-nav test fails on `pinned`).
- [ ] **Step 3: Implement** `components/layout/sidebar-config.ts`, the generalised helpers in `sidebar-nav.ts` (one private `mapAllSections(config, fn)` that maps `items`, every group's `items` and `pinned`; `hasHref(config, href)` checks all three), the `AppSidebar.tsx` re-exports, and the layout import changes. Move `ADMIN_INSIGHTS_ICONS` with `ADMIN_SIDEBAR`. `sidebar-nav.ts` imports its types from `./sidebar-config` (type-only).
- [ ] **Step 4: Run to verify they pass.** Run: `node --import tsx --test tests/sidebar-config.test.ts tests/sidebar-nav.test.ts tests/academy-links.test.ts tests/academy-lockout.test.ts tests/academy-quiz-editor.test.ts tests/academy-video.test.ts`. Expected: PASS. Then `npx tsc --noEmit`: no errors.
- [ ] **Step 5: Commit.** `git add components/layout tests/sidebar-config.test.ts tests/sidebar-nav.test.ts "app/(evaluator)/layout.tsx" "app/(execution)/layout.tsx" "app/(hr)/layout.tsx" "app/(oa)/layout.tsx" "app/(security)/layout.tsx" "app/(security-checks)/layout.tsx"` then `git commit -m "feat: group the employee menu and resolve every menu in one place"` (with the Co-Authored-By line).

---

### Task 2: Grouped sidebar rendering and a shell without the splash screen

**Files:**
- Modify: `components/layout/AppSidebar.tsx` (render `collapsible: false` groups as static section headings; render `pinned` at the bottom of the nav above the footer; remove the EXECUTION injection, now in the resolver)
- Modify: `components/layout/SidebarLayout.tsx` (use `resolveSidebarConfig` / `resolveLockedSidebarConfig`; render the frame with skeletons while the session loads; keep children unmounted until the user is known)
- Create: `components/layout/ShellSkeleton.tsx`
- Modify: `components/layout/TopBar.tsx` (accept `user: … | null`; render a skeleton avatar when null — the full rebuild is Tasks 10–11)
- Test: `tests/shell-wiring.test.ts` (source checks, the pattern of `tests/academy-lockout-wiring.test.ts`)

**Interfaces:**
- Consumes: Task 1 `resolveSidebarConfig`, `resolveLockedSidebarConfig`, `searchablePages`, `MenuContext`, `SidebarConfig`.
- Produces:
  - `SidebarLayout` props unchanged (`sidebarConfig`, `onboardingSidebarConfig?`, `requiredRole?`, `sidebarConfigByRole?`); `useLayoutUser(): LayoutUser | null` unchanged and still exported from `components/layout/SidebarLayout.tsx`.
  - `ShellSkeleton.tsx`: `SidebarSkeleton({ collapsed }: { collapsed: boolean }): JSX.Element` (same width classes as `AppSidebar`: `w-[60px]` / `w-[240px]`), `PageSkeleton(): JSX.Element` (a header bar and three card blocks using `components/ui/skeleton`, inside the Task 3 default width once it exists — use `mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8` here).
  - `SidebarLayout` computes and passes to `TopBar`: `user`, `pages: SearchPage[]` (`searchablePages(finalConfig, ctx)`), `locked: boolean` (`user?.onboardingCompleted === false`). Tasks 10–11 consume these props.

Behaviour to keep, in the effect order of today: `/api/auth/session` → no user → `router.push('/login')`; `requiredRole` mismatch → `router.push('/dashboard')`; then the three non-blocking fetches (`/api/clientele/access`, `/api/weekly/me`, `/api/security-checks/me`) feeding `MenuContext`; the lockout effect with `shouldRedirectLockedPage(pathname)` → `router.push('/onboarding')`. While `loading`: render `SidebarSkeleton` (desktop), `TopBar user={null}`, and `PageSkeleton` in `<main>` — never `children`. Remove the `LoadingScreen` import.

Sidebar visual: static group heading = `px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60` (same type style as today's collapsible headings, no chevron, no button). Collapsed sidebar: the existing `h-px w-6` divider between sections. Pinned section: `mt-auto` block separated by `border-t border-border pt-2`, items rendered with `SidebarNavItem`. Admin/Security groups render exactly as today.

- [ ] **Step 1: Write the failing test** `tests/shell-wiring.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')
const layout = read('components/layout/SidebarLayout.tsx')
const sidebar = read('components/layout/AppSidebar.tsx')

test('no splash screen: the shell renders skeletons, not LoadingScreen', () => {
  assert.doesNotMatch(layout, /LoadingScreen/)
  assert.match(layout, /SidebarSkeleton/)
  assert.match(layout, /PageSkeleton/)
})

test('the session redirects and the onboarding lockout are still wired', () => {
  assert.match(layout, /router\.push\('\/login'\)/)
  assert.match(layout, /router\.push\('\/dashboard'\)/)
  assert.match(layout, /shouldRedirectLockedPage\(pathname\)/)
  assert.match(layout, /router\.push\('\/onboarding'\)/)
  assert.match(layout, /resolveLockedSidebarConfig\(/)
  assert.match(layout, /resolveSidebarConfig\(/)
})

test('the menu pipeline lives in the resolver, not the components', () => {
  assert.doesNotMatch(layout, /withSecurityChecksNav|withOaPaymentNav|items\.splice/)
  assert.doesNotMatch(sidebar, /execution\/subscriptions/)
})

test('footer role switches and the collapse toggle are untouched', () => {
  for (const text of ['Admin Console', 'Employee View', 'Payroll (O&A)', 'Security Console', 'Collapse']) assert.ok(sidebar.includes(text), text)
  assert.match(layout, /localStorage\.setItem\('sidebar-collapsed'/)
})
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --import tsx --test tests/shell-wiring.test.ts`. Expected: FAIL on `LoadingScreen` and `resolveSidebarConfig`.
- [ ] **Step 3: Implement** the `AppSidebar`, `SidebarLayout`, `ShellSkeleton` and minimal `TopBar` changes above.
- [ ] **Step 4: Verify.** Run: `node --import tsx --test tests/shell-wiring.test.ts tests/sidebar-config.test.ts`. Expected: PASS. `npx tsc --noEmit`: no errors. `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test`: still 19 failures.
- [ ] **Step 5: Commit.** `git commit -m "feat: grouped sidebar and a skeleton shell instead of the splash screen"` (with the Co-Authored-By line).

---

### Task 3: One page container and one page header, adopted on the work pages

`components/layout/page-container.tsx` and `components/layout/page-header.tsx` exist but nothing imports them (verify with `grep -rn "layout/page-container\|layout/page-header" app components`); their contents are replaced. `components/composed/PageHeading.tsx` is also unused and is deleted so there is one header component.

**Files:**
- Modify (replace contents): `components/layout/page-container.tsx`, `components/layout/page-header.tsx`
- Delete: `components/composed/PageHeading.tsx`
- Modify (adoption): `components/weekly/WeeklyEvaluationsPage.tsx` (default; title `Evaluations`), `components/my-tasks/MyTasksWorkspace.tsx` (wide; title `My work`), `components/projects/ProjectsWorkspace.tsx` (both wrappers at ~864 and ~876; wide; title `Projects`), `app/(evaluator)/projects/[id]/page.tsx` and `app/(evaluator)/projects/analytics/page.tsx` and `app/(evaluator)/projects/[id]/analytics/page.tsx` (container only, wide, keep their headers), `app/(evaluator)/clientele/page.tsx` (both wrappers; default; title `Clients`)
- Test: `tests/page-frame.test.ts` (render), `tests/page-frame-adoption.test.ts` (source), `tests/helpers/page-frame.ts` (shared source assertions)

**Interfaces:**
- Produces (`components/layout/page-container.tsx`, no `'use client'`, no framer-motion — `app/(evaluator)/template.tsx` already animates):
  - `type PageWidth = 'default' | 'wide' | 'reading'`
  - `interface PageContainerProps { children: React.ReactNode; width?: PageWidth; className?: string }`
  - `function PageContainer(props: PageContainerProps): JSX.Element` — outer `<div>` classes `mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8` plus `max-w-7xl` (default and reading) or `max-w-[1600px]` (wide), then `className`. `reading` wraps children in `<div className="max-w-4xl">` (same left edge, narrower column).
- Produces (`components/layout/page-header.tsx`, no `'use client'`):
  - `interface PageHeaderProps { title: React.ReactNode; subtitle?: React.ReactNode; dateLine?: React.ReactNode; actions?: React.ReactNode; className?: string }`
  - `function PageHeader(props: PageHeaderProps): JSX.Element` — `<header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">`; left column: optional `<p data-slot="date-line" className="text-sm text-muted-foreground">`, `<h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">`, optional `<p data-slot="subtitle" className="mt-1 max-w-2xl text-sm text-muted-foreground">`; right: optional `<div data-slot="actions" className="flex shrink-0 flex-wrap items-center gap-2">`.
  - Parts 3 (Home) and 4 (Time off) consume exactly these two components; Home passes `dateLine` and `actions`, Time off passes `actions`.
- Produces (`tests/helpers/page-frame.ts`): `assertAdoptsFrame(file: string, options: { header: boolean }): void` — asserts the source imports `PageContainer` from `@/components/layout/page-container`, contains `<PageContainer`, contains `<PageHeader` when `header`, and does not match the page-level wrapper pattern `/(max-w-(?:2xl|4xl|5xl|6xl|7xl|\[1300px\]|\[1600px\])[^"'`]*mx-auto|mx-auto[^"'`]*max-w-(?:2xl|4xl|5xl|6xl|7xl|\[1300px\]|\[1600px\]))/`.

- [ ] **Step 1: Write the failing tests.** `tests/page-frame.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageContainer } from '../components/layout/page-container'
import { PageHeader } from '../components/layout/page-header'

test('default and reading share the max-w-7xl edge; wide is 1600px', () => {
  assert.match(renderToStaticMarkup(createElement(PageContainer, null, 'x')), /max-w-7xl/)
  assert.match(renderToStaticMarkup(createElement(PageContainer, { width: 'wide' }, 'x')), /max-w-\[1600px\]/)
  const reading = renderToStaticMarkup(createElement(PageContainer, { width: 'reading' }, 'x'))
  assert.match(reading, /max-w-7xl/)
  assert.match(reading, /<div class="max-w-4xl">x<\/div>/)
})

test('the header renders one h1 and only the slots it is given', () => {
  const bare = renderToStaticMarkup(createElement(PageHeader, { title: 'People' }))
  assert.equal(bare.match(/<h1/g)?.length, 1)
  assert.doesNotMatch(bare, /data-slot="(date-line|subtitle|actions)"/)
  const full = renderToStaticMarkup(createElement(PageHeader, { title: 'Home', dateLine: 'Wed 11 Nov', subtitle: 'Two things need you', actions: createElement('button', null, 'Request leave') }))
  assert.match(full, /data-slot="date-line"[^>]*>Wed 11 Nov</)
  assert.match(full, /data-slot="subtitle"[^>]*>Two things need you</)
  assert.match(full, /data-slot="actions"[^>]*><button>Request leave<\/button>/)
})
```

  `tests/page-frame-adoption.test.ts`:

```ts
import test from 'node:test'
import { assertAdoptsFrame } from './helpers/page-frame'

const WITH_HEADER = ['components/weekly/WeeklyEvaluationsPage.tsx', 'components/my-tasks/MyTasksWorkspace.tsx', 'components/projects/ProjectsWorkspace.tsx', 'app/(evaluator)/clientele/page.tsx']
const CONTAINER_ONLY = ['app/(evaluator)/projects/[id]/page.tsx', 'app/(evaluator)/projects/analytics/page.tsx', 'app/(evaluator)/projects/[id]/analytics/page.tsx']

for (const file of WITH_HEADER) test(`${file} uses the page container and header`, () => assertAdoptsFrame(file, { header: true }))
for (const file of CONTAINER_ONLY) test(`${file} uses the page container`, () => assertAdoptsFrame(file, { header: false }))
```

- [ ] **Step 2: Run to verify they fail.** Run: `node --import tsx --test tests/page-frame.test.ts tests/page-frame-adoption.test.ts`. Expected: FAIL (old exports / missing `<PageContainer`).
- [ ] **Step 3: Implement** the two components, delete `PageHeading.tsx`, and adopt them in the listed files. Keep each page's existing subtitle text and right-hand buttons, moved into `subtitle` / `actions`. Keep inner layout untouched. The projects detail and analytics pages keep their own `VIZ_VARS` class by passing it through `className`.
- [ ] **Step 4: Verify.** Run the two test files: PASS. `npx tsc --noEmit`: no errors. `wc -l components/projects/ProjectsWorkspace.tsx "app/(evaluator)/projects/[id]/page.tsx"`: not larger than before.
- [ ] **Step 5: Commit.** `git commit -m "feat: one page container and header on the work pages"` (with the Co-Authored-By line).

---

### Task 4: Page frame on the company and help pages

**Files:**
- Modify: `app/(evaluator)/handbook/page.tsx` (default; title `Handbook`; the HR "Preview as" controls go in `actions`), `app/(evaluator)/handbook/[slug]/page.tsx` (both wrappers; reading; article title stays the `PageHeader` title), `components/device-support/DeviceSupportWorkspace.tsx` (non-embedded branches only, lines ~188 and ~198; default; title `Help & IT`; `embedded` rendering unchanged), `app/(evaluator)/device-support/assets/[tag]/page.tsx` (both wrappers; default; asset name as title), `app/(evaluator)/profile/page.tsx` (reading; title `Profile`), `app/(evaluator)/team-lead-form/[newHireId]/page.tsx` (reading; title `Team Lead Onboarding Form`)
- Test: `tests/page-frame-adoption.test.ts` (extend)

Not in this part: `app/(evaluator)/dashboard/page.tsx` (part 3), `app/(evaluator)/leave/page.tsx` (part 4), `app/(evaluator)/office/page.tsx` (full-bleed virtual office, unchanged), `/onboarding/*` (own look), `/security-checks` (shared with the Security console; unchanged).

**Interfaces:**
- Consumes: Task 3 `PageContainer`, `PageHeader`, `assertAdoptsFrame`.

- [ ] **Step 1: Write the failing test** — append to `tests/page-frame-adoption.test.ts`:

```ts
const COMPANY_PAGES = ['app/(evaluator)/handbook/page.tsx', 'app/(evaluator)/handbook/[slug]/page.tsx', 'components/device-support/DeviceSupportWorkspace.tsx', 'app/(evaluator)/device-support/assets/[tag]/page.tsx', 'app/(evaluator)/profile/page.tsx', 'app/(evaluator)/team-lead-form/[newHireId]/page.tsx']
for (const file of COMPANY_PAGES) test(`${file} uses the page container and header`, () => assertAdoptsFrame(file, { header: true }))
```

- [ ] **Step 2: Run to verify it fails.** `node --import tsx --test tests/page-frame-adoption.test.ts`. Expected: the six new cases FAIL.
- [ ] **Step 3: Implement** the swaps. In `DeviceSupportWorkspace` keep `embedded ? "" : …` by rendering children bare when embedded and inside `PageContainer` otherwise. The old `Monitor` icon in the Device Support title is dropped (one header style).
- [ ] **Step 4: Verify.** Test file PASS; `npx tsc --noEmit` clean; `npm test` (env-stripped) still 19 failures; `profile/page.tsx` line count not larger.
- [ ] **Step 5: Commit.** `git commit -m "feat: page container and header on handbook, help, profile and form pages"` (with the Co-Authored-By line).

---

### Task 5: People page — My team and the company map

**Files:**
- Create: `lib/people/directory.ts` (server: active and company filters, company-map loader)
- Create: `lib/people/company-map.ts` (pure: scene and search for the map)
- Create: `app/api/people/company-map/route.ts`
- Create: `app/(evaluator)/people/page.tsx` (client; `Suspense` around a component that reads `useSearchParams`)
- Create: `components/people/PeopleWorkspace.tsx`, `components/people/MyTeamList.tsx`, `components/people/CompanyMap.tsx`, `components/people/CompanyMapNodes.tsx`
- Test: `tests/people-company-map.test.ts` (pure), `tests/people-directory.integration.test.ts` (DB; id prefix `ppl-`)

**Interfaces:**
- Produces (`lib/people/directory.ts`):
  - `const ACTIVE_PERSON_WHERE: Prisma.UserWhereInput` — `{ OR: [{ payrollProfile: { is: null } }, { payrollProfile: { is: { isPayrollActive: true } } }] }`.
  - `companyPeopleWhere(viewerIs3E: boolean): Prisma.UserWhereInput` — 3E: `{ department: { equals: '3E', mode: 'insensitive' } }`; Plutus21: `{ OR: [{ department: null }, { NOT: { department: { equals: '3E', mode: 'insensitive' } } }] }`. Callers also post-filter with `isThreeEDepartment` (handles `' 3E '`).
  - `interface DirectoryPerson { id: string; name: string; position: string | null; department: string | null }`
  - `interface ReportingLink { leadId: string; reportId: string }`
  - `interface CompanyMapData { viewerId: string; people: DirectoryPerson[]; links: ReportingLink[] }`
  - `loadCompanyMap(viewer: { id: string; department: string | null }, db?: PrismaClient): Promise<CompanyMapData | null>` — `null` for a 3E viewer; people = active, non-3E, sorted by name; links = `evaluatorMapping` rows with `relationshipType: 'TEAM_LEAD'` only, both ends in `people`, `evaluatorId !== evaluateeId`, deduplicated.
- Produces (`lib/people/company-map.ts`):
  - `interface PersonNodeData { name: string; position: string | null; department: string | null; isViewer: boolean; leads: string[] }` (`leads` = names of every lead, sorted)
  - `interface CompanyMapScene { nodes: Array<{ id: string; type: 'person' | 'company'; position: { x: number; y: number }; data: PersonNodeData | { label: string } }>; edges: Array<{ id: string; source: string; target: string }> }`
  - `buildCompanyMapScene(data: CompanyMapData, companyName: string): CompanyMapScene` — adapts to `OrgChartUser` (`role: ''`, `chartX: null`, `chartY: null` — admin's saved positions are not used) and `OrgChartMapping` (`id: \`${leadId}>${reportId}\``, `relationshipType: 'TEAM_LEAD'`), calls `buildHierarchyOrgChartScene`, maps `employee` → `person`, keeps `company`; edges keep only `id`, `source`, `target`.
  - `findPeople(people: readonly DirectoryPerson[], query: string, limit?: number): DirectoryPerson[]` — case-insensitive name match, prefix matches first, default `limit` 8, empty query → `[]`.
- Produces (route): `GET /api/people/company-map` → 401 `{ success: false, error: 'Unauthorized' }` without a session; 404 `{ success: false, error: 'Not found' }` for a 3E viewer; 200 `{ success: true, data: CompanyMapData }`; 500 `{ success: false, error: 'Could not load the company map. Try again.' }` with `console.error` details.
- Page: tabs `My team` (always) and `Company map` (only when `!isThreeEDepartment(user.department)`); `?tab=team|map`; `?focus=<userId>` opens the map tab centred on that person with the highlight ring (3E: My team tab, row highlighted if present). My team = today's Home Team Directory from `GET /api/users/team` (name, `position || department || 'Team member'`, `UserAvatar`, Discord ID), heading "Your direct reports" for `scope: 'direct_reports'` else "People in {department}"; empty state "No team members found yet." The map: `reactflow` with `fitView`, `nodesDraggable={false}`, `nodesConnectable={false}`, `Controls`, `Background`; a search `Input` ("Find someone") using `findPeople`, choosing a result calls `setCenter` on that node and highlights it; the viewer's node has a `ring-2 ring-primary` and a "You" badge; nodes show name, title, department and, with two or more leads, "Reports to A and B". Node components use `bg-card border-border text-foreground` so they work in both themes. Page header: `PageHeader title="People" subtitle="Your team and how the company fits together."` inside `PageContainer` default (map tab may use `width="wide"`).

- [ ] **Step 1: Write the failing tests.** `tests/people-company-map.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCompanyMapScene, findPeople } from '../lib/people/company-map'
import type { CompanyMapData } from '../lib/people/directory'

const person = (id: string, name: string, department: string | null = 'Product') => ({ id, name, position: 'Analyst', department })
const people = [person('a', 'Avery Holm'), person('b', 'Bea Calder'), person('c', 'Cole Ruiz'), person('d', 'Dana Ivers', null)]
const scene = (links: CompanyMapData['links'], viewerId = 'b') => buildCompanyMapScene({ viewerId, people, links }, 'Plutus21')
const personNodes = (s: ReturnType<typeof scene>) => s.nodes.filter((n) => n.type === 'person')

test('one node per person plus the company, edges only for reporting lines', () => {
  const s = scene([{ leadId: 'a', reportId: 'b' }, { leadId: 'a', reportId: 'c' }])
  assert.equal(personNodes(s).length, 4)
  assert.equal(s.nodes.filter((n) => n.type === 'company').length, 1)
  assert.deepEqual(s.edges.filter((e) => e.source !== 'company').map((e) => `${e.source}>${e.target}`).sort(), ['a>b', 'a>c'])
  assert.deepEqual(Object.keys(s.edges[0]).sort(), ['id', 'source', 'target'])
})

test('the viewer is marked and null-department people are on the map', () => {
  const s = scene([])
  assert.deepEqual(personNodes(s).filter((n) => (n.data as { isViewer: boolean }).isViewer).map((n) => n.id), ['b'])
  assert.ok(personNodes(s).some((n) => n.id === 'd'))
})

test('company map survives cycles, self links and two leads', () => {
  const s = scene([{ leadId: 'a', reportId: 'b' }, { leadId: 'b', reportId: 'a' }, { leadId: 'c', reportId: 'c' }, { leadId: 'a', reportId: 'd' }, { leadId: 'c', reportId: 'd' }])
  assert.equal(personNodes(s).length, 4)
  assert.equal(new Set(personNodes(s).map((n) => n.id)).size, 4)
  assert.deepEqual((personNodes(s).find((n) => n.id === 'd')!.data as { leads: string[] }).leads, ['Avery Holm', 'Cole Ruiz'])
})

test('findPeople matches names, prefix first, and nothing for an empty query', () => {
  assert.deepEqual(findPeople(people, 'co').map((p) => p.id), ['c'])
  assert.deepEqual(findPeople(people, 'a').map((p) => p.id)[0], 'a')
  assert.deepEqual(findPeople(people, '  '), [])
})
```

  (`buildCompanyMapScene` drops self links before calling the hierarchy builder; that keeps the assertion above true.)

  `tests/people-directory.integration.test.ts` — gate every test on `WEEKLY_DB_TEST`; `before` creates fictional users `ppl-lead` (Product), `ppl-ana` (Product), `ppl-nodept` (`department: null`), `ppl-3e` (`department: ' 3E '`), `ppl-gone` (payroll profile with `isPayrollActive: false`; see `tests/helpers/weekly-test-db.ts` `seedWeeklyBase` for creating a `payrollEmployeeProfile`), and mappings `ppl-lead → ppl-ana` TEAM_LEAD, `ppl-lead → ppl-nodept` TEAM_LEAD, `ppl-ana → ppl-lead` PEER, `ppl-lead → ppl-ana` HR; `after` deletes mappings and users with ids starting `ppl-`. Tests (assert only on ids starting `ppl-`):
  - `the map carries TEAM_LEAD lines only` — `links` among `ppl-` ids equal `[{ leadId: 'ppl-lead', reportId: 'ppl-ana' }, { leadId: 'ppl-lead', reportId: 'ppl-nodept' }]` (sorted).
  - `null-department people are on the map, 3E and inactive people are not` — `ppl-` people ids are `['ppl-ana', 'ppl-lead', 'ppl-nodept']`.
  - `people carry only id, name, position and department` — `Object.keys(people[0]).sort()` equals `['department', 'id', 'name', 'position']`.
  - `a 3E viewer gets no map` — `loadCompanyMap({ id: 'ppl-3e', department: ' 3E ' })` is `null`.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/people-company-map.test.ts` → FAIL (module missing). The DB file with the DB env → FAIL (module missing).
- [ ] **Step 3: Implement** `lib/people/directory.ts`, `lib/people/company-map.ts`, the route (session via `getSession`; `checkRateLimit(\`people-map:${user.id}\`, 60)` → 429 `{ success: false, error: 'Too many requests. Wait a moment and try again.' }`, allowing on `RateLimitUnavailableError`; envelope as above), the page and components.
- [ ] **Step 4: Verify.** Pure test PASS; DB test PASS with `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/people-directory.integration.test.ts`; `npx tsc --noEmit` clean; `git diff --stat HEAD -- app/api/admin/org-chart "app/(hr)/admin/org-chart" lib/org-chart.ts` shows nothing.
- [ ] **Step 5: Commit.** `git commit -m "feat: People page with My team and a company map of reporting lines"` (with the Co-Authored-By line).

---

### Task 6: Notification table, bell service and bell API

**Files:**
- Modify: `prisma/schema.prisma` (new model; `notifications UserNotification[]` on `User`)
- Create: `prisma/migrations/20261111120000_user_notifications/migration.sql`
- Create: `lib/notifications/service.ts`
- Create: `app/api/notifications/route.ts` (GET), `app/api/notifications/read/route.ts` (POST)
- Test: `tests/notifications-service.integration.test.ts` (DB; id prefix `ntf-`), `tests/notifications-links.test.ts` (pure)

```prisma
model UserNotification {
  id        String    @id @default(cuid())
  userId    String
  kind      String
  title     String
  link      String
  dedupeKey String?   @unique
  createdAt DateTime  @default(now())
  readAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([userId, readAt])
}
```

**Interfaces:**
- Produces (`lib/notifications/service.ts`):
  - `const BELL_PAGE_SIZE = 30`, `const BELL_RETENTION_DAYS = 90`, `const TITLE_MAX = 200`
  - `type NotificationKind = 'LEAVE_APPROVED' | 'LEAVE_REJECTED' | 'LEAVE_CANCELLED' | 'PLAN_REMINDER' | 'PLAN_DEADLINE_NOTICE' | 'PLAN_FINAL_WARNING' | 'PLAN_DISAPPROVED' | 'WFH_APPROVED' | 'WFH_REJECTED' | 'WEEKLY_LIST_DECISION' | 'WEEKLY_LIST_CHANGED' | 'WEEKLY_FORMS_OPEN'`
  - `interface NewNotification { userId: string; kind: NotificationKind; title: string; link: string; dedupeKey?: string }`
  - `isInternalLink(link: string): boolean` — starts with `/`, not `//`, no `\`, no whitespace.
  - `recordNotifications(rows: readonly NewNotification[], db?: PrismaClient | Prisma.TransactionClient): Promise<number>` — drops rows whose link fails `isInternalLink`, trims titles to `TITLE_MAX`, `createMany({ skipDuplicates: true })`, returns the inserted count.
  - `recordNotificationsSafely(label: string, rows: readonly NewNotification[] | (() => Promise<readonly NewNotification[]>), db?): Promise<void>` — never throws; on error `console.error('[notifications] ' + label + ' failed', { error })`.
  - `type BellSource = 'compass' | 'security'`
  - `interface BellItem { id: string; source: BellSource; kind: string; title: string; detail: string | null; href: string; createdAt: string; read: boolean }`
  - `interface BellRef { source: BellSource; id: string }`
  - `securityNoticeHref(kind: string, taskId: string | null): string` — `OVERDUE_DIGEST`, `UNREVIEWED_EXPIRED`, `SELF_REVIEW_REPORT` → `/security-checks/console`; otherwise `/security-checks/${taskId}` when `taskId`, else `/security-checks`.
  - `listBell(userId: string, options: { now: Date; securityChecks: boolean }, db?): Promise<{ items: BellItem[]; unread: number }>` — compass rows from the last `BELL_RETENTION_DAYS`, plus `listNotifications(userId)` from `lib/security-checks/service/inbox.ts` when `securityChecks`; merged newest first, cut to `BELL_PAGE_SIZE`; `unread` = unread compass rows in the window + `unreadCount(userId)` when `securityChecks`.
  - `markBellRead(userId: string, refs: readonly BellRef[], now: Date, options: { securityChecks: boolean }, db?): Promise<number>` — compass: `updateMany` on `userId`, `readAt: null`, ids; security: `markRead(userId, ids, now)` from the inbox service, only when `securityChecks`. Never touches another user's rows.
- Produces (routes):
  - `GET /api/notifications` → 401 `{ success: false, error: 'Unauthorized' }`; 200 `{ success: true, data: { items: BellItem[]; unread: number } }` with `securityChecks = isSecurityChecksEnabled()`; 500 `{ success: false, error: 'Could not load notifications.' }`.
  - `POST /api/notifications/read` body `{ refs: Array<{ source: 'compass' | 'security'; id: string (1..64) }> }` (1..60 refs, zod `.strict()`) → `assertSameOrigin(request.headers, request.url)` (403 on `SameOriginError`), `checkRateLimit(\`notifications:${user.id}\`, 120)` (429 when not allowed; allow on `RateLimitUnavailableError`, as `lib/security-checks/http.ts` does), 400 on invalid body, 200 `{ success: true, data: { updated: number } }`.

- [ ] **Step 1: Schema and migration (no test of its own; the Task 6 DB tests prove it).**
  - Add the model and the `User` back-relation.
  - `git show HEAD:prisma/schema.prisma > "C:/Users/PC/AppData/Local/Temp/claude/8d424c48544ef642/356dfe57-d9a5-463d-8205-263e0c02ed64/scratchpad/schema.before.prisma"` (or any path in your own scratchpad).
  - `npx prisma migrate diff --from-schema-datamodel <that file> --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261111120000_user_notifications/migration.sql`. Prepend the comment `-- Bell notifications. Additive only: one new table.` Expected content: one `CREATE TABLE "UserNotification"`, the unique index on `dedupeKey`, the two indexes, one `ADD CONSTRAINT … FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE`. Anything else (ALTER of existing tables, DROP, RENAME) means the diff is wrong: stop.
  - Apply to the local test DB only: `npx prisma db execute --url postgresql://compass:compass@localhost:5433/compass_weekly_test --file prisma/migrations/20261111120000_user_notifications/migration.sql`.
  - `npx prisma generate`.
- [ ] **Step 2: Write the failing tests.** `tests/notifications-links.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { isInternalLink, securityNoticeHref } from '../lib/notifications/service'

test('only in-app paths are accepted as bell links', () => {
  for (const ok of ['/leave', '/leave?requestId=abc', '/evaluations/weekly']) assert.equal(isInternalLink(ok), true, ok)
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil', '', 'leave']) assert.equal(isInternalLink(bad), false, bad)
})

test('security notices link to the task, or the console for reviewer digests', () => {
  assert.equal(securityNoticeHref('NEW_TASK', 'task-1'), '/security-checks/task-1')
  assert.equal(securityNoticeHref('EXTENDED', null), '/security-checks')
  assert.equal(securityNoticeHref('OVERDUE_DIGEST', null), '/security-checks/console')
})
```

  `tests/notifications-service.integration.test.ts` (users `ntf-ana`, `ntf-ben`; `beforeEach` deletes `userNotification` and `securityNotification` rows for `ntf-` users; `after` deletes the users and disconnects):
  - `records once per dedupe key` — `recordNotifications` twice with the same `dedupeKey` → 1 row; returns 1 then 0.
  - `drops external links and trims long titles` — a row with `link: 'https://x.example'` is not stored; a 300-char title is stored as 200 chars.
  - `recordNotificationsSafely logs and swallows` — call with a builder that throws `new Error('boom')`; resolves; `console.error` was called once (use `test.mock.method(console, 'error')`).
  - `the bell merges security notices newest first and counts unread` — create one compass row at `2026-11-10T09:00Z` and two `securityNotification` rows (`kind: 'NEW_TASK'` at `2026-11-10T10:00Z` with `taskId: 'st-1'`, and `kind: 'REMINDER_MARKER'` which must be hidden); `listBell('ntf-ana', { now: new Date('2026-11-11T00:00Z'), securityChecks: true })` → items sources `['security', 'compass']`, first `href` `/security-checks/st-1`, `unread` 2; with `securityChecks: false` → one item, `unread` 1.
  - `rows older than 90 days are not shown or counted` — a compass row created `2026-08-01` → not in items, not in `unread`.
  - `marking read touches only the viewer's rows` — a row for `ntf-ben` with the same shape; `markBellRead('ntf-ana', [{ source: 'compass', id: benRowId }], …)` returns 0 and Ben's row stays unread; marking Ana's own compass and security refs returns 2 and both have `readAt` set.
  - `deleting a user deletes their notifications` — delete `ntf-ben` user, count of his rows is 0 (recreate in `beforeEach` as needed).
- [ ] **Step 3: Run to verify they fail.** `node --import tsx --test tests/notifications-links.test.ts` → FAIL (module missing). The DB file → FAIL.
- [ ] **Step 4: Implement** `lib/notifications/service.ts` and the two routes.
- [ ] **Step 5: Verify.** Both test files PASS (DB file with the DB env). `npx tsc --noEmit` clean. `npm test` (env-stripped) 19 failures.
- [ ] **Step 6: Commit.** `git add prisma/schema.prisma prisma/migrations/20261111120000_user_notifications lib/notifications app/api/notifications tests/notifications-*.ts` then `git commit -m "feat: bell notifications table, service and API"` (with the Co-Authored-By line).

---

### Task 7: Bell rows for leave, WFH and transition-plan events

**Files:**
- Create: `lib/notifications/leave.ts`
- Modify: `app/api/leave/approve/route.ts`, `app/api/leave/requests/route.ts` (DELETE, HR branch), `lib/leave-auto-cancel.ts`, `app/api/leave/requests/[id]/transition-plan/review/route.ts`, `lib/leave-transition-plan-job.ts`, `app/api/wfh/approve/route.ts`, `app/api/wfh/requests/route.ts` (POST, on-behalf approval branch)
- Test: `tests/notifications-leave.test.ts` (pure copy), `tests/notifications-leave.integration.test.ts` (DB; prefix `nlv-`), `tests/notification-write-points.test.ts` (source wiring)

**Interfaces:**
- Consumes: Task 6 `recordNotificationsSafely`, `NotificationKind`; `getLeaveRequestPath(id)` from `lib/leave-deep-links.ts`; `formatDate`, `formatDateRange` from `lib/format-date.ts`.
- Produces (`lib/notifications/leave.ts`):
  - `type LeaveNoticeEvent = 'LEAVE_APPROVED' | 'LEAVE_REJECTED' | 'LEAVE_CANCELLED' | 'PLAN_REMINDER' | 'PLAN_DEADLINE_NOTICE' | 'PLAN_FINAL_WARNING' | 'PLAN_DISAPPROVED'`
  - `type WfhNoticeEvent = 'WFH_APPROVED' | 'WFH_REJECTED'`
  - `interface LeaveNoticeSubject { id: string; employeeId: string; leaveType: 'CASUAL' | 'SICK' | 'ANNUAL'; isHalfDay: boolean; startDate: Date; endDate: Date }`
  - `leaveNoticeTitle(event: LeaveNoticeEvent, leave: LeaveNoticeSubject, options?: { deadline?: Date; now?: Date }): string`
  - `wfhNoticeTitle(event: WfhNoticeEvent, wfh: { startDate: Date; endDate: Date }, options?: { now?: Date }): string`
  - `notifyLeave(requestId: string, event: LeaveNoticeEvent, options?: { deadline?: Date; dedupeKey?: string }, db?): Promise<void>` — loads the request (`id, employeeId, leaveType, isHalfDay, startDate, endDate`); missing request → no row, no throw; link `getLeaveRequestPath(id)`.
  - `notifyLeaveFor(leave: LeaveNoticeSubject, event: LeaveNoticeEvent, options?: { deadline?: Date; dedupeKey?: string; link?: string }, db?): Promise<void>` — for a request that is about to be or has been deleted; `link` defaults to `getLeaveRequestPath(leave.id)`.
  - `notifyWfh(requestId: string, event: WfhNoticeEvent, db?): Promise<void>` — link `/leave`.
  - All three never throw (they go through `recordNotificationsSafely`).

Exact titles (the leave phrase is `your {type} leave, {range}` where type is `casual` / `sick` / `annual`, or `your {type} half day, {day}` for half days; range from `formatDateRange`, deadline from `formatDate`):

| event | title |
|---|---|
| LEAVE_APPROVED | `Your annual leave, Thu 19 – Mon 23 Nov, was approved` |
| LEAVE_REJECTED | `Your annual leave, Thu 19 – Mon 23 Nov, was not approved` |
| LEAVE_CANCELLED | `Your annual leave, Thu 19 – Mon 23 Nov, was cancelled` |
| PLAN_REMINDER | `Add a transition plan for your annual leave, Thu 19 – Mon 23 Nov` |
| PLAN_DEADLINE_NOTICE | `Add a transition plan by Mon 16 Nov for your annual leave, Thu 19 – Mon 23 Nov` |
| PLAN_FINAL_WARNING | `Last reminder: add a transition plan by Mon 16 Nov or your annual leave, Thu 19 – Mon 23 Nov, will be cancelled` |
| PLAN_DISAPPROVED | `Your lead sent back the transition plan for your annual leave, Thu 19 – Mon 23 Nov` |
| WFH_APPROVED | `Your work-from-home request, Thu 19 – Mon 23 Nov, was approved` |
| WFH_REJECTED | `Your work-from-home request, Thu 19 – Mon 23 Nov, was not approved` |

Write points (each after the state change has committed, beside the existing email call, never inside its `try`):

| file | where | call |
|---|---|---|
| `app/api/leave/approve/route.ts` | disapprove of an APPROVED leave, after the cancellation email block | `await notifyLeave(requestId, 'LEAVE_CANCELLED')` |
| same | plain rejection, after the rejection email block | `await notifyLeave(requestId, 'LEAVE_REJECTED')` |
| same | inside `if (!result.alreadyFinalized)`, after the approval email block | `await notifyLeave(requestId, 'LEAVE_APPROVED')` |
| `app/api/leave/requests/route.ts` DELETE | HR branch, after calendar removal, only when `active && leaveRequest.employeeId !== user.id` | `await notifyLeaveFor(leaveRequest, 'LEAVE_CANCELLED', { link: '/leave' })` |
| `lib/leave-auto-cancel.ts` | after the cancellation email block | `await notifyLeave(requestId, 'LEAVE_CANCELLED', { dedupeKey: \`leave-auto-cancel:${requestId}\` })` |
| `app/api/leave/requests/[id]/transition-plan/review/route.ts` | DISAPPROVE branch, after the email block | `await notifyLeave(id, 'PLAN_DISAPPROVED')` |
| `lib/leave-transition-plan-job.ts` | reminder loop, when `outcome.success` | `await notifyLeave(requestId, 'PLAN_REMINDER', { dedupeKey: \`plan-reminder:${requestId}:${today.toISOString().slice(0, 10)}\` })` |
| same | notice loop, when `outcome.success` | `await notifyLeave(id, 'PLAN_DEADLINE_NOTICE', { deadline, dedupeKey: \`plan-notice:${id}\` })` |
| same | final-warning loop, when `outcome.success` | `await notifyLeave(id, 'PLAN_FINAL_WARNING', { deadline, dedupeKey: \`plan-final-warning:${id}\` })` |
| `app/api/wfh/approve/route.ts` | rejection, after its email block | `await notifyWfh(requestId, 'WFH_REJECTED')` |
| same | approval that reached `APPROVED`, after its email block | `await notifyWfh(requestId, 'WFH_APPROVED')` |
| `app/api/wfh/requests/route.ts` POST | the HR on-behalf immediate approval branch, after its email block | `await notifyWfh(wfhRequest.id, 'WFH_APPROVED')` |

Not written (rulings): the lead's intermediate LEAD_APPROVED step, the employee's own cancellation, the HR escalation (an action for HR, part 3's "Needs you"), and dry runs of the job (`dryRun` returns before the loops).

- [ ] **Step 1: Write the failing tests.** `tests/notifications-leave.test.ts` pins every row of the title table with `now = new Date('2026-11-11T06:00:00Z')`, `startDate = new Date('2026-11-19T00:00:00Z')`, `endDate = new Date('2026-11-23T00:00:00Z')`, `deadline = new Date('2026-11-16T00:00:00Z')`, plus:

```ts
test('half days name the single day', () => {
  const half = { id: 'r1', employeeId: 'e1', leaveType: 'CASUAL' as const, isHalfDay: true, startDate: new Date('2026-11-19T00:00:00Z'), endDate: new Date('2026-11-19T00:00:00Z') }
  assert.equal(leaveNoticeTitle('LEAVE_APPROVED', half, { now }), 'Your casual half day, Thu 19 Nov, was approved')
})

test('another year shows the year', () => {
  const later = { ...annual, startDate: new Date('2027-01-04T00:00:00Z'), endDate: new Date('2027-01-05T00:00:00Z') }
  assert.equal(leaveNoticeTitle('LEAVE_REJECTED', later, { now }), 'Your annual leave, Mon 4 – Tue 5 Jan 2027, was not approved')
})
```

  `tests/notifications-leave.integration.test.ts` (fictional employee `nlv-emp`; create a `leaveRequest` with the minimum required fields as in `tests/leave-holidays.integration.test.ts`, plus a `wfhRequest`; clean up `nlv-` rows):
  - `a decision writes one row for the employee with a deep link` — `notifyLeave(id, 'LEAVE_APPROVED')` → one row, `userId 'nlv-emp'`, `kind 'LEAVE_APPROVED'`, `link` `/leave?requestId=${id}`.
  - `the same cron key writes once` — `notifyLeave(id, 'PLAN_REMINDER', { dedupeKey: 'plan-reminder:x:2026-11-11' })` twice → one row.
  - `a missing request writes nothing and does not throw`.
  - `HR cancellation of a deleted request links to /leave` — `notifyLeaveFor(subject, 'LEAVE_CANCELLED', { link: '/leave' })` after deleting the request → one row with `link '/leave'`.
  - `WFH decisions link to /leave`.

  `tests/notification-write-points.test.ts` (source checks, `bodyOf` style from `tests/academy-lockout-wiring.test.ts`): for every row of the write-point table, assert the file contains the call text, that it appears after the state change in the same branch (`indexOf(call) > indexOf('<anchor>')`, anchors: `sendLeaveCancellationNotification(requestId, user.name, comment)`, `sendLeaveApprovalNotification(requestId, 'rejected'`, `sendLeaveApprovalNotification(requestId, 'approved'`, `removeLeaveCalendarEvent(requestId)` inside `if (isHR)`, `sendLeaveCancellationNotification(requestId, AUTOMATED_ACTOR_LABEL, reason)`, `sendTransitionPlanDisapprovedNotification(id, reason)`, `sendTransitionPlanReminderNotification(requestId)`, `sendTransitionPlanDeadlineNotice(id, deadline)`, `sendTransitionPlanFinalWarning(id, deadline)`, `sendWfhApprovalNotification(requestId, 'rejected'`, `sendWfhApprovalNotification(requestId, 'approved'`, `'Entered by HR on behalf of employee'`), and that no write-point file imports `recordNotifications` directly (only the safe `notify*` helpers). Also assert `lib/email.ts` is unchanged: `git diff --quiet HEAD -- lib/email.ts` run in the verify step below.
- [ ] **Step 2: Run to verify they fail.** `node --import tsx --test tests/notifications-leave.test.ts tests/notification-write-points.test.ts` → FAIL.
- [ ] **Step 3: Implement** `lib/notifications/leave.ts` and the twelve call sites.
- [ ] **Step 4: Verify.** Pure and wiring tests PASS; DB test PASS with the DB env; `node --import tsx --test tests/leave-transition-plan.test.ts tests/leave-deep-links.test.ts tests/three-e-leave-approvers.test.ts` PASS; `git diff --quiet HEAD -- lib/email.ts && echo unchanged` prints `unchanged`; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: bell notices for leave, WFH and transition-plan events"` (with the Co-Authored-By line).

---

### Task 8: Bell rows for weekly list decisions, list changes and forms opening

**Files:**
- Create: `lib/weekly/service/bell-notices.ts` (pure builders)
- Modify: `lib/weekly/service/notifications.ts` (`WeeklyEmailMessage.bell?`, `deliverOnce` writes bells; `formsOpenMessages` attaches bells)
- Modify: `lib/weekly/service/peer-requests.ts` (`decide`), `lib/weekly/service/round.ts` (expired requests on round open), `lib/weekly/service/round-people.ts` (HR list change)
- Modify: `lib/weekly/emails.ts` — export the existing `yourChange` helper only (`export const yourChange`); no email text changes
- Test: `tests/weekly-bell-notices.test.ts` (pure), `tests/weekly-bell.integration.test.ts` (DB; uses the weekly fixtures)

**Interfaces:**
- Consumes: Task 6 `recordNotificationsSafely`, `NewNotification`.
- Produces (`lib/weekly/service/notifications.ts`): `interface WeeklyBellNotice { kind: 'WEEKLY_LIST_DECISION' | 'WEEKLY_LIST_CHANGED' | 'WEEKLY_FORMS_OPEN'; title: string; link: string; dedupeKey: string }`; `WeeklyEmailMessage` gains `bell?: WeeklyBellNotice`. `deliverOnce`: for messages whose user exists and is not payroll-inactive, collect bells and record them in one `recordNotificationsSafely('weekly', …)` call before the email loop — independent of whether the user has an email, of `emailsEnabled`, and of the email key being a duplicate. Email behaviour and `WeeklySendResult` counts are unchanged.
- Produces (`lib/weekly/service/bell-notices.ts`):
  - `decisionBellForRequester(input: { requestId: string; approved: boolean; action: 'ADD' | 'REMOVE'; relation: 'PEER' | 'LEAD' | 'REPORT'; otherName: string }): WeeklyBellNotice` — title `Your request to ${yourChange({ action, relation }, otherName)} was approved` / `… was not approved`; dedupe `bell:peer-request-outcome:${requestId}`.
  - `decisionBellForOther(input: { requestId: string; approved: boolean; requesterName: string }): WeeklyBellNotice` — approved `HR changed your evaluation lists after a request from ${requesterName}`; not approved `HR did not approve ${requesterName}'s request about you`; dedupe `bell:peer-request-outcome:${requestId}:other`.
  - `expiredBell(input: { requestId: string; otherName: string; forPeer: boolean }): WeeklyBellNotice` — requester `Your request about ${otherName} lapsed when the round opened`; peer `${otherName}'s request about you lapsed when the round opened`; dedupe `bell:peer-request-expired:${requestId}` (+ `:peer`).
  - `listChangedBell(input: { text: string; dedupeKey: string }): WeeklyBellNotice` — title = the existing sentence (`HR added Ana Torvik as a peer for Q4 2026.`); dedupe `bell:${dedupeKey}`.
  - `formsOpenBell(input: { userId: string; cycleId: string; href: string; partner: boolean }): WeeklyBellNotice` — title `Quarter-end forms are open` / `Your quarter-end tables are open`; dedupe `bell:weekly-forms-open:${userId}:${cycleId}` (once per round, although the email repeats daily).
  - All links are `/evaluations/weekly`, except `formsOpenBell`, which uses the `href` the email already uses (`/admin/evaluation-round?tab=forms` for HR, `/evaluations/weekly` otherwise).
- Not in the bell (ruling): the HR "check your lists" mapping email from `sendMappingEmails` (it asks for an action: part 3's "Needs you"), question emails, reminders, digests.

- [ ] **Step 1: Write the failing tests.** `tests/weekly-bell-notices.test.ts` pins each builder's title, link and dedupe key with fictional names (`Ben Okafor`, `Cara Lindqvist`), e.g.:

```ts
test('the requester hears the decision in the email\'s words', () => {
  const bell = decisionBellForRequester({ requestId: 'pr1', approved: false, action: 'ADD', relation: 'PEER', otherName: 'Cara Lindqvist' })
  assert.equal(bell.title, `Your request to ${yourChange({ action: 'ADD', relation: 'PEER' }, 'Cara Lindqvist')} was not approved`)
  assert.equal(bell.link, '/evaluations/weekly')
  assert.equal(bell.dedupeKey, 'bell:peer-request-outcome:pr1')
})
```

  `tests/weekly-bell.integration.test.ts` (copy the `beforeEach`/`after` of `tests/weekly-notifications.integration.test.ts`; also `beforeEach` delete `userNotification` rows for `wkt-` users):
  - `forms opening rings the bell once per round, with emails off` — reach the forms-open day the way `tests/weekly-forms-email.integration.test.ts` does; run the daily job on two consecutive days; `WEEKLY_FORMS_OPEN` rows per pending evaluator = 1.
  - `a person without an email still gets the bell` — set `W.ana`'s email to `null` first; after the forms-open run she has one row and the email result counts her as skipped.
  - `a payroll-inactive person gets nothing`.
  - `HR deciding a list-change request rings the requester` — create and decide a request the way `tests/weekly-peer-requests.integration.test.ts` does; the requester has one `WEEKLY_LIST_DECISION` row; a peer request's peer has one too.
  - `HR changing lists mid-round rings both people` — call the round-people change as `tests/weekly-*` round tests do; both have one `WEEKLY_LIST_CHANGED` row whose title starts `HR added` or `HR removed`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the builders, the `deliverOnce` change and the four attach points (`bell` added to the message objects already built there; no other change to those functions).
- [ ] **Step 4: Verify.** New tests PASS; the existing weekly DB suite still passes: `DATABASE_URL=… WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/weekly-notifications.integration.test.ts tests/weekly-forms-email.integration.test.ts tests/weekly-peer-requests.integration.test.ts tests/weekly-round-people.integration.test.ts` (skip any name that does not exist; run `ls tests/weekly-*round*` to find the round-people suite). `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: bell notices for weekly list decisions, list changes and forms opening"` (with the Co-Authored-By line).

---

### Task 9: Search endpoint

**Files:**
- Create: `lib/search/query.ts`, `lib/search/service.ts`, `app/api/search/route.ts`
- Test: `tests/search-query.test.ts`, `tests/search-handbook.test.ts` (pure), `tests/search.integration.test.ts` (DB; prefix `srch-`)

**Interfaces:**
- Consumes: Task 5 `ACTIVE_PERSON_WHERE`, `companyPeopleWhere`; `isThreeEDepartment` (`lib/company-branding.ts`); `toHubResponse`, `PageInput` (`lib/handbook/audience.ts`); `filterPages` (`lib/handbook/search.ts`); `getAllPages` (`lib/handbook/queries.ts`); `loadTeamCatalog` (`lib/teams/load.ts`); `accessibleProjectsWhere` (`lib/project-access.ts`).
- Produces (`lib/search/query.ts`): `const SEARCH_MIN = 2`, `const SEARCH_MAX = 64`; `parseSearchQuery(raw: string | null | undefined): string | null` — trims, collapses inner whitespace, `null` when shorter than `SEARCH_MIN`, cut to `SEARCH_MAX`.
- Produces (`lib/search/service.ts`):
  - `const SEARCH_LIMITS = { people: 6, handbook: 5, projects: 5, tasks: 5 } as const`
  - `interface SearchViewer { id: string; role: string; position: string | null; department: string | null; teamTag: string | null }`
  - `interface SearchPerson { id: string; name: string; position: string | null; department: string | null; href: string }` — `href` `/people?focus=${id}`
  - `interface SearchHandbookPage { slug: string; title: string; description: string | null; href: string }` — `href` `/handbook/${slug}`
  - `interface SearchProject { id: string; name: string; status: string; href: string }` — `href` `/projects/${id}`
  - `interface SearchTask { id: string; title: string; projectName: string; dueDate: string | null; href: string }` — `dueDate` ISO string or null; `href` `/projects/${projectId}?task=${encodeURIComponent(id)}` (the existing deep link read by `readSharedTaskId`)
  - `interface SearchResults { people: SearchPerson[]; handbook: SearchHandbookPage[]; projects: SearchProject[]; tasks: SearchTask[] }`
  - `const EMPTY_RESULTS: SearchResults`
  - `searchPeople(viewer: SearchViewer, q: string, db?): Promise<SearchPerson[]>` — `ACTIVE_PERSON_WHERE` AND `companyPeopleWhere(isThreeEDepartment(viewer.department))` AND name/position/department `contains` `q` (insensitive); post-filter with `isThreeEDepartment`; name asc; `select` only `id, name, position, department`.
  - `matchHandbook(pages: PageInput[], tag: string | null, everyTeam: readonly string[], q: string, limit?: number): SearchHandbookPage[]` — `filterPages(toHubResponse(pages, tag, everyTeam).pages, q)` cut to `limit` (default `SEARCH_LIMITS.handbook`). Uses the viewer's own `teamTag` (no HR preview).
  - `searchWork(viewer: SearchViewer, q: string, db?): Promise<{ projects: SearchProject[]; tasks: SearchTask[] }>` — projects: `status not ARCHIVED`, `OR [{ ownerId: viewer.id }, { members: { some: { userId: viewer.id } } }]` (membership only, even for HR and partners), name `contains`; tasks: the `/api/my-tasks` ACTIVE filter (`project: accessibleProjectsWhere(viewer)`, assignee or assistant, not in a backlog section, `status not DONE`), title `contains`, `dueDate asc` nulls last.
  - `searchEverything(viewer: SearchViewer, q: string): Promise<SearchResults>` — the three in parallel.
- Produces (route): `GET /api/search?q=` → 401 `{ success: false, error: 'Unauthorized' }`; `parseSearchQuery` null → 200 `{ success: true, data: EMPTY_RESULTS }`; `checkRateLimit(\`search:${user.id}\`, 300)` → 429 `{ success: false, error: 'Too many searches. Wait a moment and try again.' }` (allow on `RateLimitUnavailableError`); 200 `{ success: true, data: SearchResults }`; 500 `{ success: false, error: 'Search is unavailable right now. Try again.' }` with `console.error('[search] failed', { error })`. Header `Cache-Control: no-store`.

- [ ] **Step 1: Write the failing tests.** `tests/search-query.test.ts`:

```ts
test('queries are trimmed, collapsed, bounded', () => {
  assert.equal(parseSearchQuery('  time   off '), 'time off')
  assert.equal(parseSearchQuery('a'), null)
  assert.equal(parseSearchQuery(null), null)
  assert.equal(parseSearchQuery('x'.repeat(100))?.length, 64)
})
```

  `tests/search-handbook.test.ts` (invented content, `PageInput` shape from `lib/handbook/audience.ts`, see `tests/handbook-audience.test.ts` for building one): `another team's variant is never matched`, `unpublished pages are never matched`, `title and description both match`, `results stop at the limit`.

  `tests/search.integration.test.ts` (users `srch-viewer` Product, `srch-nodept` `department: null`, `srch-3e` `' 3E '`, `srch-gone` payroll-inactive, `srch-3e-viewer` `3E`; all names contain the token `Quillon`; a project `srch-proj` owned by `srch-viewer`, an ARCHIVED project, a project `srch-other` with no viewer membership; tasks: one open assigned to the viewer, one DONE assigned to the viewer, one open assigned to someone else; clean up by prefix):
  - `people search keeps null-department colleagues and stays in the viewer's company` — Plutus21 viewer, `q 'quillon'`: `srch-` ids `['srch-nodept', 'srch-viewer']`; 3E viewer: `['srch-3e', 'srch-3e-viewer']`.
  - `people results carry no private fields` — `Object.keys(result[0]).sort()` = `['department', 'href', 'id', 'name', 'position']`.
  - `your work finds your projects and open tasks only` — projects ids `['srch-proj']`; tasks: only the open one assigned to the viewer, `href` `/projects/srch-proj?task=…`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the three modules.
- [ ] **Step 4: Verify.** Pure tests PASS; DB test PASS with the DB env; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: search endpoint for people, handbook and your work"` (with the Co-Authored-By line).

---

### Task 10: Search box, Ctrl K / ⌘K and the command palette

**Files:**
- Create: `lib/search/shortcut.ts`, `lib/search/match-pages.ts`
- Create: `components/search/use-search-results.ts`, `components/search/CommandPalette.tsx`, `components/search/SearchTrigger.tsx`
- Modify: `components/layout/TopBar.tsx` (search trigger on the left of the right-hand cluster; one global `keydown` listener)
- Test: `tests/search-shortcut.test.ts`, `tests/search-match-pages.test.ts`

**Interfaces:**
- Consumes: Task 1 `SearchPage`; Task 2 `TopBar` props `pages`, `locked`; Task 9 `SearchResults`, `parseSearchQuery`, `GET /api/search`.
- Produces:
  - `lib/search/shortcut.ts`: `isMacPlatform(platform: string): boolean` (`/mac|iphone|ipad|ipod/i`); `shortcutLabel(isMac: boolean): 'Ctrl K' | '⌘K'`; `isPaletteShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean` — `key` `k`/`K` with Ctrl or Meta and no Alt (both modifiers accepted on every platform; the hint shows the platform's own).
  - `lib/search/match-pages.ts`: `matchPages(pages: readonly SearchPage[], query: string, limit?: number): SearchPage[]` — default `limit` 8; empty query → first `limit` pages in menu order; otherwise rank 0 label starts with query, 1 label contains, 2 a keyword contains or starts with it, 3 section contains; stable within a rank; case-insensitive.
  - `components/search/use-search-results.ts`: `useSearchResults(query: string): { results: SearchResults | null; loading: boolean; error: string | null }` — 200 ms debounce; requests only when `parseSearchQuery(query)` is non-null; aborts the previous request; `error` `'Search is unavailable right now. Pages still work.'` on failure.
  - `components/search/CommandPalette.tsx`: `CommandPalette(props: { open: boolean; onOpenChange: (open: boolean) => void; pages: readonly SearchPage[] }): JSX.Element` — `Dialog`/`DialogContent` from `components/ui/dialog` with an `sr-only` `DialogTitle` "Search Compass", `cmdk` `Command` with `shouldFilter={false}`, input placeholder "Search pages, people, handbook and your work"; groups in order Pages, People, Handbook, Your work (projects then tasks); people rows show name and `position · department`; tasks show project name and `formatDate(dueDate, { fallback: 'No due date' })`; selecting any row `router.push(href)` and closes; empty state `No matches for “{query}”.`; the input is cleared when the palette closes.
  - `components/search/SearchTrigger.tsx`: `SearchTrigger(props: { onOpen: () => void; hint: string }): JSX.Element` — from `md` up a button styled like an input ("Search Compass" plus a `<kbd>` with `hint`); below `md` an icon button with `aria-label="Search"`.
  - `TopBar` renders the trigger and palette only when `!locked && user`.

- [ ] **Step 1: Write the failing tests.** `tests/search-shortcut.test.ts`:

```ts
test('the hint follows the platform', () => {
  assert.equal(shortcutLabel(isMacPlatform('MacIntel')), '⌘K')
  assert.equal(shortcutLabel(isMacPlatform('Win32')), 'Ctrl K')
  assert.equal(shortcutLabel(isMacPlatform('Linux x86_64')), 'Ctrl K')
})

test('Ctrl K and Cmd K open the palette, other keys do not', () => {
  const e = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }>) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods })
  assert.equal(isPaletteShortcut(e('k', { ctrlKey: true })), true)
  assert.equal(isPaletteShortcut(e('K', { metaKey: true })), true)
  assert.equal(isPaletteShortcut(e('k', {})), false)
  assert.equal(isPaletteShortcut(e('k', { ctrlKey: true, altKey: true })), false)
  assert.equal(isPaletteShortcut(e('j', { ctrlKey: true })), false)
})
```

  `tests/search-match-pages.test.ts` uses the real menu: `searchablePages(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx), ctx)` with `hasClientele: true`:

```ts
test('old names find renamed pages', () => {
  const first = (q: string) => matchPages(pages, q)[0]?.href
  assert.equal(first('leave'), '/leave')
  assert.equal(first('my tasks'), '/my-tasks')
  assert.equal(first('device support'), '/device-support')
  assert.equal(first('clientele'), '/clientele')
  assert.equal(first('org chart'), '/people')
  assert.equal(first('directory'), '/people')
})

test('label prefix beats a keyword match, and case does not matter', () => {
  assert.equal(matchPages(pages, 'PRO')[0].href, '/projects')
  assert.equal(matchPages(pages, 'profile')[0].href, '/profile')
})

test('an empty query lists the menu in order, up to the limit', () => {
  assert.deepEqual(matchPages(pages, '', 3).map((p) => p.href), ['/dashboard', '/leave', '/evaluations/weekly'])
})
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the libs, hook and components; wire into `TopBar`.
- [ ] **Step 4: Verify.** Tests PASS; `npx tsc --noEmit` clean; `npm test` (env-stripped) 19 failures.
- [ ] **Step 5: Commit.** `git commit -m "feat: search box with Ctrl K and a command palette"` (with the Co-Authored-By line).

---

### Task 11: Notification bell and avatar menu

**Files:**
- Create: `components/notifications/use-bell.ts`, `components/notifications/BellList.tsx`, `components/notifications/NotificationBell.tsx`
- Create: `components/layout/top-bar/UserMenu.tsx`, `components/layout/top-bar/user-subtitle.ts`
- Modify: `components/layout/TopBar.tsx` (final layout: mobile menu button on the left; on the right search trigger, bell, theme toggle, avatar menu; the bare logout icon is removed)
- Test: `tests/bell-list.test.ts` (render), `tests/user-subtitle.test.ts`, `tests/top-bar-wiring.test.ts` (source)

**Interfaces:**
- Consumes: Task 6 `BellItem`, `BellRef`, `GET /api/notifications`, `POST /api/notifications/read`; Task 2 `TopBar` props.
- Produces:
  - `use-bell.ts`: `useBell(enabled: boolean): { items: BellItem[]; unread: number; loading: boolean; error: string | null; refresh: () => Promise<void>; markShownRead: () => Promise<void> }` — fetches on mount, every 120 s while `document.visibilityState === 'visible'`, and on window focus; `markShownRead` posts the unread items' refs (at most 60) and sets them read locally; failures set `error`, never throw.
  - `BellList.tsx`: `BellList(props: { items: readonly BellItem[]; loading: boolean; error: string | null; onSelect: (item: BellItem) => void; now?: Date }): JSX.Element` — rows are `<button>`s (no router inside, so it renders in tests) with the title, optional detail, `formatDateTime(createdAt, { now })` and an unread dot (`data-unread="true"`); loading shows three `Skeleton` rows; error `Could not load notifications.`; empty `Nothing new. Updates about your leave, evaluations and security checks show up here.`
  - `NotificationBell.tsx`: `NotificationBell(): JSX.Element` — `Popover` with a `Bell` icon button (`aria-label` `Notifications` or `Notifications, N unread`), red-free unread dot `bg-primary` when `unread > 0`; opening calls `refresh()` then `markShownRead()`; selecting a row closes the popover and `router.push(item.href)`.
  - `user-subtitle.ts`: `userSubtitle(user: { role: string; position?: string | null; department?: string | null }): string` — first non-blank of position, department, role.
  - `UserMenu.tsx`: `UserMenu(props: { user: { name: string; role: string; position?: string | null; department?: string | null } }): JSX.Element` — `DropdownMenu` trigger: `UserAvatar` + name + `userSubtitle` (text hidden below `md`); items `Profile` (`/profile`) and `Sign out`. Sign out: `fetch('/api/auth/logout', { method: 'POST' })`; on network failure `toast.error('Could not sign out. Try again.')` and stay; otherwise `clearSelectedCompany()` then `router.push('/login')`.
  - `TopBar` final props: `{ user: LayoutUser | null; pages: readonly SearchPage[]; locked: boolean; onMenuClick: () => void; className?: string }`. `user === null` → skeleton avatar only. `locked` → no search, no bell (their APIs are blocked during onboarding); theme toggle and avatar menu stay.

- [ ] **Step 1: Write the failing tests.** `tests/bell-list.test.ts`:

```ts
const item = (patch: Partial<BellItem>): BellItem => ({ id: 'n1', source: 'compass', kind: 'LEAVE_APPROVED', title: 'Your annual leave, Thu 19 – Mon 23 Nov, was approved', detail: null, href: '/leave?requestId=r1', createdAt: '2026-11-11T09:30:00.000Z', read: false, ...patch })
const render = (props: Partial<Parameters<typeof BellList>[0]>) => renderToStaticMarkup(createElement(BellList, { items: [], loading: false, error: null, onSelect: () => {}, now: new Date('2026-11-11T12:00:00Z'), ...props }))

test('rows show the title, the Karachi time and an unread dot', () => {
  const html = render({ items: [item({}), item({ id: 'n2', read: true })] })
  assert.match(html, /Your annual leave, Thu 19 – Mon 23 Nov, was approved/)
  assert.match(html, /Wed 11 Nov, 14:30/)
  assert.equal(html.match(/data-unread="true"/g)?.length, 1)
})

test('titles are text, never markup', () => {
  assert.match(render({ items: [item({ title: '<img src=x onerror=alert(1)>' })] }), /&lt;img src=x/)
})

test('empty and error states', () => {
  assert.match(render({}), /Nothing new\./)
  assert.match(render({ error: 'x' }), /Could not load notifications\./)
})
```

  `tests/user-subtitle.test.ts`: position wins; blank position falls back to department; then role.

  `tests/top-bar-wiring.test.ts` (source):

```ts
const topBar = read('components/layout/TopBar.tsx')
const menu = read('components/layout/top-bar/UserMenu.tsx')

test('sign out keeps today\'s steps', () => {
  assert.match(menu, /fetch\('\/api\/auth\/logout', \{ method: 'POST' \}\)/)
  assert.ok(menu.indexOf('clearSelectedCompany()') < menu.indexOf("router.push('/login')"))
  assert.match(menu, /href="\/profile"|router\.push\('\/profile'\)/)
})

test('top bar hides search and bell for a locked hire and keeps the theme toggle', () => {
  assert.match(topBar, /<ThemeToggle/)
  assert.match(topBar, /!locked[\s\S]*<NotificationBell/)
  assert.match(topBar, /!locked[\s\S]*<SearchTrigger/)
})

test('no browser dialogs in the new frame', () => {
  for (const file of ['components/layout/TopBar.tsx', 'components/layout/top-bar/UserMenu.tsx', 'components/notifications/NotificationBell.tsx', 'components/search/CommandPalette.tsx', 'components/people/PeopleWorkspace.tsx']) {
    assert.doesNotMatch(read(file), /window\.(alert|confirm|prompt)|\b(alert|confirm|prompt)\(/, file)
  }
})
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the hook, components and the final `TopBar`.
- [ ] **Step 4: Verify.** Tests PASS; `npx tsc --noEmit` clean; `npm test` (env-stripped) 19 failures.
- [ ] **Step 5: Commit.** `git commit -m "feat: notification bell and avatar menu in the top bar"` (with the Co-Authored-By line).

---

### Task 12: Whole-part verification and the checklist walk (commit only if something was fixed)

- [ ] `npx tsc --noEmit` — no errors.
- [ ] `env -u DATABASE_URL -u WEEKLY_DB_TEST npm test` — exactly 19 failures (18 api-integration, 1 rate-limit).
- [ ] `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test WEEKLY_DB_TEST=true node --import tsx --test --test-concurrency=1 tests/people-directory.integration.test.ts tests/notifications-service.integration.test.ts tests/notifications-leave.integration.test.ts tests/weekly-bell.integration.test.ts tests/search.integration.test.ts tests/weekly-notifications.integration.test.ts tests/weekly-peer-requests.integration.test.ts` — all pass.
- [ ] `git diff --stat main...HEAD -- lib/email.ts app/api/admin/org-chart "app/(hr)/admin/org-chart" lib/academy/lockout.ts` — empty.
- [ ] `git diff main...HEAD -- prisma/migrations` — only the new `20261111120000_user_notifications` folder.
- [ ] `find app components lib -name '*.ts*' -newer docs/superpowers/plans/2026-11-11-employee-ux-refresh-part-2-frame.md | xargs wc -l | sort -n | tail` — no file this part created is over 800 lines.
- [ ] Walk the appendix "Shell" rows and record where each lives now: session redirect and `useLayoutUser` (Task 2); onboarding lockout and menu (Tasks 1–2); Clients, Evaluations badge, Help & IT ↔ Security swap, Payment details, Subscription Management (Task 1 tests); footer role switches, collapse toggle, mobile sheet (Task 2 wiring); theme toggle, avatar with name and title, sign out (Task 11); admin/security/security-checks console menus and their conditional items (Task 1 admin and security tests). "Team directory → People, My team" is now reachable at `/people` (Home keeps its card until part 3).
- [ ] Optional smoke run if the environment allows without new installs: `DATABASE_URL=postgresql://compass:compass@localhost:5433/compass_weekly_test npx next dev -p 3100` with a fictional user from the test DB; check light and dark mode, Ctrl K, the bell, the avatar menu, `/people` both tabs, and a 3E user without the map tab. Stop the server afterwards.
- [ ] If anything was fixed: `git commit -m "fix: <what>"` with the Co-Authored-By line. Do not push.

---

## Interfaces later parts consume

- `PageContainer({ children, width?: 'default' | 'wide' | 'reading', className? })` from `components/layout/page-container.tsx` — Home and Time off use `width` default.
- `PageHeader({ title, subtitle?, dateLine?, actions?, className? })` from `components/layout/page-header.tsx` — Home passes `dateLine` (today's date) and the summary as `subtitle`; Time off passes **Request leave** in `actions`.
- `useLayoutUser()` from `components/layout/SidebarLayout.tsx` (unchanged shape).
- `ACTIVE_PERSON_WHERE`, `companyPeopleWhere()` from `lib/people/directory.ts` (Home's "Out today" may reuse them).
- `BellItem`, `NotificationKind`, `recordNotificationsSafely()` from `lib/notifications/service.ts`; `notifyLeave()`, `notifyLeaveFor()`, `notifyWfh()` from `lib/notifications/leave.ts` — part 4 must keep these calls when it touches the leave routes (it rebuilds the page, not the routes).
- `resolveSidebarConfig()`, `flattenNav()`, `MenuContext` from `components/layout/sidebar-config.ts`.
