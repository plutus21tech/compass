'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { detectBrowserLeaveTimeZone } from '@/lib/leave-timezone'
import { submitWfh } from '@/lib/time-off/api'

interface FormProps {
  onClose: () => void
  onSubmitted: () => Promise<void>
}

/** The form body; it mounts fresh each time the dialog opens, so fields start empty. */
export function WfhRequestForm({ onClose, onSubmitted }: FormProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [workPlan, setWorkPlan] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await submitWfh({
        startDate,
        endDate,
        requestTimezone: detectBrowserLeaveTimeZone(),
        reason,
        workPlan,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('WFH request submitted')
      onClose()
      await onSubmitted()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-sky-500/20 bg-sky-50/60 p-3 dark:bg-sky-500/10">
        <p className="text-sm text-sky-900 dark:text-sky-200">
          WFH requests are separate from leave. They do not consume your leave balance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="wfh-start-date" className="mb-2">Start Date</Label>
          <Input
            id="wfh-start-date"
            type="date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="wfh-end-date" className="mb-2">End Date</Label>
          <Input
            id="wfh-end-date"
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="wfh-reason" className="mb-2">Reason</Label>
        <Textarea
          id="wfh-reason"
          required
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you requesting WFH for these dates?"
        />
      </div>

      <div>
        <Label htmlFor="wfh-work-plan" className="mb-2">
          Work Plan
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="wfh-work-plan"
          rows={3}
          value={workPlan}
          onChange={(e) => setWorkPlan(e.target.value)}
          placeholder="Outline your expected availability, meetings, or key deliverables."
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit WFH Request'}
        </Button>
      </div>
    </form>
  )
}

interface DialogProps {
  open: boolean
  onClose: () => void
  onSubmitted: () => Promise<void>
}

export function WfhRequestDialog({ open, onClose, onSubmitted }: DialogProps) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Request Work From Home" size="lg">
      <WfhRequestForm onClose={onClose} onSubmitted={onSubmitted} />
    </Modal>
  )
}
