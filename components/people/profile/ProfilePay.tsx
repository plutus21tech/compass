'use client'

import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMonthYear } from '@/lib/format-date'
import type { ProfileCompensation } from '@/lib/people/profile-rules'
import { usePay } from './use-profile'

const CARD = 'rounded-xl border border-border bg-card p-5'
const CHART = { width: 320, height: 72, pad: 6 }

export const formatMoney = (amount: number, currency: string): string =>
  `${currency} ${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(amount)}`

const formatPercent = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`

/** Basic salary over time as a step line: pay holds, then jumps. */
function StepChart({ points }: { points: { amount: number }[] }) {
  if (points.length < 2) return null
  const amounts = points.map((point) => point.amount)
  const min = Math.min(...amounts)
  const span = Math.max(...amounts) - min || 1
  const stepX = (CHART.width - CHART.pad * 2) / (points.length - 1)
  const y = (amount: number) => CHART.height - CHART.pad - ((amount - min) / span) * (CHART.height - CHART.pad * 2)
  const path = points
    .map((point, index) => {
      const x = CHART.pad + index * stepX
      return index === 0 ? `M ${x} ${y(point.amount)}` : `H ${x} V ${y(point.amount)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="mt-4 h-[72px] w-full max-w-sm text-primary" role="img" aria-label="Basic salary over time">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

export function PayHistory({ pay }: { pay: ProfileCompensation }) {
  if (pay.history.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">No finalized payroll for this person yet.</p>
  }
  const first = pay.history[0]
  const sinceStart =
    pay.currency && pay.currentBasic && first.amount > 0 ? ((pay.currentBasic - first.amount) / first.amount) * 100 : null
  return (
    <div className="mt-4">
      {pay.currency && pay.currentBasic ? (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Current basic salary</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{formatMoney(pay.currentBasic, pay.currency)}</p>
          </div>
          {sinceStart !== null && pay.history.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium tabular-nums text-foreground">{formatPercent(sinceStart)}</span> since{' '}
              {formatMonthYear(first.effectiveFrom)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Paid in more than one currency ({pay.currencies.join(', ')}), so no single figure is shown.</p>
      )}

      {pay.currency ? <StepChart points={pay.history} /> : null}

      <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Trajectory</h3>
      <ol className="mt-2 divide-y divide-border">
        {pay.history.map((point, index) => {
          const change = pay.changeEvents.find(
            (event) => event.effectiveFrom === point.effectiveFrom && event.currency === point.currency
          )
          return (
            <li key={`${point.currency}-${point.effectiveFrom}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="text-muted-foreground">{formatMonthYear(point.effectiveFrom)}</span>
              <span className="tabular-nums text-foreground">
                {formatMoney(point.amount, point.currency)}
                {change?.percentChange != null ? (
                  <span className="ml-2 text-xs text-muted-foreground">{formatPercent(change.percentChange)}</span>
                ) : index === 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">first recorded</span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs text-muted-foreground">Basic salary from finalized payroll. Read-only; change pay in Payroll.</p>
    </div>
  )
}

/** Pay history, for HR and OA only. Nothing is requested until they ask to see it. */
export function ProfilePay({ personId }: { personId: string }) {
  const { state, show, hide } = usePay(personId)
  return (
    <section aria-labelledby="profile-pay-heading" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="profile-pay-heading" className="text-base font-semibold text-foreground">Pay</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Only HR and OA can see this section.
          </p>
        </div>
        {state.status === 'ready' ? (
          <Button type="button" variant="ghost" size="sm" onClick={hide}>Hide</Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={show} disabled={state.status === 'loading'}>
            {state.status === 'error' ? 'Try again' : 'Show pay history'}
          </Button>
        )}
      </div>
      {state.status === 'loading' ? <Skeleton className="mt-4 h-24 w-full rounded-lg" /> : null}
      {state.status === 'error' ? (
        <p role="alert" className="mt-3 text-sm text-destructive">Could not load pay history.</p>
      ) : null}
      {state.status === 'ready' ? <PayHistory pay={state.pay} /> : null}
    </section>
  )
}
