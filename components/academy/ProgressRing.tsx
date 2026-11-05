'use client'

import { useEffect, useState } from 'react'

const SIZE = 132
const STROKE = 10
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

interface ProgressRingProps {
  done: number
  total: number
}

/** White on the blue hero. The fill eases in once; with reduced motion it simply appears. */
export function ProgressRing({ done, total }: ProgressRingProps) {
  const [shown, setShown] = useState(false)
  useEffect(() => setShown(true), [])

  const fraction = total > 0 ? Math.min(done / total, 1) : 0
  const offset = CIRCUMFERENCE * (1 - (shown ? fraction : 0))
  return (
    <div role="img" aria-label={`${done} of ${total} modules done`} className="relative size-[132px] shrink-0">
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
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="text-[1.75rem] font-extrabold leading-none tabular-nums">
          {done} of {total}
        </span>
        <span className="mt-1 text-[13px] font-medium">modules</span>
      </div>
    </div>
  )
}
