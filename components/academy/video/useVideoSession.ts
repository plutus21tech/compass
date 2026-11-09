'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react'
import type { ModuleProgressView } from '@/lib/academy/view'
import type { VideoConfig } from '@/lib/academy/video'
import { followPlayback, snapSeek, startPosition } from '@/lib/academy/video-player'
import type { CompleteResult } from '../useModuleProgress'
import { PLAYER_READY_TIMEOUT_MS, PLAYER_STATE, YOUTUBE_HOST, captionTracks, loadYouTubeApi, type CaptionTrack, type YouTubePlayer } from './useYouTube'

/** The server counts at most 30s of real time per report, so report well inside that. */
const REPORT_EVERY_MS = 10_000
/** After the end, until the server has counted 95%. */
const END_REPORT_EVERY_MS = 4_000
const POLL_EVERY_MS = 250
/** Failed reports in a row before the saving screen says it is struggling. */
const TROUBLE_AFTER = 3
const NOTICE_MS = 4_000
const CAPTIONS_KEY = 'academy-video-captions'
const PREFERRED_CAPTION_LANGUAGE = 'en'
export const SKIP_NOTICE = 'You can skip ahead once you have watched the whole video.'

export interface VideoController {
  report: (seconds: number) => Promise<ModuleProgressView | null>
  reportOnHide: (seconds: number) => void
  complete: () => Promise<CompleteResult | null>
  /** The module was already complete when the page loaded. */
  moduleDone: boolean
  /** Called once when this visit completes the module. */
  onCompleted: (result: CompleteResult) => void
}

export type PlayerStatus = 'loading' | 'ready' | 'failed'
/** `saving`: the video ended and the server hasn't counted 95% yet. `end`: the end screen. */
export type PlayerPhase = 'watching' | 'saving' | 'end'

interface SessionInput {
  host: RefObject<HTMLDivElement | null>
  title: string
  youtubeId: string
  duration: number
  chapters: VideoConfig['chapters']
  furthest: number
  completed: boolean
  controller: VideoController
}

function readCaptionsOff(): boolean {
  try {
    return window.sessionStorage.getItem(CAPTIONS_KEY) === 'off'
  } catch {
    return false
  }
}

function rememberCaptionsOff(off: boolean): void {
  try {
    if (off) window.sessionStorage.setItem(CAPTIONS_KEY, 'off')
    else window.sessionStorage.removeItem(CAPTIONS_KEY)
  } catch {
    // Only a convenience: captions come back on next time.
  }
}

function chapterFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('chapter')
  } catch {
    return null
  }
}

