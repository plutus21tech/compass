'use client'

import { ListVideo, Lock } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { VideoConfig } from '@/lib/academy/video'
import { SEEK_TOLERANCE_SECONDS, chapterAt, formatClock } from '@/lib/academy/video-player'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from '../brand'
import { academySans } from '../fonts'
import { BAR_BUTTON_CLASS } from './styles'

interface ChapterMenuProps {
  chapters: VideoConfig['chapters']
  position: number
  furthest: number
  /** Seeking is free: every chapter opens. */
  free: boolean
  onChoose: (start: number) => void
}

/** Every chapter with its start time. On a first viewing, chapters not reached yet are shown but closed. */
export function ChapterMenu({ chapters, position, furthest, free, onChoose }: ChapterMenuProps) {
  const current = chapterAt(chapters, position)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Chapters" className={cn(BAR_BUTTON_CLASS, 'gap-2 sm:px-3')}>
          <ListVideo aria-hidden className="size-5" />
          <span className="hidden text-sm font-medium sm:inline">Chapters</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        style={ACADEMY_THEME_VARS}
        className={cn(academySans.className, 'max-h-[min(24rem,60vh)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-2 text-academy-navy')}
      >
        <DropdownMenuLabel className="px-3 pb-1 pt-2 text-sm font-semibold">Chapters</DropdownMenuLabel>
        {chapters.map((chapter, index) => {
          const locked = !free && chapter.start > furthest + SEEK_TOLERANCE_SECONDS
          const isCurrent = current?.key === chapter.key
          return (
            <DropdownMenuItem
              key={chapter.key}
              disabled={locked}
              onSelect={() => onChoose(chapter.start)}
              aria-current={isCurrent ? 'true' : undefined}
              className={cn(
                'flex items-start gap-3 rounded-xl px-3 py-2.5 data-[disabled]:opacity-100',
                isCurrent && 'bg-academy-blue-tint',
              )}
            >
              <span className="w-5 shrink-0 pt-px text-right text-sm tabular-nums text-academy-slate">{index + 1}</span>
              <span className={cn('min-w-0 flex-1 text-[15px] leading-5', isCurrent && 'font-semibold', locked && 'text-academy-slate')}>
                {chapter.label}
                {locked ? <span className="sr-only">, not reached yet</span> : null}
              </span>
              {locked ? (
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-academy-slate" />
              ) : (
                <span className="shrink-0 pt-px text-sm tabular-nums text-academy-slate">{formatClock(chapter.start)}</span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
