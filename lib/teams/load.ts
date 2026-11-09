import { prisma } from '@/lib/db'
import {
  buildTeamCatalog,
  isAssignableTeamTag,
  unknownTeamTags,
  type TeamCatalog,
  type TeamTag,
} from './catalog'

/**
 * The team-tag catalog, read from TeamTagDefinition.
 *
 * Deliberately not cached across requests: the table is a handful of rows, and a
 * stale copy on another serverless instance would reject a tag HR created a moment
 * ago. Callers load it once per request and pass the catalog down.
 */
export async function loadTeamCatalog(): Promise<TeamCatalog> {
  const definitions = await prisma.teamTagDefinition.findMany({
    select: {
      code: true,
      label: true,
      shortLabel: true,
      isInternal: true,
      sortOrder: true,
      archivedAt: true,
    },
  })
  return buildTeamCatalog(definitions)
}

export type TeamTagCheck = { ok: true } | { ok: false; error: string }

/**
 * Validates codes for records that may carry archived tags (holidays, handbook
 * audiences): any known tag is accepted. One helper so every API reports the
 * same message.
 */
export async function checkTeamTags(codes: readonly unknown[]): Promise<TeamTagCheck> {
  const unknown = unknownTeamTags(await loadTeamCatalog(), codes)
  return unknown.length === 0
    ? { ok: true }
    : { ok: false, error: `Unknown team tag(s): ${unknown.join(', ')}` }
}

/**
 * Validates a tag being assigned to a person. Archived tags are refused unless the
 * person already has it, so re-saving an untouched profile never fails.
 */
export async function checkAssignableTeamTag(
  code: TeamTag,
  currentCode: TeamTag | null = null
): Promise<TeamTagCheck> {
  if (code === currentCode) return { ok: true }
  const catalog = await loadTeamCatalog()
  if (isAssignableTeamTag(catalog, code)) return { ok: true }
  return catalog.all.includes(code)
    ? { ok: false, error: 'That team tag is archived and can no longer be assigned' }
    : { ok: false, error: 'Invalid team tag' }
}
