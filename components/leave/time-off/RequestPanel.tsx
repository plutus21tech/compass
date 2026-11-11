'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { canSubmitTransitionPlan } from '@/lib/leave-transition-plan'
import { detectBrowserLeaveTimeZone } from '@/lib/leave-timezone'
import { submitLeave, submitTransitionPlan, updateLeave } from '@/lib/time-off/api'
import {
  EMPTY_REQUEST_FORM, formFromRequest, isFormDirty, isHalfDayEligible, stepError, toLeavePayload,
  toLeaveUpdatePayload, withDates, type RequestForm, type RequestStep,
} from '@/lib/time-off/request-form'
import { planRequiredFor } from '@/lib/time-off/request-rules'
import { summarizeLeaveRequest } from '@/lib/time-off/request-summary'
import type { DirectoryUser, LeaveBalance, LeaveRequest } from '@/lib/time-off/types'
import { DatesTypeStep, balanceFor } from './DatesTypeStep'
import { HandoverStep } from './HandoverStep'
import { PeopleReviewStep } from './PeopleReviewStep'

export type PanelMode = { kind: 'create' } | { kind: 'edit'; request: LeaveRequest }

export interface RequestPanelProps {
  open: boolean
  mode: PanelMode
  initialRange: { start: string; end: string } | null
  balance: LeaveBalance | null
  balanceYear: number
  viewerDepartment: string | null
  viewerId: string
  users: DirectoryUser[]
  holidayKeysFor: (startKey: string, endKey: string) => Promise<Set<string>>
  onClose: () => void
  onSaved: () => void
}

const STEPS: ReadonlyArray<{ step: RequestStep; label: string }> = [
  { step: 1, label: '1. Dates and type' },
  { step: 2, label: '2. Handover' },
  { step: 3, label: '3. People and review' },
]

const NEXT_LABEL: Record<1 | 2, string> = { 1: 'Next: Handover', 2: 'Next: People and review' }
const PLAN_NOT_SAVED = 'Leave submitted. The transition plan did not save — add it from My requests.'
const NO_HOLIDAYS: ReadonlySet<string> = new Set()

function openingForm(mode: PanelMode, range: RequestPanelProps['initialRange']): RequestForm {
  if (mode.kind === 'edit') return formFromRequest(mode.request)
  return range ? withDates(EMPTY_REQUEST_FORM, range.start, range.end) : EMPTY_REQUEST_FORM
}

