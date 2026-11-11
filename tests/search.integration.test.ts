import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { searchPeople, searchWork, type SearchViewer } from '../lib/search/service'
import { WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

/** Fictional people only; every name carries the token Quillon. */
const PEOPLE = [
  { id: 'srch-viewer', name: 'Ada Quillon', position: 'Analyst', department: 'Product' },
  { id: 'srch-nodept', name: 'Bea Quillon', position: 'Analyst', department: null },
  { id: 'srch-3e', name: 'Cy Quillon', position: 'Analyst', department: ' 3E ' },
  { id: 'srch-gone', name: 'Di Quillon', position: 'Analyst', department: 'Product' },
  { id: 'srch-3e-viewer', name: 'Ed Quillon', position: 'Analyst', department: '3E' },
]

async function cleanUp() {
  await prisma.task.deleteMany({ where: { projectId: { startsWith: 'srch-' } } })
  await prisma.project.deleteMany({ where: { id: { startsWith: 'srch-' } } })
  await prisma.payrollEmployeeProfile.deleteMany({ where: { userId: { startsWith: 'srch-' } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: 'srch-' } } })
}

const own = <T extends { id: string }>(rows: T[]) => rows.filter((row) => row.id.startsWith('srch-')).map((row) => row.id).sort()

const viewer: SearchViewer = { id: 'srch-viewer', role: 'EMPLOYEE', position: 'Analyst', department: 'Product', teamTag: null }
const viewer3E: SearchViewer = { id: 'srch-3e-viewer', role: 'EMPLOYEE', position: 'Analyst', department: '3E', teamTag: null }

before(async () => {
  if (!WEEKLY_DB_READY) return
  await cleanUp()
  for (const person of PEOPLE) {
    await prisma.user.create({ data: { ...person, email: `${person.id}@example.test`, role: 'EMPLOYEE', onboardingCompleted: true } })
  }
  await prisma.payrollEmployeeProfile.create({ data: { userId: 'srch-gone', isPayrollActive: false } })
  await prisma.project.create({ data: { id: 'srch-proj', name: 'Quillon launch', ownerId: 'srch-viewer' } })
  await prisma.project.create({ data: { id: 'srch-archived', name: 'Quillon old', ownerId: 'srch-viewer', status: 'ARCHIVED' } })
  await prisma.project.create({ data: { id: 'srch-other', name: 'Quillon secret', ownerId: 'srch-nodept' } })
  const base = { projectId: 'srch-proj', assigneeId: 'srch-viewer' }
  await prisma.task.create({ data: { id: 'srch-t-open', title: 'Quillon open task', ...base } })
  await prisma.task.create({ data: { id: 'srch-t-done', title: 'Quillon done task', status: 'DONE', ...base } })
  await prisma.task.create({ data: { id: 'srch-t-else', title: 'Quillon other task', projectId: 'srch-proj', assigneeId: 'srch-nodept' } })
})

after(async () => {
  if (WEEKLY_DB_READY) await cleanUp()
  await prisma.$disconnect()
})

test("people search keeps null-department colleagues and stays in the viewer's company", WEEKLY_DB_TEST, async () => {
  assert.deepEqual(own(await searchPeople(viewer, 'quillon')), ['srch-nodept', 'srch-viewer'])
  assert.deepEqual(own(await searchPeople(viewer3E, 'quillon')), ['srch-3e', 'srch-3e-viewer'])
})

test('people results carry no private fields', WEEKLY_DB_TEST, async () => {
  const result = await searchPeople(viewer, 'quillon')
  assert.deepEqual(Object.keys(result[0]).sort(), ['department', 'href', 'id', 'name', 'position'])
  assert.equal(result[0].href, `/people?focus=${result[0].id}`)
})

test('your work finds your projects and open tasks only', WEEKLY_DB_TEST, async () => {
  const work = await searchWork(viewer, 'quillon')
  assert.deepEqual(own(work.projects), ['srch-proj'])
  const tasks = work.tasks.filter((t) => t.id.startsWith('srch-'))
  assert.deepEqual(tasks.map((t) => t.id), ['srch-t-open'])
  assert.equal(tasks[0].href, '/projects/srch-proj?task=srch-t-open')
  assert.equal(tasks[0].projectName, 'Quillon launch')
})
