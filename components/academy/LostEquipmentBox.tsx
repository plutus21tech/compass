'use client'

import { useEffect, useState } from 'react'
import { WarningBoxBlock } from './blocks/WarningBoxBlock'

interface LostEquipmentData {
  heading: string
  markdown: string
}

/** Module 7's "lost, stolen or damaged" steps, for everyone. Hidden when there is nothing to show. */
export function LostEquipmentBox() {
  const [data, setData] = useState<LostEquipmentData | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/onboarding/academy/lost-equipment', { cache: 'no-store' })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!cancelled && ok && body?.data?.heading && typeof body.data.markdown === 'string') setData(body.data)
      })
      .catch(() => { /* the box simply stays hidden */ })
    return () => { cancelled = true }
  }, [])

  if (!data) return null
  return (
    <div className="mb-8">
      <WarningBoxBlock block={{ type: 'warningBox', heading: data.heading, markdown: data.markdown }} />
    </div>
  )
}
