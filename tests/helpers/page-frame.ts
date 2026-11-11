import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WRAPPER =
  /(max-w-(?:2xl|4xl|5xl|6xl|7xl|\[1300px\]|\[1600px\])[^"'`]*mx-auto|mx-auto[^"'`]*max-w-(?:2xl|4xl|5xl|6xl|7xl|\[1300px\]|\[1600px\]))/

export function assertAdoptsFrame(file: string, options: { header: boolean }): void {
  const source = readFileSync(join(process.cwd(), file), 'utf8')
  assert.match(source, /import\s*\{[^}]*\bPageContainer\b[^}]*\}\s*from\s*['"]@\/components\/layout\/page-container['"]/, `${file} must import PageContainer`)
  assert.match(source, /<PageContainer/, `${file} must render <PageContainer`)
  if (options.header) assert.match(source, /<PageHeader/, `${file} must render <PageHeader`)
  assert.doesNotMatch(source, WRAPPER, `${file} must not hand-roll a page-level wrapper`)
}
