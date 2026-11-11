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
