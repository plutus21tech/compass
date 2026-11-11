'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Home, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDays } from '@/lib/format-count'
import { formatDateRange } from '@/lib/format-date'
import { cancelWfh, decideWfh } from '@/lib/time-off/api'
import { canCancelWfhRequest } from '@/lib/time-off/request-rules'
import { beginRow, endRow } from '@/lib/time-off/row-guard'
import type { WfhRequest } from '@/lib/time-off/types'
import { calculateWfhDays } from '@/lib/wfh-utils'
import { STATUS_STYLE } from './leave-style'

const wfhDays = (r: WfhRequest): number => calculateWfhDays(new Date(r.startDate), new Date(r.endDate))

function WfhIcon() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-500/10">
      <Home className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
    </div>
  )
}

interface SectionProps {
  isThreeE: boolean
  requests: WfhRequest[]
  approvals: WfhRequest[]
  onRequest: () => void
  onChanged: () => Promise<void>
}

export function WfhSection({ isThreeE, requests, approvals, onRequest, onChanged }: SectionProps) {
  const [cancelTarget, setCancelTarget] = useState<WfhRequest | null>(null)
  // Last selection, so the dialog text stays filled while the close animation runs.
  const lastCancel = useRef<WfhRequest | null>(null)
  if (cancelTarget) lastCancel.current = cancelTarget
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const busyRef = useRef<ReadonlySet<string>>(new Set())

  const showMine = isThreeE || requests.length > 0
  if (!showMine && approvals.length === 0) return null

  /** One action per row at a time; other rows are unaffected. */
  const guarded = async (id: string, run: () => Promise<boolean>): Promise<void> => {
    const next = beginRow(busyRef.current, id)
    if (!next) return
    busyRef.current = next
    setBusyIds(next)
    try {
      if (await run()) await onChanged()
    } finally {
      busyRef.current = endRow(busyRef.current, id)
      setBusyIds(busyRef.current)
    }
  }

  const cancel = (r: WfhRequest) =>
    guarded(r.id, async () => {
      const res = await cancelWfh(r.id)
      if (!res.ok) {
        toast.error(res.error)
        return false
      }
      toast.success('WFH request cancelled')
      setCancelTarget(null)
      return true
    })

  const decide = (r: WfhRequest, action: 'approve' | 'reject') =>
    guarded(r.id, async () => {
      const res = await decideWfh(r.id, action)
      if (!res.ok) {
        toast.error(res.error)
        return false
      }
      toast.success(action === 'approve' ? 'WFH approved' : 'WFH rejected')
      return true
    })

  const pending = lastCancel.current

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {showMine && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="font-display font-semibold text-foreground">My WFH requests</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Separate from leave balances. Available for 3E team members only.
              </p>
            </div>
            {isThreeE && (
              <Button size="sm" onClick={onRequest}>
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                Request WFH
              </Button>
            )}
          </div>
          {requests.length === 0 ? (
            <div className="p-6 text-center">
              <Home className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" aria-hidden />
              <p className="text-sm text-muted-foreground">No WFH requests yet</p>
              {isThreeE && <p className="mt-1 text-xs text-muted-foreground">Use Request WFH to submit one.</p>}
            </div>
          ) : (
            <ul className="max-h-[400px] divide-y divide-border overflow-y-auto">
              {requests.map((r) => {
                const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
                return (
                  <li key={r.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <WfhIcon />
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">Work From Home</span>
                          <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
                            {status.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDateRange(r.startDate, r.endDate)} · {formatDays(wfhDays(r))}
                        </p>
                        <p className="mt-2 text-sm text-foreground">{r.reason}</p>
                        {r.workPlan && (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Work plan: {r.workPlan}</p>
                        )}
                        {canCancelWfhRequest(r) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="mt-2 h-auto p-0 text-xs text-red-600 hover:text-red-700"
                            disabled={busyIds.has(r.id)}
                            onClick={() => setCancelTarget(r)}
                          >
                            Cancel request
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {approvals.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-display font-semibold text-foreground">WFH approvals</h2>
            <p className="mt-1 text-xs text-muted-foreground">Requests waiting for your review</p>
          </div>
          <ul className="divide-y divide-border">
            {approvals.map((r) => {
              const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
              const busy = busyIds.has(r.id)
              return (
                <li key={r.id} className="p-3">
                  <div className="flex items-start gap-3">
                    <WfhIcon />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{r.employee?.name || 'Team member'}</span>
                        <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.employee?.department || 'No department'} · {formatDateRange(r.startDate, r.endDate)} ·{' '}
                        {formatDays(wfhDays(r))}
                      </p>
                      <p className="mt-2 text-sm text-foreground">{r.reason}</p>
                      {r.workPlan && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">Work plan: {r.workPlan}</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy}
                          onClick={() => void decide(r, 'approve')}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
                          {busy ? 'Working...' : 'Approve'}
                        </Button>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(r, 'reject')}>
                          <XCircle className="mr-1 h-4 w-4" aria-hidden />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) void cancel(cancelTarget)
        }}
        title="Cancel this WFH request?"
        message={
          pending
            ? `Your WFH request for ${formatDateRange(pending.startDate, pending.endDate)} will be cancelled.`
            : 'Your WFH request will be cancelled.'
        }
        confirmText="Cancel request"
        cancelText="Keep it"
        variant="danger"
      />
    </div>
  )
}
