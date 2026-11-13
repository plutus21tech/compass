import type { HandbookCategory } from '@prisma/client'
import type { AudienceGroup, TeamCatalog, TeamTag } from '@/lib/teams/catalog'
import type { PageInput } from './audience'

/**
 * A page as the admin sees it: the reader shape plus the recorded gap
 * decisions. Extends PageInput rather than widening it, so the reader stays
 * unable to see intentionalGapTeams -- it has no use for them.
 */
export type AdminPageInput = PageInput & { intentionalGapTeams: TeamTag[] }

export type CellState = 'COVERED' | 'INTENTIONAL' | 'UNREVIEWED'

export type CoverageCell = {
  team: TeamTag
  state: CellState
  variantId: string | null
}

export type CoverageRow = {
  pageId: string
  slug: string
  title: string
  category: HandbookCategory
  isPublished: boolean
  cells: CoverageCell[]
}

export type CoverageSummary = {
  total: number
  covered: number
  intentional: number
  unreviewed: number
}

/**
 * One cell per page x team. Three states, not two: without separating a
 * decision from an omission, permanently-intentional gaps would flag forever
 * and real omissions would hide in the noise.
 *
 * `teams` are the columns -- the catalog's active tags. An archived team is no
 * longer something HR needs to write content for, so it would only add noise.
 */
export function computeCoverage(
  pages: AdminPageInput[],
  teams: readonly TeamTag[]
): CoverageRow[] {
  return pages.map((page) => ({
    pageId: page.id,
    slug: page.slug,
    title: page.title,
    category: page.category,
    isPublished: page.isPublished,
    cells: teams.map((team): CoverageCell => {
      const variant = page.variants.find((v) => v.audiences.includes(team))
      if (variant) {
        // Coverage beats the annotation: if a variant addresses this team, the
        // person can see it, whatever intentionalGapTeams claims.
        return { team, state: 'COVERED', variantId: variant.id }
      }
      const state: CellState = page.intentionalGapTeams.includes(team)
        ? 'INTENTIONAL'
        : 'UNREVIEWED'
      return { team, state, variantId: null }
    }),
  }))
}

export function summarizeCoverage(rows: CoverageRow[]): CoverageSummary {
  const cells = rows.flatMap((r) => r.cells)
  return {
    total: cells.length,
    covered: cells.filter((c) => c.state === 'COVERED').length,
    intentional: cells.filter((c) => c.state === 'INTENTIONAL').length,
    unreviewed: cells.filter((c) => c.state === 'UNREVIEWED').length,
  }
}

/**
 * Which derived group, if any, this exact set of teams represents.
 *
 * Takes readonly string[] rather than TeamTag[] deliberately: the editor holds
 * its audience state as string[], and a narrower signature here would force a
 * cast at every call site to buy nothing.
 */
export function matchGroup(
  teams: readonly string[],
  catalog: Pick<TeamCatalog, 'active' | 'internal'>
): AudienceGroup | null {
  // Compared against active tags only: whether an archived tag is still on the
  // variant should not change what HR is told the audience is.
  const set = new Set(teams.filter((t) => catalog.active.includes(t)))
  const covers = (group: readonly string[]) =>
    set.size === group.length && group.every((t) => set.has(t))

  if (set.size === 0) return null
  if (covers(catalog.active)) return 'EVERYONE'
  if (covers(catalog.internal.filter((t) => catalog.active.includes(t)))) {
    return 'PLUTUS21_INTERNAL'
  }
  return null
}
