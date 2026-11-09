'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ProgressEvent, ProgressState } from '@/lib/academy/progress'
import type { ModuleProgressView } from '@/lib/academy/view'
import { displayedState, footerState, type FooterState } from '@/lib/academy/view-labels'
import { academyRequest, errorMessage } from './api'

const videoEvent = (seconds: number): ProgressEvent => ({ type: 'VIDEO_PROGRESS', seconds: Math.max(0, Math.round(seconds * 10) / 10) })

export interface CompleteResult { nextSlug: string | null; alreadyCompleted: boolean }

export interface ModuleProgress {
  state: ProgressState
  footer: FooterState
  readOnly: boolean
  /** True once the server has the scroll, so the sentinel can stop watching. */
  scrollSaved: boolean
  setCheck: (key: string, checked: boolean) => void
  openLink: (key: string) => void
  markScrolledEnd: () => void
  /** `quiet` skips the error toast: the video player retries on its next report instead. */
  complete: (options?: { quiet?: boolean }) => Promise<CompleteResult | null>
  /** A video report, in turn with the other writes. Null when it failed; it never toasts, the next report retries. */
  reportVideo: (seconds: number) => Promise<ModuleProgressView | null>
  /** The last report as the page goes away: survives the unload, and nothing waits for it. */
  reportVideoOnHide: (seconds: number) => void
}

/**
 * Every write for this module runs through one in-order queue, so a fast untick can't overtake its
 * tick and "complete" can't overtake either. Ticks show at once; a failed event falls out of
 * `pending`, which is what reverts it, and the server's message is shown.
 */
export function useModuleProgress(slug: string, initial: ModuleProgressView): ModuleProgress {
  const [confirmed, setConfirmed] = useState(initial)
  const [pending, setPending] = useState<ProgressEvent[]>([])
  const unsaved = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const scrollSent = useRef(false)
  const base = `/api/onboarding/academy/modules/${encodeURIComponent(slug)}`

  // A field save refreshes the page. An event in flight will bring a fresher answer than this one.
  useEffect(() => {
    if (unsaved.current === 0) setConfirmed(initial)
  }, [initial])

  const inTurn = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task)
    queue.current = run.catch(() => undefined)
    return run
  }, [])

  const send = useCallback(
    (event: ProgressEvent): Promise<boolean> => {
      unsaved.current += 1
      setPending((events) => [...events, event])
      return inTurn(async () => {
        try {
          setConfirmed(await academyRequest<ModuleProgressView>(`${base}/events`, 'POST', event))
          return true
        } catch (error) {
          toast.error(errorMessage(error))
          return false
        } finally {
          unsaved.current -= 1
          setPending((events) => events.slice(1))
        }
      })
    },
    [base, inTurn],
  )

  const readOnly = confirmed.status === 'COMPLETED'
  const state = useMemo(() => displayedState(confirmed.state, pending, new Date()), [confirmed.state, pending])

  const setCheck = useCallback(
    (key: string, checked: boolean) => {
      if (!readOnly) void send({ type: 'CHECK', key, checked })
    },
    [readOnly, send],
  )

  const openLink = useCallback(
    (key: string) => {
      if (!readOnly && !state.linksOpenedAt[key]) void send({ type: 'LINK_OPENED', key })
    },
    [readOnly, send, state.linksOpenedAt],
  )

  const markScrolledEnd = useCallback(() => {
    if (readOnly || scrollSent.current) return
    scrollSent.current = true
    void send({ type: 'SCROLLED_END' }).then((saved) => {
      // Left armed on failure: seeing the end of the page again retries it.
      scrollSent.current = saved
    })
  }, [readOnly, send])

  const complete = useCallback(
    (options?: { quiet?: boolean }) =>
      inTurn(async () => {
        try {
          return await academyRequest<CompleteResult>(`${base}/complete`, 'POST')
        } catch (error) {
          if (!options?.quiet) toast.error(errorMessage(error))
          return null
        }
      }),
    [base, inTurn],
  )

  // Video reports skip `pending`: they change nothing the hire sees until the server answers.
  const reportVideo = useCallback(
    (seconds: number) =>
      inTurn(async () => {
        try {
          const next = await academyRequest<ModuleProgressView>(`${base}/events`, 'POST', videoEvent(seconds))
          if (unsaved.current === 0) setConfirmed(next)
          return next
        } catch {
          return null
        }
      }),
    [base, inTurn],
  )

  const reportVideoOnHide = useCallback(
    (seconds: number) => {
      try {
        void fetch(`${base}/events`, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(videoEvent(seconds)),
        }).catch(() => undefined)
      } catch {
        // The page is going away; the next visit resumes from the last saved report.
      }
    },
    [base],
  )

  return {
    state,
    footer: footerState(confirmed, pending.length),
    readOnly,
    scrollSaved: confirmed.state.scrolledToEnd,
    setCheck,
    openLink,
    markScrolledEnd,
    complete,
    reportVideo,
    reportVideoOnHide,
  }
}
