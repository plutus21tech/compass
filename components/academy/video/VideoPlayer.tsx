'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Loader2, Play, RotateCcw } from 'lucide-react'
import type { ReadyVideoView } from '@/lib/academy/view'
import type { VideoKey, VideoLanguage } from '@/lib/academy/video'
import { formatClock } from '@/lib/academy/video-player'
import { academySerif } from '../fonts'
import { ControlBar } from './ControlBar'
import { TranscriptDrawer, TranscriptPanel } from './TranscriptDrawer'
import { useVideoSession, type VideoController } from './useVideoSession'

const SAVING_LINE = 'Saving your progress…'
const TROUBLE_LINE = "We're having trouble saving. Check your connection; we'll keep trying."
const FAILED_LEAD = "The video couldn't load."
const FAILED_NEXT = 'Please try again later, or ask HR.'

export interface NextStep { label: string; href: string }

interface VideoPlayerProps {
  video: ReadyVideoView & { videoKey: VideoKey; summary: string }
  /** For the frame's title and the end screen. */
  title: string
  moduleNumber: number
  next: NextStep
  controller: VideoController
}

const pickTranscriptLanguage = (languages: VideoLanguage[], captionLanguage: string | null): VideoLanguage | null =>
  languages.find((l) => captionLanguage?.startsWith(l)) ?? languages.find((l) => l === 'en') ?? languages[0] ?? null

function Poster({ resumeAt, duration, chapters, onPlay }: { resumeAt: number; duration: number; chapters: number; onPlay: () => void }) {
  const resuming = resumeAt > 0
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group/poster absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(120%_90%_at_50%_35%,#353B50_0%,#2A2F40_55%,#1E2230_100%)] text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-academy-blue-on-navy"
    >
      <span className="flex size-[4.5rem] items-center justify-center rounded-full bg-academy-blue shadow-[0_10px_30px_-8px_rgba(52,99,236,0.7)] transition-transform duration-300 ease-out motion-reduce:transition-none group-hover/poster:scale-105 sm:size-20">
        <Play aria-hidden className="ml-1 size-8 fill-current" />
      </span>
      <span className="text-lg font-semibold">{resuming ? `Resume from ${formatClock(resumeAt)}` : 'Play video'}</span>
      <span className="text-sm text-white/75">
        {formatClock(duration)} · {chapters === 1 ? '1 chapter' : `${chapters} chapters`}
      </span>
    </button>
  )
}

function Overlay({ children, label }: { children: React.ReactNode; label?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      role="status"
      aria-label={label}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-academy-navy px-6 text-center text-white sm:gap-4"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function EndScreen({ moduleNumber, next }: { moduleNumber: number; next: NextStep }) {
  const button = useRef<HTMLAnchorElement>(null)
  const reduceMotion = useReducedMotion()
  // Keyboard and screen-reader users land on the one next step.
  useEffect(() => button.current?.focus({ preventScroll: true }), [])
  return (
    <Overlay>
      <motion.span
        initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.1 }}
      >
        <CheckCircle2 aria-hidden className="size-8 text-academy-success-on-navy sm:size-12" strokeWidth={1.75} />
      </motion.span>
      <div>
        <h2 className={`${academySerif.className} text-2xl italic sm:text-4xl`}>Nicely done</h2>
        <p className="mt-1 text-sm text-white/85 sm:mt-2 sm:text-[15px]">{`You've finished Module ${moduleNumber}.`}</p>
      </div>
      <Link
        ref={button}
        href={next.href}
        prefetch={false}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 sm:h-12 text-[15px] font-semibold text-academy-navy shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)] transition-transform duration-200 ease-out motion-reduce:transition-none hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-blue-on-navy focus-visible:ring-offset-2 focus-visible:ring-offset-academy-navy"
      >
        {next.label}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </Overlay>
  )
}

function FailedCard({ summary, onRetry }: { summary: string; onRetry: () => void }) {
  return (
    <section role="alert" className="overflow-hidden rounded-2xl bg-academy-navy text-white">
      <div className="flex flex-col justify-center gap-4 px-6 py-10 sm:aspect-video sm:px-10">
        <h2 className={`${academySerif.className} text-3xl italic sm:text-4xl`}>{FAILED_LEAD}</h2>
        <p className="max-w-prose text-[17px] leading-7">{FAILED_NEXT}</p>
        <p className="max-w-prose leading-7 text-white/85">{summary}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-white px-4 text-[15px] font-semibold text-academy-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-blue-on-navy focus-visible:ring-offset-2 focus-visible:ring-offset-academy-navy"
        >
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </button>
      </div>
    </section>
  )
}

