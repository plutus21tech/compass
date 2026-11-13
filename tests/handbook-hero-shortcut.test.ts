import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Ctrl/Cmd+K belongs to the command palette alone; the handbook hero must not also grab it.
const source = readFileSync(join(__dirname, '..', 'components/handbook/HandbookHero.tsx'), 'utf8')

test('the handbook hero has no keyboard shortcut handler of its own', () => {
  assert.doesNotMatch(source, /addEventListener\('keydown'/)
  assert.doesNotMatch(source, /⌘K/)
})
