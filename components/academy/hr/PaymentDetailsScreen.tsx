'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PayoutView } from '@/lib/academy/payout'
import type { DrawerPayment, OaTrackerRow } from '@/lib/academy/tracker'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { paymentChip, paymentMethodLabel } from '@/lib/academy/tracker-labels'
import { Chip, ErrorLine } from './Chip'
import { PaymentPanel } from './PaymentPanel'
import { DATE_ZONE, trackerErrorText, trackerFetch } from './tracker-api'

const NONE_YET = 'No payment details have been saved yet.'

/** Newest change first. Rows are only those with saved details. */
function withDetails(rows: readonly OaTrackerRow[]): OaTrackerRow[] {
  return rows
    .filter((r) => r.paymentStatus.saved && r.paymentStatus.userId)
    .sort((a, b) => (b.paymentStatus.lastChangedAt ?? '').localeCompare(a.paymentStatus.lastChangedAt ?? ''))
}

function toPayment(view: PayoutView): DrawerPayment {
  const { method, accountHolderName, currency, fields, updatedAt } = view
  return { method, accountHolderName, currency, fields, lastChangedAt: updatedAt, unreadable: false }
}

function HireRow({ row }: { row: OaTrackerRow }) {
  const [open, setOpen] = useState(false)
  const [payment, setPayment] = useState<DrawerPayment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const userId = row.paymentStatus.userId as string

  const toggle = async () => {
    if (open) { setOpen(false); setPayment(null); return }
    setOpen(true)
    try {
      const view = await trackerFetch<PayoutView | null>(`/api/admin/onboarding/payout/${encodeURIComponent(userId)}`)
      if (view) setPayment(toPayment(view)); else setError(NONE_YET)
    } catch (e) {
      setError(trackerErrorText(e))
    }
  }

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">
            {[row.department, `Joining ${formatAcademyDate(row.joiningDate, DATE_ZONE)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {row.paymentStatus.method && <span>{paymentMethodLabel(row.paymentStatus.method)}</span>}
          <Chip chip={paymentChip(row.paymentStatus)} />
          {row.paymentStatus.lastChangedAt && <span>Changed {formatAcademyDate(row.paymentStatus.lastChangedAt, DATE_ZONE)}</span>}
        </div>
        <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={toggle}>
          {open ? 'Close' : 'View details'}
          <span className="sr-only"> for {row.name}</span>
        </Button>
      </div>
      {open && <ErrorLine message={error} />}
      {open && payment && <PaymentPanel userId={userId} payment={payment} />}
    </li>
  )
}

export function PaymentDetailsScreen() {
  const [rows, setRows] = useState<OaTrackerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    trackerFetch<OaTrackerRow[]>('/api/admin/onboarding/tracker')
      .then((data) => setRows(withDetails(data)))
      .catch((e) => setError(trackerErrorText(e)))
  }, [])

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Payment details</h1>
        <p className="mt-1 text-muted-foreground">Hires who have saved how they want to be paid, newest change first.</p>
      </div>
      <ErrorLine message={error} />
      {rows === null && !error && <p className="text-sm text-muted-foreground" role="status">Loading...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{NONE_YET}</p>
      )}
      {rows !== null && rows.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((row) => <HireRow key={row.newHireId} row={row} />)}
        </ul>
      )}
    </div>
  )
}
