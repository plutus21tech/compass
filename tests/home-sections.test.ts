import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NeedsYouList } from '../components/home/NeedsYouList'
import { MyWorkPanel } from '../components/home/MyWorkPanel'
import type { NeedsYouItem } from '../lib/home/needs-you'
import type { HomeProject, HomeTask } from '../lib/home/my-work'

const item = (over: Partial<NeedsYouItem>): NeedsYouItem => ({
  key: 'a',
  source: 'weekly',
  eyebrow: 'Weekly evaluation',
  title: 'Answer 3 questions',
  detail: 'About 2 minutes',
  dueDay: '2099-01-02',
  href: '/evaluations',
  action: 'Answer',
  prefetch: true,
  ...over,
})

const renderNeeds = (data: { items: NeedsYouItem[]; incomplete: boolean } | null) =>
  renderToStaticMarkup(createElement(NeedsYouList, { data, todayKey: '2026-11-11' }))

test('needs you: one button per item, overdue marked', () => {
  const html = renderNeeds({
    items: [item({ key: 'a', dueDay: '2026-11-01' }), item({ key: 'b', title: 'Read it', href: '/self', action: 'Read' })],
    incomplete: false,
  })
  assert.equal(html.match(/<a /g)?.length, 2)
  assert.match(html, /Overdue since/)
  assert.match(html, /2 open, sorted by due date/)
})

test('needs you: empty state', () => {
  assert.match(renderNeeds({ items: [], incomplete: false }), /Nothing needs you right now\./)
})

test('needs you: academy links are not prefetched', () => {
  assert.match(readFileSync('components/home/NeedsYouList.tsx', 'utf8'), /prefetch=\{item\.prefetch \? undefined : false\}/)
})

test('needs you: incomplete note', () => {
  assert.match(renderNeeds({ items: [item({})], incomplete: true }), /Some items could not be loaded\. Refresh to try again\./)
})

test('needs you: show more reveals the rest', () => {
  const items = Array.from({ length: 8 }, (_, i) => item({ key: `k${i}`, title: `T${i}` }))
  const html = renderNeeds({ items, incomplete: false })
  assert.match(html, /Show 2 more/)
  assert.equal(html.match(/<a /g)?.length, 6)
})

test('my work: tasks are buttons, projects are links', () => {
  const tasks: HomeTask[] = [
    { id: 't1', title: 'Brand identity', status: 'TODO', priority: 'MEDIUM', dueDate: null, project: { id: 'p1', name: 'Engine' }, section: { name: 'To do' } },
  ]
  const projects: HomeProject[] = [
    { id: 'p1', name: 'Engine', status: 'ACTIVE', owner: { id: 'u1' }, members: [], progress: { completed: 86, total: 108, percentage: 80 } },
  ]
  const html = renderToStaticMarkup(
    createElement(MyWorkPanel, {
      tasks: { ok: true, data: tasks },
      projects: { ok: true, data: projects },
      viewerId: 'u1',
      onOpenTask: () => {},
    })
  )
  assert.match(html, /<button/)
  assert.match(html, /href="\/projects\/p1"/)
  assert.match(html, /href="\/my-tasks"/)
  assert.match(html, /86 of 108 tasks done/)
  assert.match(html, /No due date/)
})

test('my work: empty states', () => {
  const html = renderToStaticMarkup(
    createElement(MyWorkPanel, {
      tasks: { ok: true, data: [] },
      projects: { ok: true, data: [] },
      viewerId: 'u1',
      onOpenTask: () => {},
    })
  )
  assert.match(html, /No open tasks\. Nice\./)
  assert.match(html, /You have no active projects\./)
})

test('the side sheet reuses the task panel', () => {
  const src = readFileSync('components/home/HomeTaskSheet.tsx', 'utf8')
  assert.match(src, /import \{[^}]*TaskDetailPanel[^}]*\} from '@\/components\/projects\/TaskDetailPanel'/)
  assert.match(src, /panelContextFromProject\(/)
  assert.match(src, /`\/api\/projects\/\$\{/)
  assert.doesNotMatch(src, /router\.push/)
})

test('needs you: an empty list with failed sources never claims nothing needs you', () => {
  const html = renderNeeds({ items: [], incomplete: true })
  assert.doesNotMatch(html, /Nothing needs you right now\./)
  assert.match(html, /Some items could not be loaded\./)
})
