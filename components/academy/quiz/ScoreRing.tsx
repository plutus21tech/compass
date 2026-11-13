'use client'

import { useEffect, useState } from 'react'

const SIZE = 168
const STROKE = 12
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** White on the blue band. The fill eases in once; with reduced motion it simply appears. */
export function ScoreRing({ score, total }: { score: number; total: number }) {
  const [shown, setShown] = useState(false)
  useEffect(() => setShown(true), [])

  const fraction = total > 0 ? Math.min(score / total, 1) : 0
  const offset = CIRCUMFERENCE * (1 - (shown ? fraction : 0))
  return (
    <div role="img" aria-label={`Score: ${score} of ${total}`} className="relative size-[168px] shrink-0">
      <svg aria-hidden width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.28)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="white"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-out"
        />
      </svg>
      <div aria-hidden className="absolute inset-0 flex items-center justify-center text-white">
        <span className="text-[2.25rem] font-extrabold leading-none tabular-nums">
          {score}
          <span className="text-xl font-semibold"> of {total}</span>
        </span>
      </div>
    </div>
  )
}
