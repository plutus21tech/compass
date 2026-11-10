import type { TeamTag } from './catalog'

type VariantAudience = { id: string; audiences: readonly TeamTag[] }

/**
 * Handbook variants a newly created team should join.
 *
 * Audiences are stored as explicit teams; "Everyone" and "Plutus21 Internal" are
 * expanded when HR saves. Without this, a variant written for "Everyone" would
 * silently stop being for everyone the day a new country is added. So a new team
 * joins every variant that already covers its whole group: all active teams, or
 * all active internal teams when the new team is internal -- the same rule the
 * Ecuador and Bosnia migrations applied by hand.
 *
 * Within a page variants never share a team, so at most one variant per page can
 * cover a whole group and the new team never ends up on two of them.
 */
export function variantsReachingNewTeam(
  variants: readonly VariantAudience[],
  group: readonly TeamTag[]
): string[] {
  if (group.length === 0) return []
  return variants
    .filter((variant) => group.every((team) => variant.audiences.includes(team)))
    .map((variant) => variant.id)
}
