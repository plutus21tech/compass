'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface PlanDisapproveFormProps {
  onCancel: () => void
  onSubmit: (reason: string) => Promise<void>
}

/** The dialog body; exported so it can be rendered without the portal. */
export function PlanDisapproveForm({ onCancel, onSubmit }: PlanDisapproveFormProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const trimmed = reason.trim()

  const submit = async () => {
    if (!trimmed || submitting) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor="plan-disapprove-reason" className="text-sm font-medium text-foreground">
          What should change?
        </label>
        <Textarea
          id="plan-disapprove-reason"
          required
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!trimmed || submitting}>
          Send back
        </Button>
      </div>
    </>
  )
}

interface PlanDisapproveDialogProps {
  open: boolean
  employeeName: string
  onCancel: () => void
  onSubmit: (reason: string) => Promise<void>
}

export function PlanDisapproveDialog({ open, employeeName, onCancel, onSubmit }: PlanDisapproveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send the plan back to {employeeName}?</DialogTitle>
          <DialogDescription>They will see your note and can update the plan.</DialogDescription>
        </DialogHeader>
        {open && <PlanDisapproveForm onCancel={onCancel} onSubmit={onSubmit} />}
      </DialogContent>
    </Dialog>
  )
}
