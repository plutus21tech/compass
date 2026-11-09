import { prisma } from '@/lib/db'
import { variantsReachingNewTeam } from './backfill'
import type { CreateTeamTagInput, UpdateTeamTagInput } from './schemas'

/**
 * HR's team-tag management. Tags are never deleted -- they are stored on users,
 * holidays and handbook audiences -- so the lifecycle is create, rename, archive.
 */

const ADMIN_SELECT = {
  code: true,
  label: true,
  shortLabel: true,
  isInternal: true,
  sortOrder: true,
  archivedAt: true,
  _count: { select: { users: true } },
} as const

const SORT_STEP = 10

export class TeamTagConflictError extends Error {}
export class TeamTagNotFoundError extends Error {}

function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

export async function listTeamTagsForAdmin() {
  const rows = await prisma.teamTagDefinition.findMany({
    select: ADMIN_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return rows.map(({ _count, ...row }) => ({ ...row, userCount: _count.users }))
}

/**
 * Creates a tag at the end of the list and, in the same transaction, adds it to
 * the handbook variants written for its whole group (see variantsReachingNewTeam),
 * so "Everyone" content reaches the new team from day one.
 */
export async function createTeamTag(input: CreateTeamTagInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.teamTagDefinition.findMany({
      select: { code: true, label: true, isInternal: true, sortOrder: true, archivedAt: true },
    })
    if (existing.some((tag) => tag.code === input.code)) {
      throw new TeamTagConflictError(`A team tag with code ${input.code} already exists`)
    }
    if (existing.some((tag) => sameLabel(tag.label, input.label))) {
      throw new TeamTagConflictError(`A team tag named "${input.label}" already exists`)
    }

    const created = await tx.teamTagDefinition.create({
      data: {
        code: input.code,
        label: input.label,
        shortLabel: input.shortLabel ?? null,
        isInternal: input.isInternal,
        sortOrder: Math.max(0, ...existing.map((tag) => tag.sortOrder)) + SORT_STEP,
      },
    })

    const group = existing
      .filter((tag) => tag.archivedAt === null && (!input.isInternal || tag.isInternal))
      .map((tag) => tag.code)
    const variants = await tx.handbookVariant.findMany({
      select: { id: true, audiences: { select: { team: true } } },
    })
    const variantIds = variantsReachingNewTeam(
      variants.map((v) => ({ id: v.id, audiences: v.audiences.map((a) => a.team) })),
      group
    )
    if (variantIds.length > 0) {
      await tx.handbookAudience.createMany({
        data: variantIds.map((variantId) => ({ variantId, team: created.code })),
        skipDuplicates: true,
      })
    }

    return { tag: created, handbookVariantsExtended: variantIds.length }
  })
}

/** Renames, toggles internal, or archives/unarchives. The code never changes. */
export async function updateTeamTag(input: UpdateTeamTagInput) {
  const current = await prisma.teamTagDefinition.findUnique({ where: { code: input.code } })
  if (!current) throw new TeamTagNotFoundError('Team tag not found')

  if (input.label !== undefined && !sameLabel(input.label, current.label)) {
    const clash = await prisma.teamTagDefinition.findFirst({
      where: { code: { not: input.code }, label: { equals: input.label, mode: 'insensitive' } },
      select: { code: true },
    })
    if (clash) throw new TeamTagConflictError(`A team tag named "${input.label}" already exists`)
  }

  return prisma.teamTagDefinition.update({
    where: { code: input.code },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.shortLabel !== undefined ? { shortLabel: input.shortLabel } : {}),
      ...(input.isInternal !== undefined ? { isInternal: input.isInternal } : {}),
      ...(input.archived !== undefined
        ? { archivedAt: input.archived ? current.archivedAt ?? new Date() : null }
        : {}),
    },
  })
}

/** Rewrites display order from a full list of codes. */
export async function reorderTeamTags(order: readonly string[]) {
  const existing = await prisma.teamTagDefinition.findMany({ select: { code: true } })
  const known = new Set(existing.map((tag) => tag.code))
  if (order.length !== known.size || order.some((code) => !known.has(code))) {
    throw new TeamTagConflictError('The tag list changed; reload and try again')
  }

  await prisma.$transaction(
    order.map((code, index) =>
      prisma.teamTagDefinition.update({
        where: { code },
        data: { sortOrder: (index + 1) * SORT_STEP },
      })
    )
  )
}
