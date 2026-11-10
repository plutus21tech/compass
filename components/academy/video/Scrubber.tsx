'use client'

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { VideoConfig } from '@/lib/academy/video'
import { chapterAt, formatClock, scrubberValueText, stepSeek, tickPositions } from '@/lib/academy/video-player'
import { cn } from '@/lib/utils'

interface ScrubberProps {
  position: number
  duration: number
  furthest: number
  /** Seeking is free, so the watched band isn't drawn. */
  free: boolean
  chapters: VideoConfig['chapters']
  onSeek: (seconds: number) => void
  /** Space on the scrubber plays or pauses, as on most players. */
  onToggle: () => void
}

const percentOf = (seconds: number, duration: number) => (duration > 0 ? Math.min(100, Math.max(0, (seconds / duration) * 100)) : 0)

/** A slider over the video's timeline: chapter breaks cut the track, and the band shows how far you've watched. */
export function Scrubber({ position, duration, furthest, free, chapters, onSeek, onToggle }: ScrubberProps) {
  const track = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const ticks = tickPositions(chapters, duration)
  const shown = dragging ?? position

  const secondsAt = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return (Math.min(rect.width, Math.max(0, clientX - rect.left)) / rect.width) * duration
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' || event.key === 'k') {
      event.preventDefault()
      onToggle()
      return
    }
    const target = stepSeek(event.key, position, duration)
    if (target === null) return
    event.preventDefault()
    onSeek(target)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(secondsAt(event.clientX))
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const seconds = secondsAt(event.clientX)
    if (event.pointerType === 'mouse') setHover(seconds)
    if (dragging !== null) setDragging(seconds)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(null)
    onSeek(secondsAt(event.clientX))
  }

  const preview = dragging ?? hover
  const previewChapter = preview === null ? null : chapterAt(chapters, preview)

  return (
    <div className="group/scrub relative px-4 pt-3">
      {preview !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-center text-xs text-academy-navy shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)]"
          style={{ left: `clamp(3.5rem, calc(1rem + (100% - 2rem) * ${percentOf(preview, duration) / 100}), calc(100% - 3.5rem))` }}
        >
          <span className="font-semibold tabular-nums">{formatClock(preview)}</span>
          {previewChapter ? <span className="block max-w-[12rem] truncate">{previewChapter.label}</span> : null}
        </div>
      ) : null}
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label="Video position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={scrubberValueText(shown, duration, chapters)}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragging(null)}
        onPointerLeave={() => setHover(null)}
        className="relative flex h-6 cursor-pointer touch-none items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-blue-on-navy focus-visible:ring-offset-2 focus-visible:ring-offset-academy-navy"
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/15 transition-[height] motion-reduce:transition-none group-hover/scrub:h-2">
          {free ? null : (
            <div aria-hidden className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${percentOf(furthest, duration)}%` }} />
          )}
          <div aria-hidden className="absolute inset-y-0 left-0 bg-academy-blue-on-navy" style={{ width: `${percentOf(shown, duration)}%` }} />
          {ticks.map((tick) => (
            <span key={tick.key} aria-hidden className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-academy-navy" style={{ left: `${tick.percent}%` }} />
          ))}
        </div>
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.4)] transition-transform motion-reduce:transition-none',
            dragging !== null ? 'scale-125' : 'group-hover/scrub:scale-110',
          )}
          style={{ left: `${percentOf(shown, duration)}%` }}
        />
      </div>
    </div>
  )
}
