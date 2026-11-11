import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BellList } from '../components/notifications/BellList'
import { markUnreadAsRead } from '../components/notifications/use-bell'
import type { BellItem } from '../lib/notifications/service'

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

test('a failing mark-read keeps the loaded items visible and unread', async () => {
  const items = [item({}), item({ id: 'n2' })]
  const failing = (async () => ({ ok: false })) as unknown as typeof fetch
  const throwing = (async () => { throw new Error('offline') }) as unknown as typeof fetch
  for (const f of [failing, throwing]) {
    const after = await markUnreadAsRead(items, f)
    assert.equal(after, items)
    const html = render({ items: after, error: null })
    assert.equal(html.match(/data-unread="true"/g)?.length, 2)
    assert.doesNotMatch(html, /Could not load/)
  }
  const ok = (async () => ({ ok: true })) as unknown as typeof fetch
  assert.ok((await markUnreadAsRead(items, ok)).every((i) => i.read))
})
