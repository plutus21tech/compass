'use client'

import { useCallback, useEffect, useState } from 'react'
import type { PersonProfile, ProfileCompensation, ProfileDetails } from '@/lib/people/profile-rules'

export type ProfileState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error' }
  | { status: 'ready'; profile: PersonProfile }

export type PayState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; pay: ProfileCompensation }

interface Envelope<T> {
  success?: boolean
  data?: T
  error?: string
}

async function readEnvelope<T>(res: Response): Promise<Envelope<T> | null> {
  return (await res.json().catch(() => null)) as Envelope<T> | null
}

export function useProfile(personId: string): {
  state: ProfileState
  setDetails: (details: ProfileDetails) => void
} {
  const [state, setState] = useState<ProfileState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    const load = async () => {
      try {
        const res = await fetch(`/api/people/${encodeURIComponent(personId)}`)
        const body = await readEnvelope<PersonProfile>(res)
        if (cancelled) return
        if (res.status === 404) setState({ status: 'missing' })
        else if (!res.ok || !body?.data) setState({ status: 'error' })
        else setState({ status: 'ready', profile: body.data })
      } catch (error) {
        console.error('Failed to load the profile:', error)
        if (!cancelled) setState({ status: 'error' })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [personId])

  const setDetails = useCallback((details: ProfileDetails) => {
    setState((prev) => (prev.status === 'ready' ? { status: 'ready', profile: { ...prev.profile, details } } : prev))
  }, [])

  return { state, setDetails }
}

export type SaveResult = { ok: true; data: ProfileDetails } | { ok: false; error: string }

const SAVE_ERROR = 'Could not save your profile. Try again.'

export async function saveMyDetails(details: ProfileDetails): Promise<SaveResult> {
  try {
    const res = await fetch('/api/people/me/details', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(details),
    })
    const body = await readEnvelope<ProfileDetails>(res)
    if (!res.ok || !body?.data) return { ok: false, error: body?.error ?? SAVE_ERROR }
    return { ok: true, data: body.data }
  } catch (error) {
    console.error('Failed to save profile details:', error)
    return { ok: false, error: SAVE_ERROR }
  }
}

/** Pay is only requested when HR or OA ask to see it. */
export function usePay(personId: string): { state: PayState; show: () => void; hide: () => void } {
  const [state, setState] = useState<PayState>({ status: 'hidden' })

  useEffect(() => {
    setState({ status: 'hidden' })
  }, [personId])

  const show = useCallback(() => {
    setState({ status: 'loading' })
    const load = async () => {
      try {
        const res = await fetch(`/api/people/${encodeURIComponent(personId)}/compensation`, { cache: 'no-store' })
        const body = await readEnvelope<ProfileCompensation>(res)
        setState(res.ok && body?.data ? { status: 'ready', pay: body.data } : { status: 'error' })
      } catch (error) {
        console.error('Failed to load pay history:', error)
        setState({ status: 'error' })
      }
    }
    void load()
  }, [personId])

  const hide = useCallback(() => setState({ status: 'hidden' }), [])

  return { state, show, hide }
}
