'use client'

import { Captions, CaptionsOff, FileText, Languages, Pause, Play } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { VideoConfig } from '@/lib/academy/video'
import { chapterAt, formatClock } from '@/lib/academy/video-player'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from '../brand'
import { academySans } from '../fonts'
import { ChapterMenu } from './ChapterMenu'
import { Scrubber } from './Scrubber'
import { BAR_BUTTON_CLASS } from './styles'
import type { CaptionTrack } from './useYouTube'

export interface ControlBarProps {
  playing: boolean
  position: number
  duration: number
  furthest: number
  free: boolean
  chapters: VideoConfig['chapters']
  captionsOn: boolean
  tracks: CaptionTrack[]
  captionLanguage: string | null
  hasTranscript: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
  onCaptions: (on: boolean) => void
  onCaptionLanguage: (languageCode: string) => void
  onTranscript: () => void
  /** The Transcript button, so the drawer can hand focus back to it. */
  transcriptButton?: React.RefObject<HTMLButtonElement>
}

function CaptionLanguageMenu({ tracks, captionLanguage, onCaptionLanguage }: Pick<ControlBarProps, 'tracks' | 'captionLanguage' | 'onCaptionLanguage'>) {
  if (tracks.length < 2) return null
  const current = tracks.find((t) => t.languageCode === captionLanguage)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(BAR_BUTTON_CLASS, 'gap-1.5')}>
          <Languages aria-hidden className="size-5" />
          <span className="sr-only">{`Caption language${current ? `: ${current.displayName}` : ''}, `}</span>
          <span className="text-xs font-semibold uppercase">{captionLanguage?.slice(0, 2) ?? ''}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        style={ACADEMY_THEME_VARS}
        className={cn(academySans.className, 'w-56 rounded-2xl p-2 text-academy-navy')}
      >
        <DropdownMenuLabel className="px-3 pb-1 pt-2 text-sm font-semibold">Caption language</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={captionLanguage ?? ''} onValueChange={onCaptionLanguage}>
          {tracks.map((track) => (
            <DropdownMenuRadioItem key={track.languageCode} value={track.languageCode} lang={track.languageCode} className="rounded-xl py-2.5 text-[15px]">
              {track.displayName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The player's own controls, below the picture: every one labelled and reachable by keyboard. */
export function ControlBar(props: ControlBarProps) {
  const { playing, position, duration, furthest, free, chapters, captionsOn, hasTranscript, onToggle, onSeek, onCaptions, onTranscript, transcriptButton } = props
  const chapter = chapterAt(chapters, position)
  const CaptionIcon = captionsOn ? Captions : CaptionsOff
  return (
    <div className="bg-academy-navy pb-2 text-white">
      <Scrubber position={position} duration={duration} furthest={furthest} free={free} chapters={chapters} onSeek={onSeek} onToggle={onToggle} />
      <div className="flex items-center gap-1 px-2 pt-1 sm:gap-1.5 sm:px-3">
        <button type="button" onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} className={BAR_BUTTON_CLASS}>
          {playing ? <Pause aria-hidden className="size-5 fill-current" /> : <Play aria-hidden className="size-5 fill-current" />}
        </button>
        <p className="shrink-0 px-1 text-sm tabular-nums">
          <span className="sr-only">Elapsed </span>
          {formatClock(position)}
          <span aria-hidden className="text-white/60"> / </span>
          <span className="sr-only"> of </span>
          <span className="text-white/75">{formatClock(duration)}</span>
        </p>
        <p className="ml-2 hidden min-w-0 flex-1 truncate text-sm text-white/80 sm:block">
          {chapter ? <><span className="sr-only">Chapter: </span>{chapter.label}</> : null}
        </p>
        <span aria-hidden className="flex-1 sm:hidden" />
        <ChapterMenu chapters={chapters} position={position} furthest={furthest} free={free} onChoose={onSeek} />
        <button
          type="button"
          aria-label="Captions"
          aria-pressed={captionsOn}
          onClick={() => onCaptions(!captionsOn)}
          className={BAR_BUTTON_CLASS}
        >
          <CaptionIcon aria-hidden className="size-5" />
        </button>
        {captionsOn ? <CaptionLanguageMenu {...props} /> : null}
        {hasTranscript ? (
          <button ref={transcriptButton} type="button" onClick={onTranscript} aria-label="Transcript" className={cn(BAR_BUTTON_CLASS, 'gap-2 sm:px-3')}>
            <FileText aria-hidden className="size-5" />
            <span className="hidden text-sm font-medium md:inline">Transcript</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
