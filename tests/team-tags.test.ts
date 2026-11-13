import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTeamCatalog,
  expandGroup,
  isAssignableTeamTag,
  isTeamTag,
  pickerTeams,
  suggestTeamTagCode,
  teamLabel,
  teamShortLabel,
  unknownTeamTags,
} from '../lib/teams/catalog'
import { variantsReachingNewTeam } from '../lib/teams/backfill'
import {
  createTeamTagSchema,
  reorderTeamTagsSchema,
  updateTeamTagSchema,
} from '../lib/teams/schemas'
import { matchGroup, computeCoverage, type AdminPageInput } from '../lib/handbook/coverage'
import { selectVariant } from '../lib/handbook/audience'
import { expandHolidayTeamTags, holidayAppliesTo } from '../lib/holidays'
import {
  BOSNIA_DEFINITION,
  CURRENT_CATALOG,
  LEGACY_TEAM_DEFINITIONS,
} from './helpers/team-catalog'

const withArchivedNoble = buildTeamCatalog(
  [...LEGACY_TEAM_DEFINITIONS, BOSNIA_DEFINITION].map((d) =>
    d.code === 'NOBLE' ? { ...d, archivedAt: '2026-11-01T00:00:00.000Z' } : d
  )
)

// ─── catalog ────────────────────────────────────────────────────────────────

test('catalog orders by sortOrder and places Bosnia among the internal teams', () => {
  assert.deepEqual(CURRENT_CATALOG.all, [
    'PAKISTAN',
    'MOROCCO',
    'COLOMBIA',
    'INDONESIA',
    'ECUADOR',
    'NOBLE',
    'BOSNIA',
    'THREE_E_PAKISTAN',
    'THREE_E_MOROCCO',
  ])
  assert.ok(CURRENT_CATALOG.internal.includes('BOSNIA'))
  assert.ok(!CURRENT_CATALOG.internal.includes('THREE_E_PAKISTAN'))
})

test('labels come from the catalog, falling back to the code', () => {
  assert.equal(teamLabel(CURRENT_CATALOG, 'BOSNIA'), 'Bosnia Team')
  assert.equal(teamShortLabel(CURRENT_CATALOG, 'THREE_E_PAKISTAN'), '3E PK')
  assert.equal(teamLabel(CURRENT_CATALOG, 'ATLANTIS'), 'ATLANTIS')
  assert.equal(teamShortLabel(CURRENT_CATALOG, 'ATLANTIS'), 'ATLANTIS')
})

test('archived tags stay valid on records but cannot be newly assigned', () => {
  assert.equal(isTeamTag(withArchivedNoble, 'NOBLE'), true)
  assert.equal(isAssignableTeamTag(withArchivedNoble, 'NOBLE'), false)
  assert.equal(isAssignableTeamTag(withArchivedNoble, 'BOSNIA'), true)
  assert.equal(isTeamTag(withArchivedNoble, 'ATLANTIS'), false)
  assert.deepEqual(unknownTeamTags(withArchivedNoble, ['NOBLE', 'ATLANTIS', 7]), ['ATLANTIS', '7'])
})

test('pickers offer active tags plus archived ones already selected', () => {
  assert.ok(!pickerTeams(withArchivedNoble).includes('NOBLE'))
  assert.ok(pickerTeams(withArchivedNoble, ['NOBLE']).includes('NOBLE'))
})

test('groups expand to active tags, and Everyone includes tags added later', () => {
  assert.ok(expandGroup('EVERYONE', CURRENT_CATALOG).includes('BOSNIA'))
  assert.ok(expandGroup('PLUTUS21_INTERNAL', CURRENT_CATALOG).includes('BOSNIA'))
  assert.ok(!expandGroup('EVERYONE', withArchivedNoble).includes('NOBLE'))
})

test('matchGroup ignores archived tags either way', () => {
  const everyoneNow = expandGroup('EVERYONE', withArchivedNoble)
  assert.equal(matchGroup(everyoneNow, withArchivedNoble), 'EVERYONE')
  assert.equal(matchGroup([...everyoneNow, 'NOBLE'], withArchivedNoble), 'EVERYONE')
  assert.equal(matchGroup([], withArchivedNoble), null)
})

// ─── codes and validation ───────────────────────────────────────────────────

test('suggestTeamTagCode derives an UPPER_SNAKE code from the name', () => {
  assert.equal(suggestTeamTagCode('Bosnia Team'), 'BOSNIA')
  assert.equal(suggestTeamTagCode('  south africa team '), 'SOUTH_AFRICA')
  assert.equal(suggestTeamTagCode('3E Bosnia Team'), 'THREE_E_BOSNIA')
  assert.equal(suggestTeamTagCode('Côte d’Ivoire'), 'COTE_D_IVOIRE')
  assert.equal(suggestTeamTagCode('---'), '')
})

