'use client'

import { CalendarDays, Edit3, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDays } from '@/lib/format-count'
import { formatDate, formatDateRange } from '@/lib/format-date'
import { getNextBusinessDay, leaveDateKey } from '@/lib/leave-utils'
import { canCancelRequest, canEditRequest, requestDays } from '@/lib/time-off/request-rules'
import { toDateKey, type LeaveRequest } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE, STATUS_STYLE } from './leave-style'

/** The expected return day as a YYYY-MM-DD key: same day for a half day, else the next business day. */
export function returnDateKey(r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'isHalfDay'>): string {
  if (r.isHalfDay) return toDateKey(r.startDate)
  const key = toDateKey(r.endDate)
  if (!key) return ''
  return leaveDateKey(getNextBusinessDay(new Date(`${key}T00:00:00Z`)))
}

export function returnDateLabel(r: Pick<LeaveRequest, 'startDate' | 'endDate' | 'isHalfDay'>): string {
  const key = returnDateKey(r)
  return key ? formatDate(key) : ''
}

interface MyRequestsProps {
  requests: LeaveRequest[]
  onView: (r: LeaveRequest) => void
  onEdit: (r: LeaveRequest) => void
  onCancel: (r: LeaveRequest) => void
}

export function MyRequests({ requests, onView, onEdit, onCancel }: MyRequestsProps) {
  return (
    <section id="my-requests" className="scroll-mt-24 rounded-2xl border border-border bg-card">
      <h2 className="border-b border-border p-4 font-display font-semibold text-foreground">My requests</h2>
      {requests.length === 0 ? (
        <div className="p-6 text-center">
          <CalendarDays className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" aria-hidden />
          <p className="text-sm text-muted-foreground">No requests yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drag across days on the calendar, or use Request leave.
          </p>
        </div>
      ) : (
        <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
          {requests.map((r) => {
            const type = LEAVE_TYPE_STYLE[r.leaveType]
            const status = STATUS_STYLE[r.status] ?? STATUS_STYLE.PENDING
            const Icon = type.icon
            return (
              <li key={r.id} className="p-3">
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
                        {halfDaySessionLabel(r.halfDaySession)} -{' '}
                        {halfDayWindowLabel(r.unavailableStartTime, r.unavailableEndTime)}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-3">
                      <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => onView(r)}>
                        <Eye className="mr-1 h-3 w-3" aria-hidden />
                        View details
                      </Button>
                      {canEditRequest(r) && (
                        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-amber-600" onClick={() => onEdit(r)}>
                          <Edit3 className="mr-1 h-3 w-3" aria-hidden />
                          Edit
                        </Button>
                      )}
                      {canCancelRequest(r) && (
                        <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-red-600" onClick={() => onCancel(r)}>
                          Cancel request
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
