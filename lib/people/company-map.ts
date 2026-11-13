import { buildHierarchyOrgChartScene, type OrgChartMapping, type OrgChartUser } from '@/lib/org-chart'
import type { CompanyMapData, DirectoryPerson, ReportingLink } from './directory'

export interface PersonNodeData {
  name: string
  position: string | null
  department: string | null
  isViewer: boolean
  /** Names of every lead, sorted. */
  leads: string[]
}

export interface CompanyNodeData {
  label: string
}

export interface CompanyMapNode {
  id: string
  type: 'person' | 'company'
  position: { x: number; y: number }
  data: PersonNodeData | CompanyNodeData
}

export interface CompanyMapEdge {
  id: string
  source: string
  target: string
}

export interface CompanyMapScene {
  nodes: CompanyMapNode[]
  edges: CompanyMapEdge[]
}

const DEFAULT_SEARCH_LIMIT = 8

const byName = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: 'base' })

/** Drops self links, duplicates and links whose ends are not on the map. */
function usableLinks(links: readonly ReportingLink[], ids: ReadonlySet<string>): ReportingLink[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = `${link.leadId}>${link.reportId}`
    if (link.leadId === link.reportId || seen.has(key)) return false
    if (!ids.has(link.leadId) || !ids.has(link.reportId)) return false
    seen.add(key)
    return true
  })
}

function toOrgChartUser(person: DirectoryPerson): OrgChartUser {
  // The admin's saved chart positions are not used here.
  return { ...person, role: '', chartX: null, chartY: null }
}

function toOrgChartMapping(link: ReportingLink, usersById: ReadonlyMap<string, OrgChartUser>): OrgChartMapping {
  return {
    id: `${link.leadId}>${link.reportId}`,
    evaluatorId: link.leadId,
    evaluateeId: link.reportId,
    relationshipType: 'TEAM_LEAD',
    evaluator: usersById.get(link.leadId)!,
    evaluatee: usersById.get(link.reportId)!,
  }
}

function leadNamesByReport(links: readonly ReportingLink[], peopleById: ReadonlyMap<string, DirectoryPerson>) {
  const leads = new Map<string, string[]>()
  for (const link of links) {
    const name = peopleById.get(link.leadId)?.name
    if (!name) continue
    leads.set(link.reportId, [...(leads.get(link.reportId) ?? []), name])
  }
  return leads
}

/** The People page's company map: reporting lines only, laid out top-down from the company. */
export function buildCompanyMapScene(data: CompanyMapData, companyName: string): CompanyMapScene {
  const peopleById = new Map(data.people.map((person) => [person.id, person]))
  const links = usableLinks(data.links, new Set(peopleById.keys()))
  const users = data.people.map(toOrgChartUser)
  const usersById = new Map(users.map((user) => [user.id, user]))
  const mappings = links.map((link) => toOrgChartMapping(link, usersById))
  const leads = leadNamesByReport(links, peopleById)
  const scene = buildHierarchyOrgChartScene(users, mappings)

  const nodes: CompanyMapNode[] = scene.nodes.flatMap((node): CompanyMapNode[] => {
    if (node.kind === 'company') {
      return [{ id: node.id, type: 'company', position: { ...node.position }, data: { label: companyName } }]
    }
    const person = node.kind === 'employee' ? peopleById.get(node.id) : undefined
    if (!person) return []
    return [{
      id: person.id,
      type: 'person',
      position: { ...node.position },
      data: {
        name: person.name,
        position: person.position,
        department: person.department,
        isViewer: person.id === data.viewerId,
        leads: [...(leads.get(person.id) ?? [])].sort(byName),
      },
    }]
  })
  const edges = scene.edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))
  return { nodes, edges }
}

function matchRank(name: string, query: string): number {
  const lower = name.toLowerCase()
  if (lower.startsWith(query)) return 0
  if (lower.split(/\s+/).some((word) => word.startsWith(query))) return 1
  return lower.includes(query) ? 2 : -1
}

/** Case-insensitive name search: name prefix first, then word prefix, then anywhere. */
export function findPeople(
  people: readonly DirectoryPerson[],
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT
): DirectoryPerson[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return people
    .map((person, index) => ({ person, index, rank: matchRank(person.name, needle) }))
    .filter((entry) => entry.rank >= 0)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.person)
}
