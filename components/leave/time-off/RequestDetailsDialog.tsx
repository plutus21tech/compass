'use client'

import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { TransitionPlanTable } from '@/components/leave/TransitionPlanTable'
import { TransitionPlanView } from '@/components/leave/TransitionPlanView'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatDays } from '@/lib/format-count'
import { formatDate } from '@/lib/format-date'
import { canSubmitTransitionPlan, validateTransitionTasks, type TransitionTask } from '@/lib/leave-transition-plan'
import { saveTransitionPlanDraft, submitTransitionPlan } from '@/lib/time-off/api'
import { canCancelRequest, canEditRequest, planEditable, requestCoverPeople, requestDays } from '@/lib/time-off/request-rules'
import type { DirectoryUser, LeaveRequest } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE, STATUS_STYLE } from './leave-style'
import { returnDateLabel } from './MyRequests'

const coerceTasks = (raw: unknown): TransitionTask[] => {
  try {
    return validateTransitionTasks(raw)
  } catch {
    return []
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm font-medium text-foreground">{children}</div>
    </div>
  )
}

interface BodyProps {
  request: LeaveRequest
  users: DirectoryUser[]
  onClose: () => void
  onEdit: (r: LeaveRequest) => void
  onCancel: (r: LeaveRequest) => void
  onChanged: () => void
}

export function RequestDetailsBody({ request, users, onClose, onEdit, onCancel, onChanged }: BodyProps) {
  const [tasks, setTasks] = useState<TransitionTask[]>(() => coerceTasks(request.transitionPlanTasks))
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const status = STATUS_STYLE[request.status] ?? STATUS_STYLE.PENDING
  const submitted = Boolean(request.transitionPlanSubmittedAt)
  const disapproved = request.transitionPlanLeadStatus === 'DISAPPROVED'
  const cover = requestCoverPeople(request)
  const notifyIds = request.additionalNotifyIds ?? []

  const saveDraft = async () => {
    setSaving(true)
    const res = await saveTransitionPlanDraft(request.id, tasks)
    setSaving(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Transition plan draft saved')
    onChanged()
  }

  const submit = async () => {
    if (!canSubmitTransitionPlan(tasks)) { toast.error('Add at least one task before submitting'); return }
    setSubmitting(true)
    const res = await submitTransitionPlan(request.id, tasks)
    setSubmitting(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Transition plan submitted')
    onClose()
    onChanged()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Leave type">{LEAVE_TYPE_STYLE[request.leaveType].label}</Field>
        <Field label="Status">{status.label}</Field>
        <Field label="First day off">{formatDate(request.startDate)}</Field>
        <Field label="Last day off">{formatDate(request.endDate)}</Field>
        <Field label="Expected return">{returnDateLabel(request)}</Field>
        <Field label="Duration">{formatDays(requestDays(request))}</Field>
      </div>

      {request.isHalfDay && (
        <Field label="Half-day details">
          {halfDaySessionLabel(request.halfDaySession)} -{' '}
          {halfDayWindowLabel(request.unavailableStartTime, request.unavailableEndTime)}
        </Field>
      )}

      <Field label="Reason">{request.reason || 'No reason provided'}</Field>

      <div>
        <p className="text-sm text-muted-foreground">Transition plan</p>
        {planEditable(request) ? (
          <div className="mt-2 space-y-3">
            {disapproved && request.transitionPlanDisapprovalReason?.trim() && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <span className="font-medium">Team Lead asked for changes:</span>{' '}
                {request.transitionPlanDisapprovalReason}
              </div>
            )}
            <TransitionPlanTable tasks={tasks} onChange={setTasks} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving || submitting}>
                {saving ? 'Saving...' : 'Save draft'}
              </Button>
              <Button size="sm" onClick={submit} disabled={submitting || !canSubmitTransitionPlan(tasks)}>
                {submitting ? 'Submitting...' : submitted ? 'Resubmit plan' : 'Submit transition plan'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <TransitionPlanView
              tasks={coerceTasks(request.transitionPlanTasks)}
              submittedAt={request.transitionPlanSubmittedAt}
              leadStatus={request.transitionPlanLeadStatus}
              disapprovalReason={request.transitionPlanDisapprovalReason}
              generalNotes={request.transitionPlan}
            />
          </div>
        )}
      </div>

      <Field label="Cover people">{cover.map((p) => p.name).join(', ') || 'None selected'}</Field>

      {notifyIds.length > 0 && (
        <Field label="Additional notifications">
          {users.filter((u) => notifyIds.includes(u.id)).map((u) => u.name).join(', ') || 'None'}
        </Field>
      )}

      <div className="flex justify-end gap-3 pt-2">
        {canEditRequest(request) && (
          <Button variant="outline" onClick={() => onEdit(request)}>Edit request</Button>
        )}
        {canCancelRequest(request) && (
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-500/10"
            onClick={() => onCancel(request)}
          >
            Cancel request
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

interface DialogProps extends Omit<BodyProps, 'request'> {
  request: LeaveRequest | null
}

export function RequestDetailsDialog({ request, ...rest }: DialogProps) {
  return (
    <Modal isOpen={request !== null} onClose={rest.onClose} title="Leave request details" size="lg">
      {request && <RequestDetailsBody key={request.id} request={request} {...rest} />}
    </Modal>
  )
}
