import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'
import { ACTIVE_PERSON_WHERE, companyPeopleWhere } from '@/lib/people/directory'
import { toHubResponse, type PageInput } from '@/lib/handbook/audience'
import { filterPages } from '@/lib/handbook/search'
import { getAllPages } from '@/lib/handbook/queries'
import { loadTeamCatalog } from '@/lib/teams/load'
import { accessibleProjectsWhere } from '@/lib/project-access'

export const SEARCH_LIMITS = { people: 6, handbook: 5, projects: 5, tasks: 5 } as const

// Over-fetch so the padded-3E post-filter still leaves a full page of results.
const PEOPLE_FETCH_CAP = 60

export interface SearchViewer {
  id: string
  role: string
  position: string | null
  department: string | null
  teamTag: string | null
}

export interface SearchPerson {
  id: string
  name: string
  position: string | null
  department: string | null
  href: string
}

export interface SearchHandbookPage {
  slug: string
  title: string
  description: string | null
  href: string
}

export interface SearchProject {
  id: string
  name: string
  status: string
  href: string
}

export interface SearchTask {
  id: string
  title: string
  projectName: string
  dueDate: string | null
  href: string
}

export interface SearchResults {
  people: SearchPerson[]
  handbook: SearchHandbookPage[]
  projects: SearchProject[]
  tasks: SearchTask[]
}

export const EMPTY_RESULTS: SearchResults = { people: [], handbook: [], projects: [], tasks: [] }

export async function searchPeople(
  viewer: SearchViewer,
  q: string,
  db: PrismaClient = prisma
): Promise<SearchPerson[]> {
  // A padded ' 3E ' slips past the equals filter, so 3E viewers pre-filter loosely and the
  // post-filter below makes the exact call.
  const viewerIs3E = isThreeEDepartment(viewer.department)
  const contains = { contains: q, mode: 'insensitive' as const }
  const rows = await db.user.findMany({
    where: {
      AND: [
        ACTIVE_PERSON_WHERE,
        viewerIs3E ? { department: { contains: '3E', mode: 'insensitive' } } : companyPeopleWhere(false),
        { OR: [{ name: contains }, { position: contains }, { department: contains }] },
      ],
    },
    select: { id: true, name: true, position: true, department: true },
    orderBy: { name: 'asc' },
    take: PEOPLE_FETCH_CAP,
  })
  return rows
    .filter((row) => isThreeEDepartment(row.department) === viewerIs3E)
    .slice(0, SEARCH_LIMITS.people)
    .map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      department: row.department,
      href: `/people?focus=${row.id}`,
    }))
}

export function matchHandbook(
  pages: PageInput[],
  tag: string | null,
  everyTeam: readonly string[],
  q: string,
  limit: number = SEARCH_LIMITS.handbook
): SearchHandbookPage[] {
  return filterPages(toHubResponse(pages, tag, everyTeam).pages, q)
    .slice(0, limit)
    .map((page) => ({
      slug: page.slug,
      title: page.title,
      description: page.description,
      href: `/handbook/${page.slug}`,
    }))
}

async function searchHandbook(viewer: SearchViewer, q: string): Promise<SearchHandbookPage[]> {
  const [pages, teams] = await Promise.all([getAllPages(), loadTeamCatalog()])
  return matchHandbook(pages, viewer.teamTag, teams.active, q)
}

export async function searchWork(
  viewer: SearchViewer,
  q: string,
  db: PrismaClient = prisma
): Promise<{ projects: SearchProject[]; tasks: SearchTask[] }> {
  const [projects, tasks] = await Promise.all([
    db.project.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        OR: [{ ownerId: viewer.id }, { members: { some: { userId: viewer.id } } }],
        name: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, name: true, status: true },
      orderBy: { name: 'asc' },
      take: SEARCH_LIMITS.projects,
    }),
    db.task.findMany({
      where: {
        project: accessibleProjectsWhere(viewer),
        AND: [
          { OR: [{ assigneeId: viewer.id }, { assistants: { some: { userId: viewer.id } } }] },
          { OR: [{ sectionId: null }, { section: { is: { isBacklog: false } } }] },
        ],
        status: { not: 'DONE' },
        title: { contains: q, mode: 'insensitive' },
      },
      select: { id: true, title: true, dueDate: true, projectId: true, project: { select: { name: true } } },
      orderBy: { dueDate: { sort: 'asc', nulls: 'last' } },
      take: SEARCH_LIMITS.tasks,
    }),
  ])
  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status, href: `/projects/${p.id}` })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.project.name,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      href: `/projects/${t.projectId}?task=${encodeURIComponent(t.id)}`,
    })),
  }
}

export async function searchEverything(viewer: SearchViewer, q: string): Promise<SearchResults> {
  const [people, handbook, work] = await Promise.all([
    searchPeople(viewer, q),
    searchHandbook(viewer, q),
    searchWork(viewer, q),
  ])
  return { people, handbook, projects: work.projects, tasks: work.tasks }
}
