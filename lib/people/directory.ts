import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'

/** People still on the books: no payroll profile, or an active one. */
export const ACTIVE_PERSON_WHERE: Prisma.UserWhereInput = {
  OR: [{ payrollProfile: { is: null } }, { payrollProfile: { is: { isPayrollActive: true } } }],
}

/**
 * The viewer's company. Callers also post-filter with `isThreeEDepartment`, which
 * catches padded values such as ' 3E ' that an equals filter misses.
 */
export function companyPeopleWhere(viewerIs3E: boolean): Prisma.UserWhereInput {
  if (viewerIs3E) return { department: { equals: '3E', mode: 'insensitive' } }
  return { OR: [{ department: null }, { NOT: { department: { equals: '3E', mode: 'insensitive' } } }] }
}

export interface DirectoryPerson {
  id: string
  name: string
  position: string | null
  department: string | null
}

export interface ReportingLink {
  leadId: string
  reportId: string
}

export interface CompanyMapData {
  viewerId: string
  people: DirectoryPerson[]
  links: ReportingLink[]
}

/**
 * The company map: active Plutus21 people (names, titles, departments only) and the
 * TEAM_LEAD reporting lines between them. No other relationship type leaves this function.
 * A 3E viewer gets `null` (no map).
 */
export async function loadCompanyMap(
  viewer: { id: string; department: string | null },
  db: PrismaClient = prisma
): Promise<CompanyMapData | null> {
  if (isThreeEDepartment(viewer.department)) return null

  const rows = await db.user.findMany({
    where: { AND: [ACTIVE_PERSON_WHERE, companyPeopleWhere(false)] },
    select: { id: true, name: true, position: true, department: true },
    orderBy: { name: 'asc' },
  })
  const people: DirectoryPerson[] = rows
    .filter((row) => !isThreeEDepartment(row.department))
    .map((row) => ({ id: row.id, name: row.name, position: row.position, department: row.department }))
  const ids = new Set(people.map((person) => person.id))

  const mappings = await db.evaluatorMapping.findMany({
    where: { relationshipType: 'TEAM_LEAD' },
    select: { evaluatorId: true, evaluateeId: true },
  })
  const seen = new Set<string>()
  const links: ReportingLink[] = []
  for (const { evaluatorId, evaluateeId } of mappings) {
    const key = `${evaluatorId}>${evaluateeId}`
    if (evaluatorId === evaluateeId || seen.has(key)) continue
    if (!ids.has(evaluatorId) || !ids.has(evaluateeId)) continue
    seen.add(key)
    links.push({ leadId: evaluatorId, reportId: evaluateeId })
  }

  return { viewerId: viewer.id, people, links }
}