/** Everything the player does with YouTube and the server. The component only draws it. */
export function useVideoSession(input: SessionInput) {
  const { host, title, youtubeId, duration, chapters, controller } = input
  const player = useRef<YouTubePlayer | null>(null)
  const furthest = useRef(input.furthest)
  const free = useRef(input.completed || controller.moduleDone)
  const done = useRef(controller.moduleDone)
  const ended = useRef(false)
  const finishing = useRef(false)
  const failures = useRef(0)
  const lastPoll = useRef({ position: 0, at: 0 })
  const reportTimer = useRef<number | null>(null)
  const pollTimer = useRef<number | null>(null)
  const endTimer = useRef<number | null>(null)
  const appliedLanguage = useRef<string | null>(null)
  const wantedLanguage = useRef<string | null>(null)
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [phase, setPhase] = useState<PlayerPhase>('watching')
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [shownFurthest, setShownFurthest] = useState(input.furthest)
  const [isFree, setIsFree] = useState(free.current)
  const [trouble, setTrouble] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [captionsOn, setCaptionsOn] = useState(true)
  const [tracks, setTracks] = useState<CaptionTrack[]>([])
  const [captionLanguage, setCaptionLanguage] = useState<string | null>(null)

  const stop = (timer: MutableRefObject<number | null>) => {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
  }

  const showEnd = useCallback(() => {
    stop(endTimer)
    setPhase('end')
  }, [])

  const finish = useCallback(() => {
    if (done.current || finishing.current) return
    finishing.current = true
    void controllerRef.current.complete().then((result) => {
      finishing.current = false
      // Refused: playback carries on, and the next report tries again.
      if (!result) return
      done.current = true
      controllerRef.current.onCompleted(result)
      if (ended.current) showEnd()
    })
  }, [showEnd])

  const handleAnswer = useCallback(
    (answer: ModuleProgressView | null) => {
      if (!answer) {
        failures.current += 1
        if (failures.current >= TROUBLE_AFTER) setTrouble(true)
        return
      }
      failures.current = 0
      setTrouble(false)
      if (answer.status !== 'COMPLETED' && !answer.completion.met) return
      free.current = true
      setIsFree(true)
      finish()
    },
    [finish],
  )

  const report = useCallback(() => {
    if (done.current) return
    void controllerRef.current.report(furthest.current).then(handleAnswer)
  }, [handleAnswer])

  const poll = useCallback(() => {
    const yt = player.current
    if (!yt) return
    const now = performance.now()
    const current = yt.getCurrentTime()
    const sample = followPlayback({
      furthest: furthest.current,
      previous: lastPoll.current.position,
      position: current,
      elapsedSeconds: (now - lastPoll.current.at) / 1000,
      free: free.current,
    })
    furthest.current = sample.furthest
    if (sample.snapBack) {
      yt.seekTo(furthest.current, true)
      lastPoll.current = { position: furthest.current, at: now }
      setPosition(furthest.current)
    } else {
      lastPoll.current = { position: current, at: now }
      setPosition(current)
    }
    setShownFurthest(furthest.current)
  }, [])

  const handleState = useCallback(
    (state: number) => {
      if (state === PLAYER_STATE.PLAYING) {
        const yt = player.current
        // YouTube can report playing again at the very end after a seek there: the video is still over.
        if (ended.current && yt && yt.getCurrentTime() >= (yt.getDuration() || duration) - 1) return
        setStarted(true)
        setPlaying(true)
        ended.current = false
        stop(endTimer)
        setPhase('watching')
        lastPoll.current = { position: player.current?.getCurrentTime() ?? 0, at: performance.now() }
        stop(pollTimer)
        stop(reportTimer)
        pollTimer.current = window.setInterval(poll, POLL_EVERY_MS)
        reportTimer.current = window.setInterval(report, REPORT_EVERY_MS)
        return
      }
      if (state !== PLAYER_STATE.PAUSED && state !== PLAYER_STATE.ENDED) return
      setPlaying(false)
      stop(pollTimer)
      stop(reportTimer)
      poll()
      if (state === PLAYER_STATE.PAUSED) {
        report()
        return
      }
      ended.current = true
      setPosition(duration)
      report()
      if (done.current) {
        showEnd()
        return
      }
      setPhase('saving')
      stop(endTimer)
      endTimer.current = window.setInterval(() => (done.current ? showEnd() : report()), END_REPORT_EVERY_MS)
    },
    [duration, poll, report, showEnd],
  )

  /** Puts the wanted track on: the hire's choice, else English, else the first one YouTube has. */
  const applyCaptionLanguage = useCallback((yt: YouTubePlayer, list: CaptionTrack[]) => {
    const choice = list.find((t) => t.languageCode === wantedLanguage.current)
      ?? list.find((t) => t.languageCode.startsWith(PREFERRED_CAPTION_LANGUAGE))
      ?? list[0]
    if (!choice) return
    setCaptionLanguage(choice.languageCode)
    if (appliedLanguage.current === choice.languageCode) return
    appliedLanguage.current = choice.languageCode
    try {
      yt.setOption('captions', 'track', { languageCode: choice.languageCode })
    } catch {
      // YouTube owns the captions module; a refusal leaves its own default track on.
    }
  }, [])

  // Build the player. A retry builds it again from scratch.
  useEffect(() => {
    const container = host.current
    if (!container) return
    let cancelled = false
    let ready = false
    let yt: YouTubePlayer | null = null
    const captionsOff = readCaptionsOff()
    setCaptionsOn(!captionsOff)
    setStatus('loading')
    const fail = () => {
      if (cancelled) return
      cancelled = true
      setStatus('failed')
      try {
        yt?.destroy()
      } catch {
        // Already gone.
      }
      player.current = null
      container.replaceChildren()
    }
    const deadline = window.setTimeout(() => {
      if (!ready) fail()
    }, PLAYER_READY_TIMEOUT_MS)

    const start = startPosition({ chapters, chapterKey: chapterFromUrl(), furthest: furthest.current, completed: free.current, duration })
    void loadYouTubeApi(PLAYER_READY_TIMEOUT_MS).then((api) => {
      if (cancelled) return
      if (!api) return fail()
      const mount = document.createElement('div')
      container.replaceChildren(mount)
      try {
        yt = new api.Player(mount, {
          host: YOUTUBE_HOST,
          videoId: youtubeId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            cc_load_policy: 1,
            cc_lang_pref: PREFERRED_CAPTION_LANGUAGE,
            // Track names in English whatever the viewer's region, to match the rest of the page.
            hl: PREFERRED_CAPTION_LANGUAGE,
            rel: 0,
            playsinline: 1,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            start: Math.floor(start),
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return
              ready = true
              window.clearTimeout(deadline)
              player.current = target
              const frame = container.querySelector('iframe')
              frame?.setAttribute('title', title)
              // Every control is ours, so the frame stays out of the tab order.
              frame?.setAttribute('tabindex', '-1')
              lastPoll.current = { position: start, at: performance.now() }
              setPosition(start)
              setStatus('ready')
              try {
                if (captionsOff) target.unloadModule('captions')
                else target.loadModule('captions')
              } catch {
                // Captions stay as YouTube set them.
              }
              // Watched to 95% on an earlier visit, but the module wasn't marked complete.
              if (free.current && !done.current) finish()
            },
            onStateChange: ({ data }) => {
              if (!cancelled) handleState(data)
            },
            onApiChange: ({ target }) => {
              if (cancelled) return
              const list = captionTracks(target)
              if (list.length === 0) return
              setTracks(list)
              if (!readCaptionsOff()) applyCaptionLanguage(target, list)
            },
            onError: () => fail(),
          },
        })
      } catch {
        fail()
      }
    })

    return () => {
      const wasReady = ready
      cancelled = true
      window.clearTimeout(deadline)
      stop(pollTimer)
      stop(reportTimer)
      stop(endTimer)
      // Leaving the page inside the app: send what was watched.
      if (wasReady && !done.current) controllerRef.current.reportOnHide(furthest.current)
      try {
        yt?.destroy()
      } catch {
        // Already gone.
      }
      player.current = null
      container.replaceChildren()
    }
    // The player is built once per attempt; later prop changes from a page refresh mustn't rebuild it.
  }, [attempt])

  // The last report as the tab hides or closes.
  useEffect(() => {
    const flush = () => {
      if (player.current && !done.current) controllerRef.current.reportOnHide(furthest.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const toggle = useCallback(() => {
    const yt = player.current
    if (!yt) return
    if (yt.getPlayerState() === PLAYER_STATE.PLAYING) yt.pauseVideo()
    else yt.playVideo()
  }, [])

  const seek = useCallback((target: number) => {
    const yt = player.current
    if (!yt) return
    const to = Math.min(duration, snapSeek(target, furthest.current, free.current))
    if (to < target - 0.5) setNotice(SKIP_NOTICE)
    yt.seekTo(to, true)
    lastPoll.current = { position: to, at: performance.now() }
    setPosition(to)
    if (ended.current || phase === 'end') {
      ended.current = false
      setPhase((p) => (p === 'end' ? 'watching' : p))
    }
  }, [duration, phase])

  const setCaptions = useCallback(
    (on: boolean) => {
      const yt = player.current
      setCaptionsOn(on)
      rememberCaptionsOff(!on)
      if (!yt) return
      try {
        if (on) {
          // The track goes back on when YouTube reports the module loaded (onApiChange).
          appliedLanguage.current = null
          yt.loadModule('captions')
        } else {
          yt.unloadModule('captions')
        }
      } catch {
        // YouTube refused: the button still shows what was asked for.
      }
    },
    [],
  )

  const chooseCaptionLanguage = useCallback(
    (languageCode: string) => {
      wantedLanguage.current = languageCode
      const yt = player.current
      if (yt) applyCaptionLanguage(yt, tracks)
    },
    [applyCaptionLanguage, tracks],
  )

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    status, phase, started, playing, position, furthest: shownFurthest, free: isFree, trouble, notice,
    captionsOn, tracks, captionLanguage,
    toggle, seek, setCaptions, chooseCaptionLanguage, retry,
  }
}
