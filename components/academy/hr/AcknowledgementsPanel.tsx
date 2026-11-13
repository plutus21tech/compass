'use client'

import { Download } from 'lucide-react'
import { acknowledgementKindLabel, formatAcademyDate } from '@/lib/academy/view-labels'
import type { DrawerAcknowledgement } from '@/lib/academy/tracker'
import { DATE_ZONE } from './tracker-api'

const LINK_CLASS =
  'inline-flex items-center gap-1 rounded text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface Props {
  newHireId: string
  acknowledgements: readonly DrawerAcknowledgement[]
}

export function AcknowledgementsPanel({ newHireId, acknowledgements }: Props) {
  if (acknowledgements.length === 0) return <p className="text-sm text-muted-foreground">Nothing signed yet.</p>
  const base = `/api/admin/onboarding/tracker/${encodeURIComponent(newHireId)}/acknowledgements`
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {acknowledgements.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{acknowledgementKindLabel(a.kind)}</span>
              <span className="block text-xs text-muted-foreground">
                Signed by {a.typedName} on {formatAcademyDate(a.signedAt, DATE_ZONE)}
              </span>
            </span>
            <a className={LINK_CLASS} href={`${base}?id=${encodeURIComponent(a.id)}`} download>
              <Download className="h-3.5 w-3.5" aria-hidden /> Download PDF
              <span className="sr-only"> for {acknowledgementKindLabel(a.kind)}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className={LINK_CLASS} href={base} download>
        <Download className="h-3.5 w-3.5" aria-hidden /> Download all as CSV
      </a>
    </div>
  )
}