function sameForm(a: RequestForm, b: RequestForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The first step whose checks fail, with its message; null when every step passes. */
function firstFailingStep(form: RequestForm, summary: ReturnType<typeof summarizeLeaveRequest>) {
  for (const { step } of STEPS) {
    const error = stepError(step, form, summary)
    if (error) return { step, error }
  }
  return null
}

function Stepper({ step, onBack }: { step: RequestStep; onBack: (step: RequestStep) => void }) {
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Steps">
      {STEPS.map((s) => {
        const current = s.step === step
        const done = s.step < step
        const bar = current ? 'bg-primary' : done ? 'bg-primary/40' : 'bg-muted'
        const text = current ? 'font-semibold text-foreground' : 'text-muted-foreground'
        const body = (
          <>
            <span className={`block h-0.5 w-full rounded-full ${bar}`} aria-hidden="true" />
            <span className={`mt-2 block text-xs ${text}`}>{s.label}</span>
          </>
        )
        return (
          <li key={s.step} aria-current={current ? 'step' : undefined} className="min-w-0">
            {done ? (
              <button type="button" onClick={() => onBack(s.step)} className="w-full text-left hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The docked (lg+) or full-screen request panel: Dates and type → Handover → People and review. */
export function RequestPanel(props: RequestPanelProps) {
  const { open, mode, initialRange, balance, balanceYear, viewerDepartment, viewerId, users } = props
  const modeKey = mode.kind === 'edit' ? `edit:${mode.request.id}` : 'create'
  const sessionKey = open ? modeKey : null

  const [session, setSession] = useState<string | null>(null)
  const [form, setForm] = useState<RequestForm>(EMPTY_REQUEST_FORM)
  const [baseline, setBaseline] = useState<RequestForm>(EMPTY_REQUEST_FORM)
  const [step, setStep] = useState<RequestStep>(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [holidays, setHolidays] = useState<{ key: string; keys: ReadonlySet<string> } | null>(null)

  // A new opening (or a switch between create and edit) starts from a fresh form.
  if (session !== sessionKey) {
    setSession(sessionKey)
    if (sessionKey) {
      const start = openingForm(mode, initialRange)
      setForm(start)
      setBaseline(start)
      setStep(1)
      setError(null)
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }

  // Dragging a new range while open changes only the dates (ruling 7).
  const rangeKey = initialRange ? `${initialRange.start}|${initialRange.end}` : ''
  const lastRange = useRef(rangeKey)
  useEffect(() => {
    if (rangeKey === lastRange.current) return
    lastRange.current = rangeKey
    if (open && initialRange) setForm((f) => withDates(f, initialRange.start, initialRange.end))
    // keyed on the range value, not its object identity
  }, [rangeKey, open])

  const halfDay = form.isHalfDay && isHalfDayEligible(form.leaveType)
  const endKey = halfDay ? form.startDate : form.endDate
  const left = balanceFor(balance, form.leaveType)
  const summaryInput = {
    startDate: form.startDate, endDate: endKey, isHalfDay: halfDay,
    remaining: left ? left.remaining : null, total: left ? left.total : null, balanceYear,
  }
  const datesKey = `${form.startDate}|${endKey}|${halfDay}`
  const holidayKeys = holidays && holidays.key === datesKey ? holidays.keys : NO_HOLIDAYS
  const summary = useMemo(
    () => summarizeLeaveRequest({ ...summaryInput, holidayKeys }),
    // summaryInput is rebuilt from these values
    [form.startDate, endKey, halfDay, holidayKeys, summaryInput.remaining, summaryInput.total, balanceYear]
  )

  // Holiday keys are fetched only when the picked range changes, never per keystroke.
  const holidayKeysForRef = useRef(props.holidayKeysFor)
  holidayKeysForRef.current = props.holidayKeysFor
  useEffect(() => {
    if (!open) return
    const probe = summarizeLeaveRequest({ ...summaryInput, holidayKeys: NO_HOLIDAYS })
    if (probe.problem && probe.problem !== 'no-working-days') return
    let cancelled = false
    holidayKeysForRef.current(probe.startKey, probe.endKey).then(
      (keys) => { if (!cancelled) setHolidays({ key: datesKey, keys }) },
      () => { if (!cancelled) setHolidays({ key: datesKey, keys: NO_HOLIDAYS }) }
    )
    return () => { cancelled = true }
    // refetch only when the dates change
  }, [open, datesKey])

  const planRequired = useMemo(
    () =>
      summary.startKey !== '' && summary.problem !== 'missing-dates' &&
      planRequiredFor({ leaveType: form.leaveType, isHalfDay: halfDay, startDate: summary.startKey, endDate: summary.endKey }, viewerDepartment),
    [summary.startKey, summary.endKey, summary.problem, form.leaveType, halfDay, viewerDepartment]
  )

  // Move focus into the step that just appeared.
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const firstStepRender = useRef(true)
  useEffect(() => {
    if (!open) { firstStepRender.current = true; return }
    if (firstStepRender.current) { firstStepRender.current = false; titleRef.current?.focus(); return }
    bodyRef.current?.focus()
  }, [open, step, session])

  if (!open) return null

  const isEdit = mode.kind === 'edit'
  const dirty = isEdit ? !sameForm(form, baseline) : isFormDirty(form)

  const change = (next: RequestForm) => { setForm(next); setError(null) }
  const goTo = (next: RequestStep) => { setStep(next); setError(null) }
  const requestClose = () => { if (submitting) return; if (dirty) setConfirmOpen(true); else props.onClose() }

  const next = () => {
    const err = stepError(step, form, summary)
    if (err) { setError(err); return }
    goTo((step + 1) as RequestStep)
  }

  const submit = async () => {
    const failing = firstFailingStep(form, summary)
    if (failing) { setStep(failing.step); setError(failing.error); return }
    setSubmitting(true)
    const tz = detectBrowserLeaveTimeZone()
    try {
      if (mode.kind === 'edit') {
        const res = await updateLeave(toLeaveUpdatePayload(mode.request.id, form, tz))
        if (!res.ok) { toast.error(res.error); return }
        toast.success('Leave request updated')
        props.onSaved()
        return
      }
      const res = await submitLeave(toLeavePayload(form, tz))
      if (!res.ok) { toast.error(res.error); return }
      if (canSubmitTransitionPlan(form.tasks)) {
        const newId = res.data.request?.id
        const plan = newId ? await submitTransitionPlan(newId, form.tasks) : null
        if (!plan || !plan.ok) toast.warning(PLAN_NOT_SAVED)
      }
      toast.success('Leave request submitted!')
      props.onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented || confirmOpen) return
    e.preventDefault()
    requestClose()
  }

  const finalLabel = isEdit ? (submitting ? 'Saving...' : 'Save changes') : submitting ? 'Submitting...' : 'Submit request'
  const title = isEdit ? 'Edit request' : 'Request leave'

  return (
    <section
      aria-labelledby="request-panel-title"
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background lg:sticky lg:inset-auto lg:top-6 lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-sm"
    >
      <header className="space-y-4 border-b border-border px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="request-panel-title" ref={titleRef} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
            {title}
          </h2>
          <Button type="button" variant="outline" size="icon" aria-label="Close" onClick={requestClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Stepper step={step} onBack={goTo} />
      </header>

      <div ref={bodyRef} tabIndex={-1} aria-label={STEPS[step - 1].label} className="min-w-0 flex-1 outline-none">
        {step === 1 && <DatesTypeStep form={form} onChange={change} summary={summary} balance={balance} />}
        {step === 2 && <HandoverStep form={form} onChange={change} planRequired={planRequired} mode={mode.kind} />}
        {step === 3 && (
          <PeopleReviewStep form={form} onChange={change} users={users} viewerId={viewerId} summary={summary} mode={mode.kind} />
        )}
      </div>

      <footer className="sticky bottom-0 space-y-2 border-t border-border bg-background px-5 py-4 lg:bg-card">
        <div className="flex items-center justify-between gap-3">
          {step > 1 ? (
            <Button type="button" variant="outline" onClick={() => goTo((step - 1) as RequestStep)} disabled={submitting}>
              Back
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button type="button" onClick={next}>{NEXT_LABEL[step as 1 | 2]}</Button>
          ) : (
            <Button type="button" onClick={submit} disabled={submitting}>{finalLabel}</Button>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </footer>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={props.onClose}
        title="Discard this request?"
        message={isEdit ? 'Your changes to this request will be lost.' : 'The dates and details you entered will be lost.'}
        confirmText="Discard"
        cancelText="Keep editing"
        variant="danger"
      />
    </section>
  )
}
