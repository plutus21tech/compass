import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
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
