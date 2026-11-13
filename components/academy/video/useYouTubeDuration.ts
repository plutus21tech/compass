'use client'

import { useEffect, useState } from 'react'
import { YOUTUBE_HOST, loadYouTubeApi, type YouTubePlayer } from './useYouTube'

/** YouTube can report 0 for a moment after ready, until it has the video's details. */
const DURATION_POLL_MS = 250
const DURATION_WAIT_MS = 8_000

export type MeasuredLength = { status: 'idle' | 'measuring' | 'unavailable' } | { status: 'known'; seconds: number }

/**
 * The real length of a saved YouTube video, read from a hidden player that never plays, for the
 * videos editor's length check (R6). Only runs with an 11-character ID, so the API script loads
 * only once a video has been saved. A blocked or failed load is 'unavailable', never an error.
 */
export function useYouTubeDuration(youtubeId: string | null): MeasuredLength {
  const [measured, setMeasured] = useState<MeasuredLength>({ status: 'idle' })

  useEffect(() => {
    if (!youtubeId || youtubeId.length !== 11) {
      setMeasured({ status: 'idle' })
      return
    }
    let cancelled = false
    let player: YouTubePlayer | null = null
    let poll: number | undefined
    let giveUp: number | undefined
    const host = document.createElement('div')
    // Off screen and inert: it never takes focus or reaches a screen reader.
    host.setAttribute('aria-hidden', 'true')
    host.inert = true
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;pointer-events:none'
    const mount = document.createElement('div')
    host.appendChild(mount)
    document.body.appendChild(host)

    const finish = (next: MeasuredLength) => {
      window.clearInterval(poll)
      window.clearTimeout(giveUp)
      if (!cancelled) setMeasured(next)
      try {
        player?.destroy()
      } catch {
        // A half-made player may fail to destroy; the element goes either way.
      }
      player = null
      host.remove()
    }

    setMeasured({ status: 'measuring' })
    void loadYouTubeApi().then((api) => {
      if (cancelled) return
      if (!api) return finish({ status: 'unavailable' })
      giveUp = window.setTimeout(() => finish({ status: 'unavailable' }), DURATION_WAIT_MS)
      player = new api.Player(mount, {
        host: YOUTUBE_HOST,
        videoId: youtubeId,
        width: '320',
        height: '180',
        playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1 },
        events: {
          onReady: ({ target }) => {
            poll = window.setInterval(() => {
              const seconds = target.getDuration()
              if (seconds > 0) finish({ status: 'known', seconds })
            }, DURATION_POLL_MS)
          },
          onError: () => finish({ status: 'unavailable' }),
        },
      })
    })

    return () => {
      cancelled = true
      finish({ status: 'idle' })
    }
  }, [youtubeId])

  return measured
}
