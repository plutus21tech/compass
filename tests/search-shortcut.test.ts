import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isMacPlatform, shortcutLabel, isPaletteShortcut } from '../lib/search/shortcut'

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

test('a held-down Ctrl K (key repeat) is swallowed but does not toggle the palette again', () => {
  const src = readFileSync(join(__dirname, '..', 'components/layout/TopBar.tsx'), 'utf8')
  assert.match(src, /if \(!isPaletteShortcut\(event\)\) return\s*event\.preventDefault\(\)\s*if \(event\.repeat\) return\s*setPaletteOpen/)
})
