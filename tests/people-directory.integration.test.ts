import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { loadCompanyMap } from '../lib/people/directory'
import { WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

/** Fictional people only. */
const PEOPLE = [
  { id: 'ppl-lead', name: 'Petra Lund', position: 'Lead', department: 'Product' },
  { id: 'ppl-ana', name: 'Pablo Ancel', position: 'Analyst', department: 'Product' },
  { id: 'ppl-nodept', name: 'Priya Nadeau', position: 'Analyst', department: null },
  { id: 'ppl-3e', name: 'Paavo Eskola', position: 'Analyst', department: ' 3E ' },
  { id: 'ppl-gone', name: 'Pia Gorman', position: 'Analyst', department: 'Product' },
]

async function cleanUp() {
  await prisma.evaluatorMapping.deleteMany({
    where: { OR: [{ evaluatorId: { startsWith: 'ppl-' } }, { evaluateeId: { startsWith: 'ppl-' } }] },
  })
  await prisma.payrollEmployeeProfile.deleteMany({ where: { userId: { startsWith: 'ppl-' } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: 'ppl-' } } })
}

const own = <T extends { id: string }>(rows: T[]) => rows.filter((row) => row.id.startsWith('ppl-'))

before(async () => {
  if (!WEEKLY_DB_READY) return
  await cleanUp()
  for (const person of PEOPLE) {
    await prisma.user.create({ data: { ...person, email: `${person.id}@example.test`, role: 'EMPLOYEE', onboardingCompleted: true } })
  }
  await prisma.payrollEmployeeProfile.create({ data: { userId: 'ppl-gone', isPayrollActive: false } })
  const mappings = [
    ['ppl-lead', 'ppl-ana', 'TEAM_LEAD'],
    ['ppl-lead', 'ppl-nodept', 'TEAM_LEAD'],
    ['ppl-ana', 'ppl-lead', 'PEER'],
    ['ppl-lead', 'ppl-ana', 'HR'],
  ] as const
  for (const [evaluatorId, evaluateeId, relationshipType] of mappings) {
    await prisma.evaluatorMapping.create({ data: { evaluatorId, evaluateeId, relationshipType } })
  }
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanUp()
  await prisma.$disconnect()
})

const viewer = { id: 'ppl-lead', department: 'Product' }

test('the map carries TEAM_LEAD lines only', WEEKLY_DB_TEST, async () => {
  const map = await loadCompanyMap(viewer)
  assert.ok(map)
  const links = map.links
    .filter((link) => link.leadId.startsWith('ppl-') || link.reportId.startsWith('ppl-'))
    .sort((left, right) => `${left.leadId}>${left.reportId}`.localeCompare(`${right.leadId}>${right.reportId}`))
  assert.deepEqual(links, [
    { leadId: 'ppl-lead', reportId: 'ppl-ana' },
    { leadId: 'ppl-lead', reportId: 'ppl-nodept' },
  ])
})

test('null-department people are on the map, 3E and inactive people are not', WEEKLY_DB_TEST, async () => {
  const map = await loadCompanyMap(viewer)
  assert.ok(map)
  assert.deepEqual(own(map.people).map((person) => person.id).sort(), ['ppl-ana', 'ppl-lead', 'ppl-nodept'])
})

test('people carry only id, name, position and department', WEEKLY_DB_TEST, async () => {
  const map = await loadCompanyMap(viewer)
  assert.ok(map)
  assert.deepEqual(Object.keys(map.people[0]).sort(), ['department', 'id', 'name', 'position'])
})

test('a 3E viewer gets no map', WEEKLY_DB_TEST, async () => {
  assert.equal(await loadCompanyMap({ id: 'ppl-3e', department: ' 3E ' }), null)
})
