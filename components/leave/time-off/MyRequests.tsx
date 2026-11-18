'use client'

import { CalendarDays, Check, Edit3, Eye } from 'lucide-react'
import { SoftState } from '@/components/composed/SoftState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDays } from '@/lib/format-count'
import { formatDateRange } from '@/lib/format-date'
import { approvalTracker, returnDateLabel, splitRequests } from '@/lib/time-off/day-details'
import { canCancelRequest, canEditRequest, requestDays } from '@/lib/time-off/request-rules'
import type { LeaveRequest } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE, STATUS_STYLE } from './leave-style'

export { returnDateKey, returnDateLabel } from '@/lib/time-off/day-details'

interface RowHandlers {
  onView: (r: LeaveRequest) => void
  onEdit: (r: LeaveRequest) => void
  onCancel: (r: LeaveRequest) => void
}

interface MyRequestsProps extends RowHandlers {
  requests: LeaveRequest[]
  /** Starts a new request; shown where there is nothing waiting. */
  onRequestLeave?: () => void
}

/** Sent → Lead → HR, with the steps already done filled in. */
function Tracker({ status }: { status: string }) {
  const steps = approvalTracker(status)
  const summary = steps.map((s) => `${s.label} ${s.done ? 'done' : 'waiting'}`).join(', ')
  return (
    <ol className="mt-2 flex items-center gap-1.5" aria-label={`Approval progress: ${summary}`}>
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1.5">
          {index > 0 && <span className={`h-px w-4 ${step.done ? 'bg-primary' : 'bg-border'}`} aria-hidden />}
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full ${
              step.done ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'
            }`}
            aria-hidden
          >
            {step.done && <Check className="h-2.5 w-2.5" />}
          </span>
          <span className={`text-[11px] ${step.done ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

function RequestRow({ r, tracked, onView, onEdit, onCancel }: RowHandlers & { r: LeaveRequest; tracked: boolean }) {
  const type = LEAVE_TYPE_STYLE[r.leaveType]
  const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
  const Icon = type.icon
  // Every row has the same three buttons; name the request so screen readers can tell them apart.
  const what = `${type.label} leave, ${formatDateRange(r.startDate, r.endDate)}`
  return (
    <li className="p-3">
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${type.bgLight}`}>
          <Icon className={`h-4 w-4 ${type.text}`} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{type.label}</span>
            <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
              {status.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateRange(r.startDate, r.endDate)} · {formatDays(requestDays(r))}
          </p>
          <p className="text-xs text-muted-foreground">Back {returnDateLabel(r)}</p>
          {r.isHalfDay && (
            <p className="text-xs text-muted-foreground">
              {halfDaySessionLabel(r.halfDaySession)} - {halfDayWindowLabel(r.unavailableStartTime, r.unavailableEndTime)}
            </p>
          )}
          {tracked && <Tracker status={r.status} />}
          <div className="mt-2 flex flex-wrap gap-3">
            <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" aria-label={`View details for ${what}`} onClick={() => onView(r)}>
              <Eye className="mr-1 h-3 w-3" aria-hidden />
              View details
            </Button>
            {canEditRequest(r) && (
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-amber-600" aria-label={`Edit ${what}`} onClick={() => onEdit(r)}>
                <Edit3 className="mr-1 h-3 w-3" aria-hidden />
                Edit
              </Button>
            )}
            {canCancelRequest(r) && (
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-red-600" aria-label={`Cancel request for ${what}`} onClick={() => onCancel(r)}>
                Cancel request
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

const GROUP_TITLE = 'border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground'

/** The viewer's own requests: what is waiting for approval first, then the history. */
export function MyRequests({ requests, onView, onEdit, onCancel, onRequestLeave }: MyRequestsProps) {
  const { waiting, history } = splitRequests(requests)
  const handlers = { onView, onEdit, onCancel }
  const requestButton = onRequestLeave ? (
    <Button type="button" variant="outline" size="sm" onClick={onRequestLeave}>
      Request leave
    </Button>
  ) : undefined

  return (
    <section id="my-requests" aria-label="My requests" className="flex flex-1 scroll-mt-24 flex-col">
      {requests.length === 0 ? (
        <SoftState
          icon={CalendarDays}
          title="No requests yet"
          description="Drag across days on the calendar, or use Request leave."
          action={requestButton}
        />
      ) : (
        <>
          <h3 className={GROUP_TITLE}>Waiting for approval</h3>
          {waiting.length === 0 ? (
            <SoftState tone="success" title="Nothing waiting for approval" action={requestButton} className="flex-none py-6" />
          ) : (
            <ul className="divide-y divide-border">
              {waiting.map((r) => (
                <RequestRow key={r.id} r={r} tracked {...handlers} />
              ))}
            </ul>
          )}
          <h3 className={`${GROUP_TITLE} border-t`}>History</h3>
          {history.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">No leave taken this year.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <RequestRow key={r.id} r={r} tracked={false} {...handlers} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
