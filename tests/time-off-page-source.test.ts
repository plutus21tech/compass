import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = 'app/(evaluator)/leave/page.tsx'

const listTs = (dir: string): string[] =>
  readdirSync(join(ROOT, dir))
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `${dir}/${name}`)

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8')
const lineCount = (file: string): number => read(file).split('\n').length

const files = [PAGE, ...listTs('components/leave/time-off'), ...listTs('lib/time-off')]

test('every time off file stays under 800 lines and the page under 300', () => {
  for (const f of files) assert.ok(lineCount(f) < 800, `${f} has ${lineCount(f)} lines`)
  assert.ok(lineCount(PAGE) < 300, `${PAGE} has ${lineCount(PAGE)} lines`)
})

test('no browser alert, confirm or prompt', () => {
  for (const f of files) assert.doesNotMatch(read(f), /\b(window\.)?(alert|confirm|prompt)\s*\(/, f)
})

test('nothing lost: every endpoint the old page called is still called', () => {
  const all = files.map(read).join('\n')
  // The fetch client builds some URLs and methods through helpers (`${planUrl(id)}/review`,
  // send('PUT', ...)); tests/time-off-api.test.ts pins the exact URL, method and body of each call.
  const needles: Array<string | string[]> = [
    '/api/leave/balance',
    '/api/leave/requests?employeeId=me',
    "'/api/users'",
    '/api/leave/requests?forApproval=true',
    '/api/wfh/requests?employeeId=me',
    '/api/wfh/requests?forApproval=true',
    '/api/leave/calendar?month=',
    '/api/leave/approve',
    '/api/wfh/approve',
    ['/transition-plan/review', '${planUrl(id)}/review'],
    '/transition-plan`',
    'detectBrowserLeaveTimeZone',
    ["method: 'PUT'", "send('PUT'"],
    ["method: 'DELETE'", "send('DELETE'"],
  ]
  for (const needle of needles) {
    const options = Array.isArray(needle) ? needle : [needle]
    assert.ok(options.some((n) => all.includes(n)), options.join(' | '))
  }
})

test('the page uses the shared frame and handles both deep links', () => {
  const page = read(PAGE)
  for (const needle of ['<PageContainer', '<PageHeader', 'parseTimeOffParams', 'deepLinkTarget', 'router.replace', 'leave-approval-']) {
    assert.ok(page.includes(needle) || files.some((f) => read(f).includes(needle)), needle)
  }
})

test('no slash counts in time off copy', () => {
  for (const f of files) assert.doesNotMatch(read(f), /\{[^}]+\}\s*\/\s*\{[^}]+\}\s*days/, f)
})
