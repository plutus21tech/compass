'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { VALUE_COLOURS } from './brand'

const PIECES = 56
const COLOURS = [...Object.values(VALUE_COLOURS), '#FFFFFF']
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const STORAGE_PREFIX = 'academy-confetti:'

const between = (low: number, high: number) => low + Math.random() * (high - low)

function Pieces() {
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, index) => ({
        id: index,
        left: between(2, 98),
        width: between(6, 11),
        drift: between(-90, 90),
        spin: between(-540, 540),
        delay: between(0, 0.6),
        duration: between(2.4, 3.6),
        colour: COLOURS[index % COLOURS.length],
      })),
    [],
  )
  return (
    <>
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute -top-4 rounded-[2px]"
          style={{ left: `${piece.left}%`, width: piece.width, height: piece.width * 1.6, backgroundColor: piece.colour }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '105vh', x: piece.drift, rotate: piece.spin, opacity: [1, 1, 0] }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: [0.3, 0.2, 0.6, 1], times: [0, 0.8, 1] }}
        />
      ))}
    </>
  )
}

/** True once per browser and user. If storage can't be read, stays off rather than replaying on every visit. */
function claimFirstPlay(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, '1')
    return true
  } catch (error) {
    console.warn('[academy] confetti skipped: no local storage', error)
    return false
  }
}

/** Light, once, and never with reduced motion. Decorative: hidden from screen readers and from clicks. */
export function Confetti({ userId }: { userId: string }) {
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (window.matchMedia(REDUCED_MOTION).matches) return
    if (claimFirstPlay(`${STORAGE_PREFIX}${userId}`)) setPlaying(true)
  }, [userId])

  if (!playing) return null
  return (
    <div aria-hidden data-testid="academy-confetti" className="pointer-events-none absolute inset-0 overflow-hidden">
      <Pieces />
    </div>
  )
}
