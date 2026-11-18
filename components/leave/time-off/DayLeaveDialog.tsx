'use client'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatDate } from '@/lib/format-date'
import type { CalendarEvent } from '@/lib/time-off/types'
import { DayPeopleList } from './DayPeopleList'

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
          <div className="max-h-[360px] overflow-y-auto pr-1">
            <DayPeopleList events={events} />
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
