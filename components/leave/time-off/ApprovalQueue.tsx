'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { TransitionPlanView } from '@/components/leave/TransitionPlanView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatDays } from '@/lib/format-count'
import { formatDateRange } from '@/lib/format-date'
import { validateTransitionTasks, type TransitionTask } from '@/lib/leave-transition-plan'
import { beginRow, endRow } from '@/lib/time-off/row-guard'
import { decideLeave, reviewTransitionPlan } from '@/lib/time-off/api'
import { approvalActions, decisionToast, planReviewState, requestDays } from '@/lib/time-off/request-rules'
import type { ApprovalRequest } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE, STATUS_STYLE } from './leave-style'
import { PlanDisapproveDialog } from './PlanDisapproveDialog'

const coerceTasks = (raw: unknown): TransitionTask[] => {
  try {
    return validateTransitionTasks(raw)
  } catch {
    return []
  }
}

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name

interface ApprovalQueueProps {
  requests: ApprovalRequest[]
  highlightedId: string
  onChanged: () => Promise<void>
}

export function ApprovalQueue({ requests, highlightedId, onChanged }: ApprovalQueueProps) {
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const busyRef = useRef<ReadonlySet<string>>(new Set())
  const [disapproveLeave, setDisapproveLeave] = useState<ApprovalRequest | null>(null)
  const [disapprovePlan, setDisapprovePlan] = useState<ApprovalRequest | null>(null)
  // Last selections, so dialog titles stay filled while the close animation runs.
  const lastLeave = useRef<ApprovalRequest | null>(null)
  const lastPlan = useRef<ApprovalRequest | null>(null)
  if (disapproveLeave) lastLeave.current = disapproveLeave
  if (disapprovePlan) lastPlan.current = disapprovePlan

  useEffect(() => {
    if (!highlightedId) return
    const frame = window.requestAnimationFrame(() => {
      const card = document.getElementById(`leave-approval-${highlightedId}`)
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      card?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightedId])

  /** One decision per row at a time; other rows are unaffected. Resolves true on success. */
  const guarded = async (id: string, run: () => Promise<boolean>): Promise<boolean> => {
    const next = beginRow(busyRef.current, id)
    if (!next) return false
    busyRef.current = next
    setBusyIds(next)
    try {
      const ok = await run()
      if (ok) await onChanged()
      return ok
    } finally {
      busyRef.current = endRow(busyRef.current, id)
      setBusyIds(busyRef.current)
    }
  }

  const decide = (r: ApprovalRequest, action: 'approve' | 'reject') =>
    guarded(r.id, async () => {
      const res = await decideLeave(r.id, action)
      if (!res.ok) {
        toast.error(res.error)
        return false
      }
      toast.success(decisionToast(action, res.data.status))
      return true
    })

  const reviewPlan = (r: ApprovalRequest, action: 'APPROVE' | 'DISAPPROVE', reason = '') =>
    guarded(r.id, async () => {
      const res = await reviewTransitionPlan(r.id, action, reason)
      if (!res.ok) {
        toast.error(res.error)
        return false
      }
      toast.success(action === 'APPROVE' ? 'Transition plan approved' : 'Transition plan disapproved')
      return true
    })

  if (requests.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="font-display font-semibold text-foreground">Team approvals</h2>
        <p className="mt-1 text-xs text-muted-foreground">Requests waiting for you</p>
      </div>
      <div className="divide-y divide-border">
        {requests.map((r) => {
          const type = LEAVE_TYPE_STYLE[r.leaveType]
          const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
          const Icon = type.icon
          const actions = approvalActions(r)
          const plan = planReviewState(r)
          const highlighted = highlightedId === r.id
          const busy = busyIds.has(r.id)
          return (
            <div
              key={r.id}
              id={`leave-approval-${r.id}`}
              tabIndex={-1}
              aria-current={highlighted ? 'true' : undefined}
              className={`scroll-mt-24 p-3 outline-none transition-colors ${
                highlighted ? 'bg-primary/5 ring-2 ring-inset ring-primary/60' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${type.bgLight}`}>
                  <Icon className={`h-4 w-4 ${type.text}`} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  {highlighted && <p className="mb-1 text-[11px] font-medium text-primary">Opened from email</p>}
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{r.employee.name}</span>
                    <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {type.label} · {formatDateRange(r.startDate, r.endDate)} · {formatDays(requestDays(r))}
                  </p>
                  {r.isHalfDay && (
                    <p className="text-[11px] text-muted-foreground">
                      {halfDaySessionLabel(r.halfDaySession)} -{' '}
                      {halfDayWindowLabel(r.unavailableStartTime, r.unavailableEndTime)}
                    </p>
                  )}
                  <p className="truncate text-[11px] text-muted-foreground">{r.reason}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {actions.showApprove && (
                      <Button
                        size="sm"
                        className="h-7 bg-emerald-600 px-2.5 text-xs hover:bg-emerald-700"
                        disabled={busy}
                        onClick={() => decide(r, 'approve')}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2.5 text-xs"
                      disabled={busy}
                      onClick={() => (actions.reject === 'disapprove' ? setDisapproveLeave(r) : decide(r, 'reject'))}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden />
                      {actions.rejectLabel}
                    </Button>
                  </div>
                  {(plan === 'review' || plan === 'approved') && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-foreground">Transition plan</p>
                      <TransitionPlanView
                        tasks={coerceTasks(r.transitionPlanTasks)}
                        submittedAt={r.transitionPlanSubmittedAt}
                        leadStatus={r.transitionPlanLeadStatus}
                        disapprovalReason={r.transitionPlanDisapprovalReason}
                        generalNotes={r.transitionPlan}
                      />
                      {plan === 'review' && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={busy}
                            onClick={() => reviewPlan(r, 'APPROVE')}
                          >
                            Approve plan
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 border-red-200 px-2.5 text-xs text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-500/10"
                            disabled={busy}
                            onClick={() => setDisapprovePlan(r)}
                          >
                            Disapprove plan
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {plan === 'missing' && (
                    <p className="mt-2 text-[11px] text-muted-foreground">No transition plan submitted yet.</p>
                  )}
                  {plan === 'not-needed' && (
                    <p className="mt-2 text-[11px] text-muted-foreground">No transition plan needed for this leave.</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        isOpen={disapproveLeave !== null}
        onClose={() => setDisapproveLeave(null)}
        onConfirm={() => {
          if (disapproveLeave) void decide(disapproveLeave, 'reject')
        }}
        title={`Disapprove ${firstName((disapproveLeave ?? lastLeave.current)?.employee.name ?? '')}'s approved leave?`}
        message="It is cancelled, the days go back to their balance and it comes off the calendar."
        confirmText="Disapprove"
        variant="danger"
      />
      <PlanDisapproveDialog
        open={disapprovePlan !== null}
        employeeName={(disapprovePlan ?? lastPlan.current)?.employee.name ?? ''}
        onCancel={() => setDisapprovePlan(null)}
        onSubmit={async (reason) => {
          const target = disapprovePlan
          if (!target) return
          if (await reviewPlan(target, 'DISAPPROVE', reason)) setDisapprovePlan(null)
        }}
      />
    </section>
  )
}
