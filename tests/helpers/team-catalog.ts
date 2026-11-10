import { buildTeamCatalog, type TeamTagDefinition } from '../../lib/teams/catalog'

/**
 * The eight team tags that existed before HR could add their own, as the
 * migration seeds them. Pure tests use this instead of a database.
 */
export const LEGACY_TEAM_DEFINITIONS: TeamTagDefinition[] = [
  { code: 'PAKISTAN', label: 'Pakistan Team', shortLabel: 'PK', isInternal: true, sortOrder: 10, archivedAt: null },
  { code: 'MOROCCO', label: 'Morocco Team', shortLabel: 'MA', isInternal: true, sortOrder: 20, archivedAt: null },
  { code: 'COLOMBIA', label: 'Colombia Team', shortLabel: 'CO', isInternal: true, sortOrder: 30, archivedAt: null },
  { code: 'INDONESIA', label: 'Indonesia Team', shortLabel: 'ID', isInternal: true, sortOrder: 40, archivedAt: null },
  { code: 'ECUADOR', label: 'Ecuador Team', shortLabel: 'EC', isInternal: true, sortOrder: 50, archivedAt: null },
  { code: 'NOBLE', label: 'Noble Team', shortLabel: 'NB', isInternal: true, sortOrder: 60, archivedAt: null },
  { code: 'THREE_E_PAKISTAN', label: '3E Pakistan Team', shortLabel: '3E PK', isInternal: false, sortOrder: 80, archivedAt: null },
  { code: 'THREE_E_MOROCCO', label: '3E Morocco Team', shortLabel: '3E MA', isInternal: false, sortOrder: 90, archivedAt: null },
]

export const BOSNIA_DEFINITION: TeamTagDefinition = {
  code: 'BOSNIA',
  label: 'Bosnia Team',
  shortLabel: 'BA',
  isInternal: true,
  sortOrder: 70,
  archivedAt: null,
}

export const LEGACY_CATALOG = buildTeamCatalog(LEGACY_TEAM_DEFINITIONS)
export const ALL_TEAMS = LEGACY_CATALOG.all
export const INTERNAL_TEAMS = LEGACY_CATALOG.internal

/** Today's catalog: the legacy eight plus Bosnia. */
export const CURRENT_CATALOG = buildTeamCatalog([...LEGACY_TEAM_DEFINITIONS, BOSNIA_DEFINITION])
