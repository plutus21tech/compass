import test from 'node:test'
import assert from 'node:assert/strict'
import type { PageInput } from '../lib/handbook/audience'
import { matchHandbook } from '../lib/search/service'
import { ALL_TEAMS } from './helpers/team-catalog'

function page(over: Partial<PageInput> & { slug: string }): PageInput {
  return {
    id: over.slug,
    title: over.slug,
    icon: 'Hand',
    category: 'POLICIES',
    orderIndex: 0,
    linkHref: null,
    linkLabel: null,
    isPublished: true,
    description: null,
    layout: null,
    variants: [{ id: `${over.slug}-v`, bodyMarkdown: 'body', orderIndex: 0, audiences: [...ALL_TEAMS] }],
    ...over,
  }
}

test("another team's variant is never matched", () => {
  const pages = [
    page({
      slug: 'zephyr-bonus',
      title: 'Zephyr bonus',
      variants: [{ id: 'v', bodyMarkdown: 'x', orderIndex: 0, audiences: ['MOROCCO'] }],
    }),
  ]
  assert.deepEqual(matchHandbook(pages, 'PAKISTAN', ALL_TEAMS, 'zephyr'), [])
  assert.equal(matchHandbook(pages, 'MOROCCO', ALL_TEAMS, 'zephyr').length, 1)
})

test('unpublished pages are never matched', () => {
  const pages = [page({ slug: 'draft-zephyr', title: 'Zephyr draft', isPublished: false })]
  assert.deepEqual(matchHandbook(pages, 'PAKISTAN', ALL_TEAMS, 'zephyr'), [])
})

test('title and description both match', () => {
  const pages = [
    page({ slug: 'a', title: 'Zephyr rules' }),
    page({ slug: 'b', title: 'Other', description: 'About zephyr days' }),
    page({ slug: 'c', title: 'Unrelated' }),
  ]
  const result = matchHandbook(pages, 'PAKISTAN', ALL_TEAMS, 'zephyr')
  assert.deepEqual(result.map((r) => r.slug), ['a', 'b'])
  assert.deepEqual(result[0], { slug: 'a', title: 'Zephyr rules', description: null, href: '/handbook/a' })
})

test('results stop at the limit', () => {
  const pages = Array.from({ length: 9 }, (_, i) => page({ slug: `z${i}`, title: `Zephyr ${i}`, orderIndex: i }))
  assert.equal(matchHandbook(pages, 'PAKISTAN', ALL_TEAMS, 'zephyr').length, 5)
  assert.equal(matchHandbook(pages, 'PAKISTAN', ALL_TEAMS, 'zephyr', 2).length, 2)
})
