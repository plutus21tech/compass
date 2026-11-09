/**
 * Team tags used to be a fixed list here. They are now HR-managed rows (see
 * lib/teams/catalog.ts); this module keeps the old import path working for the
 * pure helpers. Server code loads the catalog with loadTeamCatalog() from
 * lib/teams/load.ts and validates with checkTeamTags()/isTeamTag().
 */
export {
  COUNTRY_TEAM_GROUPS,
  expandGroup,
  isAssignableTeamTag,
  isTeamTag,
  pickerTeams,
  teamLabel,
  teamShortLabel,
  unknownTeamTags,
  type AudienceGroup,
  type TeamCatalog,
  type TeamTag,
  type TeamTagDefinition,
} from '@/lib/teams/catalog'
