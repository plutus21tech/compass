import test from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_GRID, avatarPixels, resolveAvatarLook, type AvatarLook } from '@/lib/avatar-pixels'

const LOOK: AvatarLook = {
  skinColor: '#e8b88a',
  hairColor: '#3b2a1a',
  bodyFrame: 'masculine',
  outfitType: 'shirt',
  outfitColor: '#2563eb',
  outfitAccentColor: '#f59e0b',
  hairCategory: 'short',
  headCoveringType: 'none',
  headCoveringColor: '#111827',
  accessories: [],
}

const NO_AVATAR = {
  skinTone: null, bodyFrame: null, outfitType: null, outfitColor: null, outfitAccentColor: null,
  hairCategory: null, hairColor: null, headCoveringType: null, headCoveringColor: null, accessories: null,
}

test('the figure stays on its grid and has every body part', () => {
  const pixels = avatarPixels(LOOK)
  for (const p of pixels) {
    assert.ok(p.x >= 0 && p.x + p.w <= AVATAR_GRID.width, `x ${p.x}+${p.w}`)
    assert.ok(p.y >= -1 && p.y + p.h <= AVATAR_GRID.height, `y ${p.y}+${p.h}`)
    assert.match(p.color, /^#[0-9a-f]{6}$/)
  }
  assert.deepEqual([...new Set(pixels.map((p) => p.part))].sort(), ['arms', 'eyes', 'head', 'legs', 'torso'])
})

test('the head and skin are drawn in the chosen colours', () => {
  const pixels = avatarPixels(LOOK)
  assert.ok(pixels.some((p) => p.part === 'head' && p.color === LOOK.skinColor && p.w === 6 && p.h === 5))
  assert.ok(pixels.some((p) => p.part === 'torso' && p.color === LOOK.outfitColor))
  assert.ok(pixels.some((p) => p.part === 'arms' && p.color === LOOK.skinColor))
})

test('a hijab replaces the hair; glasses, badge and watch add pixels', () => {
  const hijab = avatarPixels({ ...LOOK, headCoveringType: 'hijab', headCoveringColor: '#7c3aed' })
  assert.ok(hijab.some((p) => p.color === '#7c3aed'))
  assert.ok(!hijab.some((p) => p.color === LOOK.hairColor))
  const plain = avatarPixels(LOOK).length
  assert.equal(avatarPixels({ ...LOOK, accessories: ['glasses'] }).length, plain + 3)
  assert.equal(avatarPixels({ ...LOOK, accessories: ['badge'] }).length, plain + 2)
  assert.equal(avatarPixels({ ...LOOK, accessories: ['watch'] }).length, plain + 1)
})

test('a feminine frame has a narrower body', () => {
  const widest = (look: AvatarLook) => Math.max(...avatarPixels(look).filter((p) => p.part === 'legs').map((p) => p.w))
  assert.equal(widest(LOOK), 10)
  assert.equal(widest({ ...LOOK, bodyFrame: 'feminine' }), 8)
})

test('someone who never set an avatar still gets a full, stable figure', () => {
  const first = resolveAvatarLook('person-1', NO_AVATAR)
  assert.deepEqual(first, resolveAvatarLook('person-1', NO_AVATAR))
  assert.match(first.skinColor, /^#[0-9a-f]{6}$/i)
  assert.equal(first.outfitType, 'shirt')
  assert.deepEqual(first.accessories, [])
  assert.ok(avatarPixels(first).length > 20)
})

test('saved choices win over the fallbacks, and junk accessories are dropped', () => {
  const look = resolveAvatarLook('person-1', { ...NO_AVATAR, skinTone: '#6a4028', outfitType: 'kurta', accessories: ['glasses', 'crown', 7] })
  assert.equal(look.skinColor, '#6a4028')
  assert.equal(look.outfitType, 'kurta')
  assert.deepEqual(look.accessories, ['glasses'])
})
