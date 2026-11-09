import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import {
  TeamTagConflictError,
  createTeamTag,
  listTeamTagsForAdmin,
  reorderTeamTags,
  updateTeamTag,
} from '../lib/teams/admin'
import { checkAssignableTeamTag, checkTeamTags, loadTeamCatalog } from '../lib/teams/load'

/**
 * HR team-tag management against a real database. Runs only against the local
 * compass_teamtags_test database (built with `prisma migrate deploy`, so the
 * seeded tags come from the migration itself) and only with TEAM_TAGS_DB_TEST=true.
 * Everything it creates is prefixed ZZT_ and removed afterwards.
 */
function isTeamTagsTestDatabase(url: string | undefined): boolean {
  try {
    const parsed = new URL(url ?? '')
    return (
      ['127.0.0.1', 'localhost'].includes(parsed.hostname) &&
      parsed.pathname === '/compass_teamtags_test'
    )
  } catch {
    return false
  }
}

const READY =
  process.env.TEAM_TAGS_DB_TEST === 'true' && isTeamTagsTestDatabase(process.env.DATABASE_URL)
const DB = {
  skip: READY ? false : 'Set TEAM_TAGS_DB_TEST=true and DATABASE_URL to the local compass_teamtags_test database',
}

const PREFIX = 'ZZT_'
const PAGE_EVERYONE = 'zzt-everyone'
const PAGE_SPLIT = 'zzt-split'

async function cleanup() {
  await prisma.handbookPage.deleteMany({ where: { slug: { in: [PAGE_EVERYONE, PAGE_SPLIT] } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: 'zzt-' } } })
  await prisma.teamTagDefinition.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

async function pageWithVariants(slug: string, audiences: string[][]) {
  return prisma.handbookPage.create({
    data: {
      slug,
      title: slug,
      icon: 'x',
      category: 'POLICIES',
      isPublished: true,
      variants: {
        create: audiences.map((teams, orderIndex) => ({
          bodyMarkdown: `body ${orderIndex}`,
          orderIndex,
          audiences: { create: teams.map((team) => ({ team })) },
        })),
      },
    },
    include: { variants: { include: { audiences: true }, orderBy: { orderIndex: 'asc' } } },
  })
}

before(async () => {
  if (READY) await cleanup()
})
after(async () => {
  if (READY) {
    await cleanup()
    // Reorder tests shuffle the seeded tags; put the migration's order back.
    const seeded = await prisma.teamTagDefinition.findMany({ orderBy: { sortOrder: 'asc' } })
    await reorderTeamTags(seeded.map((t) => t.code).sort((a, b) => SEED_ORDER.indexOf(a) - SEED_ORDER.indexOf(b)))
  }
  await prisma.$disconnect()
})

const SEED_ORDER = [
  'PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'ECUADOR', 'NOBLE', 'BOSNIA',
  'THREE_E_PAKISTAN', 'THREE_E_MOROCCO',
]

test('the migration seeds the eight existing tags plus Bosnia', DB, async () => {
  const catalog = await loadTeamCatalog()
  for (const code of SEED_ORDER) assert.ok(catalog.all.includes(code), `${code} missing`)
  assert.equal(catalog.definitions.find((d) => d.code === 'BOSNIA')?.label, 'Bosnia Team')
  assert.deepEqual(
    catalog.definitions.filter((d) => !d.isInternal).map((d) => d.code).sort(),
    ['THREE_E_MOROCCO', 'THREE_E_PAKISTAN']
  )
})

test('a new internal tag joins Everyone and Internal handbook variants only', DB, async () => {
  const catalog = await loadTeamCatalog()
  const internal = catalog.internal.filter((t) => catalog.active.includes(t))
  const external = catalog.active.filter((t) => !internal.includes(t))
  const everyone = await pageWithVariants(PAGE_EVERYONE, [[...catalog.active]])
  const split = await pageWithVariants(PAGE_SPLIT, [internal, external])

  const result = await createTeamTag({ code: `${PREFIX}NEWLAND`, label: 'ZZT Newland Team', shortLabel: null, isInternal: true })
  assert.equal(result.tag.code, `${PREFIX}NEWLAND`)

  const audiencesOf = async (variantId: string) =>
    (await prisma.handbookAudience.findMany({ where: { variantId } })).map((a) => a.team)
  assert.ok((await audiencesOf(everyone.variants[0].id)).includes(`${PREFIX}NEWLAND`))
  assert.ok((await audiencesOf(split.variants[0].id)).includes(`${PREFIX}NEWLAND`))
  assert.ok(!(await audiencesOf(split.variants[1].id)).includes(`${PREFIX}NEWLAND`))

  // New tags go to the end of the list.
  const list = await listTeamTagsForAdmin()
  assert.equal(list[list.length - 1].code, `${PREFIX}NEWLAND`)
})

test('duplicate codes and names are refused', DB, async () => {
  await assert.rejects(
    createTeamTag({ code: 'BOSNIA', label: 'Another Bosnia', shortLabel: null, isInternal: true }),
    TeamTagConflictError
  )
  await assert.rejects(
    createTeamTag({ code: `${PREFIX}DUP`, label: 'bosnia team', shortLabel: null, isInternal: true }),
    TeamTagConflictError
  )
})

test('archived tags stay valid on records, keep their user, and cannot be newly assigned', DB, async () => {
  await createTeamTag({ code: `${PREFIX}OLD`, label: 'ZZT Old Team', shortLabel: null, isInternal: true })
  await prisma.user.create({ data: { id: 'zzt-user', name: 'Fixture Person', teamTag: `${PREFIX}OLD` } })

  await updateTeamTag({ code: `${PREFIX}OLD`, archived: true })
  const catalog = await loadTeamCatalog()
  assert.ok(catalog.all.includes(`${PREFIX}OLD`))
  assert.ok(!catalog.active.includes(`${PREFIX}OLD`))

  assert.deepEqual(await checkTeamTags([`${PREFIX}OLD`]), { ok: true })
  assert.equal((await checkAssignableTeamTag(`${PREFIX}OLD`)).ok, false)
  assert.deepEqual(await checkAssignableTeamTag(`${PREFIX}OLD`, `${PREFIX}OLD`), { ok: true })
  assert.equal((await checkAssignableTeamTag('ATLANTIS')).ok, false)

  const user = await prisma.user.findUnique({ where: { id: 'zzt-user' } })
  assert.equal(user?.teamTag, `${PREFIX}OLD`)

  await updateTeamTag({ code: `${PREFIX}OLD`, archived: false, label: 'ZZT Renamed Team' })
  const renamed = (await loadTeamCatalog()).definitions.find((d) => d.code === `${PREFIX}OLD`)
  assert.equal(renamed?.label, 'ZZT Renamed Team')
  assert.equal(renamed?.archivedAt, null)
})

test('the user foreign key rejects an unknown tag', DB, async () => {
  await assert.rejects(
    prisma.user.create({ data: { id: 'zzt-bad', name: 'Fixture Bad', teamTag: 'ATLANTIS' } })
  )
})

test('reorder rewrites display order and refuses a stale list', DB, async () => {
  const codes = (await listTeamTagsForAdmin()).map((t) => t.code)
  const reversed = [...codes].reverse()
  await reorderTeamTags(reversed)
  assert.deepEqual((await loadTeamCatalog()).all, reversed)
  await assert.rejects(reorderTeamTags(codes.slice(1)), TeamTagConflictError)
})
