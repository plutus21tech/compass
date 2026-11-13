'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { paymentFieldLabel, paymentMethodLabel } from '@/lib/academy/tracker-labels'
import type { PayoutView } from '@/lib/academy/payout'
import type { DrawerPayment } from '@/lib/academy/tracker'
import { ErrorLine } from './Chip'
import { DATE_ZONE, trackerErrorText, trackerFetch } from './tracker-api'

interface Props {
  userId: string
  payment: DrawerPayment
}

/**
 * Masked until the person clicks Reveal, which the server logs. The revealed copy lives only in this
 * component, so it is gone when the drawer closes or the hire changes.
 */
export function PaymentPanel({ userId, payment }: Props) {
  const [revealed, setRevealed] = useState<PayoutView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reveal = async () => {
    setBusy(true)
    setError(null)
    try {
      const view = await trackerFetch<PayoutView | null>(`/api/admin/onboarding/payout/${encodeURIComponent(userId)}/reveal`, { method: 'POST' })
      if (!view) setError('No payment details are saved for this hire.')
      setRevealed(view)
    } catch (e) {
      setError(trackerErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (payment.unreadable) {
    return <p className="text-sm text-muted-foreground">{"These saved details can't be opened right now."}</p>
  }
  const holder = revealed ? revealed.accountHolderName : payment.accountHolderName
  const currency = revealed ? revealed.currency : payment.currency
  const fields = revealed ? revealed.fields : payment.fields
  const rows = Object.entries(fields).filter(([, v]) => v !== null && v !== '')
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-muted-foreground">Method</dt>
        <dd>{paymentMethodLabel(payment.method)}</dd>
        {holder && (<><dt className="text-muted-foreground">Account holder</dt><dd className="break-words">{holder}</dd></>)}
        {currency && (<><dt className="text-muted-foreground">Currency</dt><dd>{currency}</dd></>)}
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{paymentFieldLabel(key)}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Last changed</dt>
        <dd>{formatAcademyDate(payment.lastChangedAt, DATE_ZONE)}</dd>
      </dl>
      <ErrorLine message={error} />
      {revealed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => setRevealed(null)}>
            <EyeOff className="h-4 w-4" aria-hidden /> Hide
          </Button>
          <span className="text-xs text-muted-foreground">These clear when you close this panel.</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={reveal}>
            <Eye className="h-4 w-4" aria-hidden /> Reveal
          </Button>
          <span className="text-xs text-muted-foreground">Revealing is logged with your name and the time.</span>
        </div>
      )}
    </div>
  )
}
