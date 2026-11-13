'use client'

// The YouTube IFrame Player API, loaded once per page. Only the parts the Academy player uses are typed.

// Privacy: the player itself embeds from youtube-nocookie.com, but YouTube serves the IFrame API
// script only from www.youtube.com, so loading it contacts youtube.com. It loads only on a page with
// a ready video (and in the videos editor, for a saved ID's length check), never elsewhere.
export const YOUTUBE_API_SRC = 'https://www.youtube.com/iframe_api'
export const YOUTUBE_HOST = 'https://www.youtube-nocookie.com'
export const PLAYER_READY_TIMEOUT_MS = 10_000

export const PLAYER_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

export interface CaptionTrack { languageCode: string; displayName: string }

export interface YouTubePlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  loadModule(module: string): void
  unloadModule(module: string): void
  getOption(module: string, option: string): unknown
  setOption(module: string, option: string, value: unknown): void
  destroy(): void
}

interface PlayerEvent { target: YouTubePlayer; data: number }

export interface PlayerOptions {
  host: string
  videoId: string
  width: string
  height: string
  playerVars: Record<string, string | number>
  events: {
    onReady?: (event: PlayerEvent) => void
    onStateChange?: (event: PlayerEvent) => void
    onError?: (event: PlayerEvent) => void
    onApiChange?: (event: PlayerEvent) => void
  }
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer
}

declare global {
  interface Window {
    YT?: Partial<YouTubeApi>
    onYouTubeIframeAPIReady?: () => void
  }
}

let loading: Promise<YouTubeApi | null> | null = null

const readyApi = (): YouTubeApi | null => (typeof window.YT?.Player === 'function' ? (window.YT as YouTubeApi) : null)

/**
 * Loads the API script once. Resolves to null when it is blocked, fails or takes longer than the
 * timeout, so the caller can show the fallback. A failed load can be tried again.
 */
export function loadYouTubeApi(timeoutMs: number = PLAYER_READY_TIMEOUT_MS): Promise<YouTubeApi | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const ready = readyApi()
  if (ready) return Promise.resolve(ready)
  if (loading) return loading

  loading = new Promise<YouTubeApi | null>((resolve) => {
    let settled = false
    const finish = (api: YouTubeApi | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (!api) loading = null
      resolve(api)
    }
    const timer = window.setTimeout(() => finish(readyApi()), timeoutMs)
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      finish(readyApi())
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${YOUTUBE_API_SRC}"]`)
    if (existing) {
      existing.addEventListener('error', () => finish(null), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = YOUTUBE_API_SRC
    script.async = true
    script.addEventListener('error', () => {
      script.remove()
      finish(null)
    }, { once: true })
    document.head.appendChild(script)
  })
  return loading
}

/** The tracks YouTube offers, once the captions module has loaded. Never throws. */
export function captionTracks(player: YouTubePlayer): CaptionTrack[] {
  try {
    const list = player.getOption('captions', 'tracklist')
    if (!Array.isArray(list)) return []
    return list.flatMap((track: unknown) => {
      if (typeof track !== 'object' || track === null) return []
      const { languageCode, displayName } = track as Record<string, unknown>
      return typeof languageCode === 'string' && languageCode
        ? [{ languageCode, displayName: typeof displayName === 'string' && displayName ? displayName : languageCode }]
        : []
    })
  } catch {
    return []
  }
}
