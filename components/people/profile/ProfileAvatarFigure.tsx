import { AVATAR_GRID, avatarPixels, type AvatarLook, type AvatarPixel } from '@/lib/avatar-pixels'
import { cn } from '@/lib/utils'

export interface ProfileAvatarFigureProps {
  look: AvatarLook
  /** The person's name, for screen readers. */
  name: string
  className?: string
}

/**
 * Idle motion: the upper body breathes, the arms follow a beat behind, and the eyes
 * blink now and then. Stepped, so the pixels stay crisp. Off for reduced motion.
 */
const MOTION_CSS = `
.pa-upper { animation: pa-breathe 3.2s steps(2, jump-none) infinite; }
.pa-arms { animation: pa-sway 3.2s steps(2, jump-none) infinite; animation-delay: -0.8s; }
.pa-eyes { transform-box: fill-box; transform-origin: center; animation: pa-blink 4.6s linear infinite; }
.pa-shadow { transform-box: fill-box; transform-origin: center; animation: pa-shadow 3.2s steps(2, jump-none) infinite; }
@keyframes pa-breathe { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.5px); } }
@keyframes pa-sway { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.5px); } }
@keyframes pa-blink { 0%, 93%, 100% { transform: scaleY(1); } 95%, 97% { transform: scaleY(0.1); } }
@keyframes pa-shadow { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(1.06); } }
@media (prefers-reduced-motion: reduce) {
  .pa-upper, .pa-arms, .pa-eyes, .pa-shadow { animation: none; }
}
`

function Rects({ pixels }: { pixels: AvatarPixel[] }) {
  return (
    <>
      {pixels.map((p, index) => (
        <rect key={index} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.color} />
      ))}
    </>
  )
}

/** Consecutive pixels of one body part, kept in drawing order so overlaps stay right. */
function runsByPart(pixels: AvatarPixel[]): AvatarPixel[][] {
  return pixels.reduce<AvatarPixel[][]>((runs, pixel) => {
    const last = runs[runs.length - 1]
    if (last && last[0].part === pixel.part) return [...runs.slice(0, -1), [...last, pixel]]
    return [...runs, [pixel]]
  }, [])
}

/** The person's office avatar, standing and gently alive. */
export function ProfileAvatarFigure({ look, name, className }: ProfileAvatarFigureProps) {
  const pixels = avatarPixels(look)
  const upper = runsByPart(pixels.filter((p) => p.part !== 'legs'))
  const legs = pixels.filter((p) => p.part === 'legs')
  const { width, height } = AVATAR_GRID
  return (
    <svg
      viewBox={`0 -1 ${width} ${height + 1}`}
      role="img"
      aria-label={`${name}'s office avatar`}
      shapeRendering="crispEdges"
      className={cn('pa-figure block', className)}
    >
      <style>{MOTION_CSS}</style>
      <ellipse className="pa-shadow" cx={width / 2} cy={26} rx={6} ry={1} fill="currentColor" opacity={0.14} />
      <g className="pa-upper">
        {upper.map((run, index) => (
          <g key={index} className={`pa-${run[0].part}`}>
            <Rects pixels={run} />
          </g>
        ))}
      </g>
      <g className="pa-legs">
        <Rects pixels={legs} />
      </g>
    </svg>
  )
}
