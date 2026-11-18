// A person's own released results, as the My results tab shows them: scores only.
// Never evaluator names and never written feedback; only what the report email already told them.
import { ratingBandFor, scoreToStars } from '@/lib/stars'

export interface MyResultGroup {
  /** The relationship the scores came from: TEAM_LEAD, PEER, ... */
  key: string
  label: string
  /** Share of the overall score, 0 to 100. */
  weightPercent: number
  /** Out of 4. */
  score: number
}

export interface MyResultQuarter {
  periodId: string
  periodName: string
  /** Out of 4. */
  score: number
  band: string | null
  bandDescription: string | null
  groups: MyResultGroup[]
  /** When the report email went out; null when it was released without an email. */
  emailedAt: string | null
}

export interface MyResultsResponse {
  /** Released quarters, newest first. */
  quarters: MyResultQuarter[]
  /** A quarter whose report exists but is not released yet: "Q4 2026". */
  preparing: string | null
}

export const GROUP_LABELS: Record<string, string> = {
  C_LEVEL: 'Leadership',
  DEPT: 'Department',
  TEAM_LEAD: 'Your lead',
  DIRECT_REPORT: 'Your team',
  PEER: 'Your peers',
  CROSS_DEPARTMENT: 'Other departments',
  HR: 'HR',
  SELF: 'Self-evaluation',
}

const round2 = (value: number): number => Math.round(value * 100) / 100
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * The groups that counted toward the score, from a stored report's breakdown. Anything unreadable, unweighted or
 * without evaluators is left out, and nothing but the four fields below is ever read from the stored JSON.
 */
export function readGroups(breakdownJson: unknown): MyResultGroup[] {
  const breakdown = breakdownJson !== null && typeof breakdownJson === 'object' ? (breakdownJson as { breakdown?: unknown }).breakdown : null
  if (!Array.isArray(breakdown)) return []
  const groups: MyResultGroup[] = []
  for (const raw of breakdown) {
    const row = (raw ?? {}) as { relationshipType?: unknown; weight?: unknown; normalizedScore?: unknown; evaluatorCount?: unknown }
    if (typeof row.relationshipType !== 'string' || !isNumber(row.weight) || !isNumber(row.normalizedScore)) continue
    if (row.weight <= 0 || !isNumber(row.evaluatorCount) || row.evaluatorCount <= 0) continue
    groups.push({
      key: row.relationshipType,
      label: GROUP_LABELS[row.relationshipType] ?? row.relationshipType,
      weightPercent: Math.round(row.weight * 100),
      score: round2(row.normalizedScore),
    })
  }
  return groups.sort((a, b) => b.weightPercent - a.weightPercent || a.label.localeCompare(b.label))
}

export interface StoredResult {
  periodId: string
  periodName: string
  /** 0 to 100, as reports store it. */
  overallScore: number
  breakdownJson: unknown
  emailedAt: Date | null
}

export function quarterResult(stored: StoredResult): MyResultQuarter {
  const stars = scoreToStars(stored.overallScore)
  const band = ratingBandFor(stars)
  return {
    periodId: stored.periodId,
    periodName: stored.periodName,
    score: round2(stars),
    band: band?.label ?? null,
    bandDescription: band?.description ?? null,
    groups: readGroups(stored.breakdownJson),
    emailedAt: stored.emailedAt?.toISOString() ?? null,
  }
}

/** A quarter's results are out once HR released the round, or the person's report email was sent. */
export function isReleased(input: { emailSent: boolean; resultsPublishedAt: Date | null }): boolean {
  return input.emailSent || input.resultsPublishedAt !== null
}

/** The change from the quarter before (quarters are newest first); null for the earliest one. */
export function scoreChange(quarters: readonly MyResultQuarter[], index: number): number | null {
  const previous = quarters[index + 1]
  return previous ? round2(quarters[index].score - previous.score) : null
}

/** The group to work on next: the lowest score, when there is more than one group to compare. */
export function lowestGroup(groups: readonly MyResultGroup[]): MyResultGroup | null {
  if (groups.length < 2) return null
  return groups.reduce((lowest, group) => (group.score < lowest.score ? group : lowest))
}
