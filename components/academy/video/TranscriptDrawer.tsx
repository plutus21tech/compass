'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Loader2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { VideoKey, VideoLanguage } from '@/lib/academy/video'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from '../brand'
import { academySans } from '../fonts'

export const LANGUAGE_NAMES: Record<VideoLanguage, string> = { en: 'English', fr: 'Français', es: 'Español' }
const LOAD_FAILED = "We couldn't load the transcript. Try again in a moment."

type TranscriptState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'failed' }

/** Fetches a transcript when asked for one, and keeps each language it has read. */
function useTranscript(videoKey: VideoKey, language: VideoLanguage, enabled: boolean) {
  const cache = useRef(new Map<VideoLanguage, string>())
  const [state, setState] = useState<TranscriptState>({ kind: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const cached = cache.current.get(language)
    if (cached !== undefined) {
      setState({ kind: 'ready', text: cached })
      return
    }
    const controller = new AbortController()
    setState({ kind: 'loading' })
    const url = `/api/onboarding/academy/videos/${encodeURIComponent(videoKey)}/transcript?lang=${language}`
    fetch(url, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status))
        const text = await response.text()
        cache.current.set(language, text)
        setState({ kind: 'ready', text })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [videoKey, language, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}

interface TranscriptSourceProps {
  videoKey: VideoKey
  languages: VideoLanguage[]
  language: VideoLanguage
  onLanguage: (language: VideoLanguage) => void
}

function LanguageSwitch({ languages, language, onLanguage }: Omit<TranscriptSourceProps, 'videoKey'>) {
  if (languages.length < 2) return null
  return (
    <div role="group" aria-label="Transcript language" className="flex flex-wrap gap-2">
      {languages.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === language}
          onClick={() => onLanguage(code)}
          className={cn(
            'h-11 rounded-full border px-4 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-blue focus-visible:ring-offset-2',
            code === language
              ? 'border-academy-blue bg-academy-blue text-white'
              : 'border-academy-line bg-white text-academy-navy hover:border-academy-blue',
          )}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  )
}

function TranscriptBody({ videoKey, language, enabled }: { videoKey: VideoKey; language: VideoLanguage; enabled: boolean }) {
  const { state, retry } = useTranscript(videoKey, language, enabled)
  if (state.kind === 'loading' || state.kind === 'idle') {
    return (
      <p role="status" className="flex items-center gap-2 text-[15px] text-academy-slate">
        <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        Loading the transcript…
      </p>
    )
  }
  if (state.kind === 'failed') {
    return (
      <div role="alert" className="space-y-3 text-[15px]">
        <p>{LOAD_FAILED}</p>
        <button
          type="button"
          onClick={retry}
          className="h-11 rounded-xl border border-academy-line bg-white px-4 font-medium hover:border-academy-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-blue focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    )
  }
  const paragraphs = state.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  return (
    <div lang={language} className="max-w-[65ch] space-y-4 text-base leading-[1.6] text-academy-navy">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">{paragraph}</p>
      ))}
    </div>
  )
}

interface TranscriptDrawerProps extends TranscriptSourceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The button that opened the drawer. */
  returnFocus: RefObject<HTMLElement | null>
}

/** The transcript beside the video. Escape closes it and focus goes back to the Transcript button. */
export function TranscriptDrawer({ open, onOpenChange, returnFocus, videoKey, languages, language, onLanguage }: TranscriptDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onCloseAutoFocus={(event) => {
          // The drawer opens from the control bar, not a Radix trigger, so focus goes back by hand.
          if (!returnFocus.current) return
          event.preventDefault()
          returnFocus.current.focus()
        }}
        style={ACADEMY_THEME_VARS}
        className={cn(academySans.className, 'flex w-full flex-col gap-0 bg-academy-paper p-0 text-academy-navy sm:max-w-md')}
      >
        <SheetHeader className="space-y-3 border-b border-academy-line px-6 pb-5 pt-6 text-left">
          <SheetTitle className="text-xl font-bold text-academy-navy">Transcript</SheetTitle>
          <SheetDescription className="text-[15px] text-academy-slate">Everything said in the video, to read at your own pace.</SheetDescription>
          <LanguageSwitch languages={languages} language={language} onLanguage={onLanguage} />
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <TranscriptBody videoKey={videoKey} language={language} enabled={open} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** The transcript on the page itself, when the player can't load. */
export function TranscriptPanel({ videoKey, languages, language, onLanguage }: TranscriptSourceProps) {
  return (
    <section aria-labelledby="video-transcript-heading" className="space-y-4 rounded-2xl border border-academy-line bg-white p-5 sm:p-7">
      <h2 id="video-transcript-heading" className="text-xl font-bold">Transcript</h2>
      <LanguageSwitch languages={languages} language={language} onLanguage={onLanguage} />
      <TranscriptBody videoKey={videoKey} language={language} enabled />
    </section>
  )
}
