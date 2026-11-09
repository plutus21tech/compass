/**
 * Team tags ("Pakistan Team", "Bosnia Team", ...) as pure data.
 *
 * Tags live in the TeamTagDefinition table so HR can add a country without a
 * deploy. Everything here is pure and works on a loaded catalog, so it can be
 * shared by server code (see ./load.ts) and client components (see
 * ./use-team-catalog.ts) and tested without a database.
 */

/** A tag's code, e.g. "PAKISTAN". UPPER_SNAKE and immutable once created. */
export type TeamTag = string

export type TeamTagDefinition = {
  code: TeamTag
  label: string
  shortLabel: string | null
  isInternal: boolean
  sortOrder: number
  /** Date on the server, ISO string once it has crossed the API. */
  archivedAt: Date | string | null
}

export type TeamCatalog = {
  /** Every definition, archived included, in display order. */
  definitions: readonly TeamTagDefinition[]
  /**
   * Every code, archived included. Archived tags still sit on users and records,
   * so anything that resolves "everyone" (holidays, handbook groups, emails)
   * must keep reaching them.
   */
  all: readonly TeamTag[]
  /** Codes that can be newly assigned and are offered in pickers. */
  active: readonly TeamTag[]
  /** "Plutus21 Internal Team", archived included for the same reason as `all`. */
  internal: readonly TeamTag[]
}

/**
 * Derived groups. These are never stored on a user or a variant -- they expand
 * to the underlying teams at author time.
 */
export type AudienceGroup = 'EVERYONE' | 'PLUTUS21_INTERNAL'

/**
 * Teams whose public holidays are always the same.
 *
 * Pakistan only. PAKISTAN and THREE_E_PAKISTAN are one country split by employing
 * entity, and a Pakistani national holiday reaches everyone there -- the same
 * reasoning the original team-tagging migration used when it backfilled both.
 *
 * MOROCCO and THREE_E_MOROCCO are deliberately NOT paired. Despite sitting in the
 * same country, 3E Morocco observes US public holidays rather than Moroccan ones,
 * so a Moroccan holiday must not widen to them. Their holidays are recorded as
 * ordinary rows tagged THREE_E_MOROCCO.
 *
 * This is a business rule about those specific codes, so it stays in code. Tags
 * HR adds later are standalone.
 */
export const COUNTRY_TEAM_GROUPS: readonly (readonly TeamTag[])[] = [
  ['PAKISTAN', 'THREE_E_PAKISTAN'],
] as const

/** UPPER_SNAKE: letters, digits and single underscores, starting with a letter. */
export const TEAM_TAG_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/
export const TEAM_TAG_CODE_MAX_LENGTH = 40

function byDisplayOrder(a: TeamTagDefinition, b: TeamTagDefinition): number {
  return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
}

export function isArchived(definition: Pick<TeamTagDefinition, 'archivedAt'>): boolean {
  return definition.archivedAt !== null && definition.archivedAt !== undefined
}

export function buildTeamCatalog(definitions: readonly TeamTagDefinition[]): TeamCatalog {
  const sorted = [...definitions].sort(byDisplayOrder)
  return {
    definitions: sorted,
    all: sorted.map((d) => d.code),
    active: sorted.filter((d) => !isArchived(d)).map((d) => d.code),
    internal: sorted.filter((d) => d.isInternal).map((d) => d.code),
  }
}

export const EMPTY_TEAM_CATALOG: TeamCatalog = buildTeamCatalog([])

export function findTeamDefinition(
  catalog: TeamCatalog,
  code: string | null | undefined
): TeamTagDefinition | undefined {
  if (!code) return undefined
  return catalog.definitions.find((d) => d.code === code)
}

/** Display name. Falls back to the code so an unknown tag still shows something. */
export function teamLabel(catalog: TeamCatalog, code: TeamTag): string {
  return findTeamDefinition(catalog, code)?.label ?? code
}

/** Compact display name for dense grids. */
export function teamShortLabel(catalog: TeamCatalog, code: TeamTag): string {
  const definition = findTeamDefinition(catalog, code)
  return definition?.shortLabel || definition?.label || code
}

/** Any known tag, archived included: valid on existing records. */
export function isTeamTag(catalog: TeamCatalog, code: unknown): code is TeamTag {
  return typeof code === 'string' && catalog.all.includes(code)
}

/** Only active tags can be newly assigned. */
export function isAssignableTeamTag(catalog: TeamCatalog, code: unknown): code is TeamTag {
  return typeof code === 'string' && catalog.active.includes(code)
}

/** The codes in `codes` that are not known tags, for a precise error message. */
export function unknownTeamTags(catalog: TeamCatalog, codes: readonly unknown[]): string[] {
  return codes.filter((code) => !isTeamTag(catalog, code)).map(String)
}

/**
 * The teams a group means today. Active tags only: authoring "Everyone" should not
 * resurrect an archived team on new content.
 */
export function expandGroup(group: AudienceGroup, catalog: TeamCatalog): TeamTag[] {
  const members = group === 'EVERYONE' ? catalog.all : catalog.internal
  return members.filter((code) => catalog.active.includes(code))
}

/**
 * The options a picker should offer: every active tag, plus any archived tag the
 * record already carries so it stays visible and can be removed.
 */
export function pickerTeams(catalog: TeamCatalog, selected: readonly TeamTag[] = []): TeamTag[] {
  return catalog.all.filter((code) => catalog.active.includes(code) || selected.includes(code))
}

/** "Bosnia Team" -> "BOSNIA", "3E Bosnia Team" -> "THREE_E_BOSNIA"-style codes. */
export function suggestTeamTagCode(label: string): string {
  const withoutSuffix = label.trim().replace(/\s+team$/i, '')
  const code = withoutSuffix
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^3E\b/i, 'THREE_E')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9_]+/, '')
  return code.slice(0, TEAM_TAG_CODE_MAX_LENGTH).replace(/_+$/, '')
}
