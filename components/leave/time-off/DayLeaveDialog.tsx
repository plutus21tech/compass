'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/format-date'
import type { CalendarEvent } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE, STATUS_STYLE } from './leave-style'

interface DayLeaveDialogProps {
  open: boolean
  dayKey: string | null
  events: CalendarEvent[]
  onClose: () => void
}

export function DayLeaveDialog({ open, dayKey, events, onClose }: DayLeaveDialogProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={dayKey ? `Team on leave · ${formatDate(dayKey)}` : 'Team on leave'}
      size="md"
    >
      <div className="space-y-4">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No leave events for this date.</p>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {events.map((event) => {
              const status = STATUS_STYLE[event.status] ?? STATUS_STYLE.PENDING
              return (
                <div
                  key={`${event.id}-${event.employeeId}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {event.isCurrentUser ? 'You' : event.employeeName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {LEAVE_TYPE_STYLE[event.leaveType].label}
                      {event.department ? ` - ${event.department}` : ''}
                      {event.isHalfDay ? ` - ${halfDaySessionLabel(event.halfDaySession)}` : ''}
                    </p>
                    {event.isHalfDay && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {halfDayWindowLabel(event.unavailableStartTime, event.unavailableEndTime)}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className={`${status.bg} ${status.color} border-0`}>
                    {status.label}
                  </Badge>
                </div>
              )
            })}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
