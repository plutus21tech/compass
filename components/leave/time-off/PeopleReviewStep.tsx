'use client'

import { useMemo, type ReactNode } from 'react'
import { MemberMultiSelect } from '@/components/leave/MemberMultiSelect'
import { LEAVE_TYPE_LABEL, isHalfDayEligible, type RequestForm } from '@/lib/time-off/request-form'
import type { LeaveSummary } from '@/lib/time-off/request-summary'
import type { DirectoryUser } from '@/lib/time-off/types'
import type { StepProps } from './DatesTypeStep'
import type { PanelModeKind } from './HandoverStep'
import { halfDaySessionLabel, halfDayWindowLabel } from './leave-style'
import { RequestSummaryBox } from './RequestSummaryBox'

interface PeopleReviewStepProps extends StepProps {
  users: DirectoryUser[]
  viewerId: string
  summary: LeaveSummary
  mode: PanelModeKind
}

export const MAX_COVER_PEOPLE = 10
export const MAX_NOTIFY_PEOPLE = 20
export const EDIT_RESUBMIT_TEXT = 'Saving sends it back for approval and emails your lead and HR again.'

const SECTION = 'space-y-3 border-b border-border px-5 py-5 last:border-b-0'

function planText(form: RequestForm): string {
  const n = form.tasks.filter((t) => t.taskDetails.trim().length > 0).length
  if (n === 0) return 'No plan yet'
  return n === 1 ? '1 task' : `${n} tasks`
}

function namesFor(ids: string[], users: DirectoryUser[]): string {
  const byId = new Map(users.map((u) => [u.id, u.name]))
  const names = ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n))
  return names.length > 0 ? names.join(', ') : 'No one'
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  )
}

function PeoplePicker(props: {
  id: string
  label: string
  help: string
  max: number
  members: DirectoryUser[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={props.id} className="text-sm font-semibold text-foreground">
          {props.label} <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{props.help}</p>
      </div>
      <MemberMultiSelect
        inputId={props.id}
        members={props.members}
        selectedIds={props.selectedIds}
        onChange={props.onChange}
        max={props.max}
        placeholder="Search by name or department..."
        emptyPoolText="No other team members"
      />
    </div>
  )
}

/** Step 3: cover and notify people, then everything the request will say. */
export function PeopleReviewStep({ form, onChange, users, viewerId, summary, mode }: PeopleReviewStepProps) {
  const pool = useMemo(() => users.filter((u) => u.id !== viewerId), [users, viewerId])
  const halfDay = form.isHalfDay && isHalfDayEligible(form.leaveType)
  const firstNoteLine = form.transitionPlan.split('\n').find((line) => line.trim().length > 0)?.trim()

  return (
    <div>
      <div className={`${SECTION} space-y-5`}>
        <PeoplePicker
          id="leave-cover"
          label="Cover people"
          help="Selected cover teammates will be notified by email."
          max={MAX_COVER_PEOPLE}
          members={pool}
          selectedIds={form.coverPersonIds}
          onChange={(ids) => onChange({ ...form, coverPersonIds: ids })}
        />
        <PeoplePicker
          id="leave-notify"
          label="People to notify"
          help="These people will receive an email notification. Approval still goes to your lead and HR only."
          max={MAX_NOTIFY_PEOPLE}
          members={pool}
          selectedIds={form.additionalNotifyIds}
          onChange={(ids) => onChange({ ...form, additionalNotifyIds: ids })}
        />
      </div>
      <div className={SECTION}>
        <h3 className="text-sm font-semibold text-foreground">Review</h3>
        <RequestSummaryBox summary={summary} />
        <dl className="divide-y divide-border">
          <Row term="Type">{LEAVE_TYPE_LABEL[form.leaveType]}</Row>
          {halfDay && (
            <Row term="Half day">
              {halfDaySessionLabel(form.halfDaySession || null)} · {halfDayWindowLabel(form.unavailableStartTime, form.unavailableEndTime)}
            </Row>
          )}
          <Row term="Reason">{form.reason.trim() || 'No reason yet'}</Row>
          <Row term="Plan">{planText(form)}</Row>
          <Row term="Notes">{firstNoteLine || 'None'}</Row>
          <Row term="Cover">{namesFor(form.coverPersonIds, pool)}</Row>
          <Row term="Notify">{namesFor(form.additionalNotifyIds, pool)}</Row>
        </dl>
        {mode === 'edit' && (
          <p className="rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{EDIT_RESUBMIT_TEXT}</p>
        )}
      </div>
    </div>
  )
}
