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
