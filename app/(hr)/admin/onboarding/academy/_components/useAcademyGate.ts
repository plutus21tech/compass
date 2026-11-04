'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/** True once the Academy flag is confirmed on. When off (or unknown) the page shows nothing and leaves. */
export function useAcademyGate(): boolean {
  const router = useRouter()
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { academyEnabled?: boolean } | null) => {
        if (cancelled) return
        if (body?.academyEnabled === true) setEnabled(true)
        else router.replace('/admin/onboarding')
      })
      .catch(() => {
        if (!cancelled) router.replace('/admin/onboarding')
      })
    return () => {
      cancelled = true
    }
  }, [router])
  return enabled
}
