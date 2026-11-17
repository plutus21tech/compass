import {
  AVATAR_ACCENT_COLORS,
  AVATAR_HIJAB_COLORS,
  AVATAR_OUTFIT_COLORS,
  normalizeAvatarAccessories,
  type AvatarAccessory,
  type AvatarBodyFrame,
  type AvatarHairCategory,
  type AvatarHeadCoveringType,
  type AvatarOutfitType,
} from '@/shared/avatar-v2'
import { getHairColor, getSkinTone } from '@/lib/office-config'

/**
 * The office avatar as pixels, front view (matches the OfficeSprites.ts character).
 *
 * One list of rectangles drives both the settings preview (canvas) and the profile
 * figure (SVG), so the two can never drift apart. Order matters: later pixels sit on top.
 */

export const AVATAR_GRID = { width: 20, height: 28 } as const

/** Which part of the body a pixel belongs to, so the profile figure can move parts separately. */
export type AvatarPart = 'head' | 'eyes' | 'torso' | 'arms' | 'legs'

export interface AvatarPixel {
  x: number
  y: number
  w: number
  h: number
  color: string
  part: AvatarPart
}

export interface AvatarLook {
  skinColor: string
  hairColor: string
  bodyFrame: AvatarBodyFrame
  outfitType: AvatarOutfitType
  outfitColor: string
  outfitAccentColor: string
  hairCategory: AvatarHairCategory
  headCoveringType: AvatarHeadCoveringType
  headCoveringColor: string
  accessories: AvatarAccessory[]
}

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '')
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)]
}
function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}
function lighten(c: string, n: number): string {
  const [r, g, b] = parseHex(c)
  return toHex(r + n, g + n, b + n)
}
function darken(c: string, n: number): string {
  const [r, g, b] = parseHex(c)
  return toHex(r - n, g - n, b - n)
}

type Put = (x: number, y: number, w: number, h: number, color: string) => void

const HAIR_STYLE: Record<AvatarHairCategory, number> = { short: 0, tied: 1, medium: 2, long: 3, curly: 4, covered: 0 }

function drawHair(p: Put, style: number, color: string): void {
  const hi = lighten(color, 15)
  const lo = darken(color, 10)
  switch (style) {
    case 0: p(7,1,6,3,color); p(8,0,4,1,color); p(7,1,6,1,hi); break
    case 1: p(7,2,6,2,color); p(8,0,1,2,color); p(10,-1,1,3,color); p(12,0,1,2,color); p(7,2,6,1,hi); break
    case 2: p(6,1,7,3,color); p(6,0,5,1,color); p(6,1,2,1,hi); break
    case 3: p(6,1,8,3,color); p(7,0,6,1,color); p(7,0,4,1,hi); p(6,4,1,6,color); p(13,4,1,6,color); break
    case 4: p(6,0,8,4,color); p(5,1,1,3,color); p(14,1,1,3,color); p(7,0,6,1,hi); p(7,1,1,1,hi); p(11,2,1,1,hi); p(9,0,1,1,lo); p(13,1,1,1,lo); break
  }
}

function drawHijab(p: Put, color: string): void {
  p(6,1,8,4,color)
  p(6,4,1,6,color)
  p(13,4,1,6,color)
  p(7,0,6,1,lighten(color,14))
  p(6,3,1,5,darken(color,14))
  p(13,3,1,5,darken(color,14))
}

function drawOutfit(p: Put, look: AvatarLook, bodyX: number, bodyW: number, isMale: boolean): void {
  const { outfitColor, outfitAccentColor, outfitType } = look
  p(bodyX,10,bodyW,7,outfitColor); p(bodyX,15,bodyW,2,darken(outfitColor,18))
  if (outfitType === 'blazer' || outfitType === 'suit') {
    p(bodyX,10,2,7,darken(outfitColor,10)); p(bodyX+bodyW-2,10,2,7,darken(outfitColor,10))
    p(bodyX+3,10,bodyW-6,7,'#f8fafc'); p(9,11,2,5,outfitAccentColor)
  } else if (outfitType === 'hoodie') {
    p(bodyX+1,9,bodyW-2,2,darken(outfitColor,8)); p(8,12,1,3,outfitAccentColor); p(11,12,1,3,outfitAccentColor)
  } else if (outfitType === 'kurta') {
    p(bodyX-1,14,bodyW+2,5,outfitColor); p(9,10,2,8,outfitAccentColor)
  } else {
    p(8,10,4,1,darken(outfitColor,10)); p(9,10,2,1,lighten(outfitColor,8))
  }
  if (isMale && outfitType === 'shirt') p(11,12,2,2,darken(outfitColor,8))
}