/** The module's video with our own controls: chapters, captions, transcript, and no skipping ahead the first time. */
export function VideoPlayer({ video, title, moduleNumber, next, controller }: VideoPlayerProps) {
  const host = useRef<HTMLDivElement>(null)
  const session = useVideoSession({
    host, title, youtubeId: video.youtubeId, duration: video.durationSeconds,
    chapters: video.chapters, furthest: video.furthest, completed: video.completed, controller,
  })
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const transcriptOpener = useRef<HTMLElement | null>(null)
  const [chosenLanguage, setChosenLanguage] = useState<VideoLanguage | null>(null)
  const languages = video.transcriptLanguages
  const transcriptLanguage = chosenLanguage ?? pickTranscriptLanguage(languages, session.captionLanguage)

  const failed = session.status === 'failed'
  const resumeAt = session.position

  return (
    <div className="space-y-6">
      {failed ? <FailedCard summary={video.summary} onRetry={session.retry} /> : null}
      <section
        aria-label={`Video: ${title}`}
        hidden={failed}
        className="overflow-hidden rounded-2xl bg-academy-navy shadow-[0_18px_40px_-24px_rgba(42,47,64,0.55)]"
      >
        <div className="relative aspect-video bg-academy-navy-deep">
          <div ref={host} className="absolute inset-0 [&>iframe]:size-full" />
          {/* Clicks play and pause, and keep YouTube's own links and overlays out of reach. */}
          <div aria-hidden className="absolute inset-0 z-[5] cursor-pointer" onClick={session.toggle} />
          {session.status === 'loading' ? (
            <div role="status" className="absolute inset-0 z-10 flex items-center justify-center gap-2 text-white/80">
              <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />
              <span className="text-sm">Loading the video…</span>
            </div>
          ) : null}
          {session.status === 'ready' && !session.started ? (
            <Poster resumeAt={resumeAt} duration={video.durationSeconds} chapters={video.chapters.length} onPlay={session.toggle} />
          ) : null}
          <AnimatePresence>
            {session.phase === 'saving' ? (
              <Overlay key="saving">
                <Loader2 aria-hidden className="size-8 text-academy-blue-on-navy motion-safe:animate-spin" />
                <p className="text-lg font-semibold">{SAVING_LINE}</p>
                {session.trouble ? <p className="max-w-sm text-[15px] text-white/85">{TROUBLE_LINE}</p> : null}
              </Overlay>
            ) : null}
            {session.phase === 'end' ? <EndScreen key="end" moduleNumber={moduleNumber} next={next} /> : null}
          </AnimatePresence>
        </div>
        {session.status === 'ready' ? (
          <ControlBar
            playing={session.playing}
            position={session.position}
            duration={video.durationSeconds}
            furthest={session.furthest}
            free={session.free}
            chapters={video.chapters}
            captionsOn={session.captionsOn}
            tracks={session.tracks}
            captionLanguage={session.captionLanguage}
            hasTranscript={transcriptLanguage !== null}
            onToggle={session.toggle}
            onSeek={session.seek}
            onCaptions={session.setCaptions}
            onCaptionLanguage={session.chooseCaptionLanguage}
            onTranscript={() => {
              transcriptOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
              setTranscriptOpen(true)
            }}
          />
        ) : null}
        <p aria-live="polite" className={`bg-academy-navy px-4 text-sm text-white/90 ${session.notice ? 'pb-3' : ''}`}>
          {session.notice}
        </p>
      </section>
      {failed && transcriptLanguage ? (
        <TranscriptPanel videoKey={video.videoKey} languages={languages} language={transcriptLanguage} onLanguage={setChosenLanguage} />
      ) : null}
      {transcriptLanguage && !failed ? (
        <TranscriptDrawer
          open={transcriptOpen}
          onOpenChange={setTranscriptOpen}
          returnFocus={transcriptOpener}
          videoKey={video.videoKey}
          languages={languages}
          language={transcriptLanguage}
          onLanguage={setChosenLanguage}
        />
      ) : null}
    </div>
  )
}
