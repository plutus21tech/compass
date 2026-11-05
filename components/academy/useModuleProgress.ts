'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ProgressEvent, ProgressState } from '@/lib/academy/progress'
import type { ModuleProgressView } from '@/lib/academy/view'
import { displayedState, footerState, type FooterState } from '@/lib/academy/view-labels'
import { academyRequest, errorMessage } from './api'

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
  complete: () => Promise<CompleteResult | null>
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
    () =>
      inTurn(async () => {
        try {
          return await academyRequest<CompleteResult>(`${base}/complete`, 'POST')
        } catch (error) {
          toast.error(errorMessage(error))
          return null
        }
      }),
    [base, inTurn],
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
  }
}