/** Every rectangle of the figure, in drawing order, on a 20 x 28 grid (hair may reach y = -1). */
export function avatarPixels(look: AvatarLook): AvatarPixel[] {
  const pixels: AvatarPixel[] = []
  const on = (part: AvatarPart): Put => (x, y, w, h, color) => {
    pixels.push({ x, y, w, h, color, part })
  }
  const head = on('head'), eyes = on('eyes'), torso = on('torso'), arms = on('arms'), legs = on('legs')
  const shoeColor = '#383838', pantsColor = '#484858', beltColor = '#3a3a3a', frame = '#1f2937'
  const { skinColor, hairColor, outfitAccentColor } = look
  const isMale = look.bodyFrame !== 'feminine'
  const bodyW = isMale ? 10 : 8
  const bodyX = isMale ? 5 : 6

  if (look.headCoveringType === 'hijab') drawHijab(head, look.headCoveringColor)
  else drawHair(head, HAIR_STYLE[look.hairCategory] ?? 0, hairColor)
  head(7,4,6,5,skinColor)
  head(7,5,2,1,darken(hairColor,10)); head(11,5,2,1,darken(hairColor,10))
  eyes(8,6,2,2,'#282828'); eyes(11,6,2,2,'#282828'); eyes(8,6,1,1,'#ffffff'); eyes(12,6,1,1,'#ffffff')
  if (look.accessories.includes('glasses')) {
    head(7,6,3,1,frame); head(11,6,3,1,frame); head(10,6,1,1,frame)
  }
  head(9,9,2,1,skinColor)

  drawOutfit(torso, look, bodyX, bodyW, isMale)
  arms(bodyX-2,11,2,5,skinColor); arms(bodyX+bodyW,11,2,5,skinColor)
  torso(bodyX,17,bodyW,1,beltColor)
  if (look.accessories.includes('badge')) {
    torso(bodyX+bodyW-3,12,2,2,'#f8fafc')
    torso(bodyX+bodyW-2,13,1,1,outfitAccentColor)
  }
  if (look.accessories.includes('watch')) arms(bodyX-2,15,1,1,outfitAccentColor)

  legs(bodyX,18,bodyW,4,pantsColor); legs(9,18,2,4,darken(pantsColor,5))
  legs(bodyX+1,22,3,2,pantsColor); legs(bodyX+bodyW-4,22,3,2,pantsColor)
  legs(bodyX+1,24,3,2,shoeColor); legs(bodyX+bodyW-4,24,3,2,shoeColor)
  legs(bodyX+1,24,3,1,lighten(shoeColor,15)); legs(bodyX+bodyW-4,24,3,1,lighten(shoeColor,15))
  return pixels
}

const PREVIEW_SCALE = 4

/** Paints the figure onto a canvas, 4 screen pixels per grid pixel. */
export function drawAvatarPreview(canvas: HTMLCanvasElement, look: AvatarLook): void {
  canvas.width = AVATAR_GRID.width * PREVIEW_SCALE
  canvas.height = AVATAR_GRID.height * PREVIEW_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const pixel of avatarPixels(look)) {
    ctx.fillStyle = pixel.color
    ctx.fillRect(pixel.x * PREVIEW_SCALE, pixel.y * PREVIEW_SCALE, pixel.w * PREVIEW_SCALE, pixel.h * PREVIEW_SCALE)
  }
}

export interface StoredAvatar {
  skinTone: string | null
  bodyFrame: string | null
  outfitType: string | null
  outfitColor: string | null
  outfitAccentColor: string | null
  hairCategory: string | null
  hairColor: string | null
  headCoveringType: string | null
  headCoveringColor: string | null
  accessories: unknown
}

/** A person's saved avatar with the same fallbacks the office and settings page use. */
export function resolveAvatarLook(personId: string, stored: StoredAvatar): AvatarLook {
  return {
    skinColor: stored.skinTone || getSkinTone(personId),
    hairColor: stored.hairColor || getHairColor(personId),
    bodyFrame: (stored.bodyFrame as AvatarBodyFrame) || 'masculine',
    outfitType: (stored.outfitType as AvatarOutfitType) || 'shirt',
    outfitColor: stored.outfitColor || AVATAR_OUTFIT_COLORS[0],
    outfitAccentColor: stored.outfitAccentColor || AVATAR_ACCENT_COLORS[0],
    hairCategory: (stored.hairCategory as AvatarHairCategory) || 'short',
    headCoveringType: (stored.headCoveringType as AvatarHeadCoveringType) || 'none',
    headCoveringColor: stored.headCoveringColor || AVATAR_HIJAB_COLORS[0],
    accessories: normalizeAvatarAccessories(stored.accessories),
  }
}