test('create schema accepts a valid tag and rejects bad codes with a readable message', () => {
  const ok = createTeamTagSchema.safeParse({ code: 'BOSNIA', label: 'Bosnia Team', shortLabel: '' })
  assert.equal(ok.success, true)
  if (ok.success) {
    assert.equal(ok.data.isInternal, true)
    assert.equal(ok.data.shortLabel, null)
  }
  for (const code of ['bosnia', '1BOSNIA', 'BOS NIA', 'BOSNIA_', '']) {
    const bad = createTeamTagSchema.safeParse({ code, label: 'Bosnia Team' })
    assert.equal(bad.success, false, `accepted ${JSON.stringify(code)}`)
  }
  assert.equal(createTeamTagSchema.safeParse({ code: 'BOSNIA', label: '  ' }).success, false)
})

test('update schema needs at least one change; reorder rejects duplicates', () => {
  assert.equal(updateTeamTagSchema.safeParse({ code: 'BOSNIA' }).success, false)
  assert.equal(updateTeamTagSchema.safeParse({ code: 'BOSNIA', archived: true }).success, true)
  assert.equal(reorderTeamTagsSchema.safeParse({ order: ['A', 'A'] }).success, false)
  assert.equal(reorderTeamTagsSchema.safeParse({ order: ['A', 'B'] }).success, true)
})

// ─── new-team handbook backfill ─────────────────────────────────────────────

const internalTeams = ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'ECUADOR', 'NOBLE']
const allTeams = [...internalTeams, 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO']
const variants = [
  { id: 'everyone', audiences: allTeams },
  { id: 'internal', audiences: internalTeams },
  { id: 'threeE', audiences: ['THREE_E_PAKISTAN', 'THREE_E_MOROCCO'] },
  { id: 'pakistan', audiences: ['PAKISTAN', 'THREE_E_PAKISTAN'] },
]

test('a new internal team joins Everyone and Internal variants only', () => {
  assert.deepEqual(variantsReachingNewTeam(variants, internalTeams), ['everyone', 'internal'])
})

test('a new non-internal team joins Everyone variants only', () => {
  assert.deepEqual(variantsReachingNewTeam(variants, allTeams), ['everyone'])
})

test('an empty group extends nothing', () => {
  assert.deepEqual(variantsReachingNewTeam(variants, []), [])
})

// ─── Bosnia end to end, purely ──────────────────────────────────────────────

test('a Bosnia user sees backfilled Everyone content, and gaps show for tailored pages', () => {
  const page = (id: string, audiences: string[]): AdminPageInput => ({
    id,
    slug: id,
    title: id,
    icon: 'x',
    category: 'POLICIES',
    orderIndex: 0,
    linkHref: null,
    linkLabel: null,
    isPublished: true,
    description: null,
    layout: null,
    intentionalGapTeams: [],
    variants: [{ id: `${id}-v`, bodyMarkdown: 'BODY', orderIndex: 0, audiences }],
  })
  const welcome = page('welcome', [...allTeams, 'BOSNIA'])
  const travel = page('travel', ['PAKISTAN', 'THREE_E_PAKISTAN'])

  assert.ok(selectVariant(welcome, 'BOSNIA', CURRENT_CATALOG.active))
  assert.ok(selectVariant(welcome, null, CURRENT_CATALOG.active))
  assert.equal(selectVariant(travel, 'BOSNIA', CURRENT_CATALOG.active), null)

  const [, travelRow] = computeCoverage([welcome, travel], CURRENT_CATALOG.active)
  const bosniaCell = travelRow.cells.find((c) => c.team === 'BOSNIA')
  assert.equal(bosniaCell?.state, 'UNREVIEWED')
})

test('Bosnia holidays are standalone and do not touch Pakistan', () => {
  assert.deepEqual(expandHolidayTeamTags(['BOSNIA'], CURRENT_CATALOG.all), ['BOSNIA'])
  const bosniaDay = { holidayDate: new Date('2026-03-01'), teamTags: ['BOSNIA'] }
  assert.equal(holidayAppliesTo(bosniaDay, 'BOSNIA'), true)
  assert.equal(holidayAppliesTo(bosniaDay, 'PAKISTAN'), false)
  // Pakistan pairing still holds with the bigger catalog.
  assert.deepEqual(expandHolidayTeamTags(['PAKISTAN'], CURRENT_CATALOG.all), [
    'PAKISTAN',
    'THREE_E_PAKISTAN',
  ])
})
