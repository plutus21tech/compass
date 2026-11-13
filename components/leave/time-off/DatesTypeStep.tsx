'use client'

import { useRef, type KeyboardEvent } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatDaysLeft } from '@/lib/format-count'
import {
  LEAVE_TYPE_LABEL, isHalfDayEligible, withDates, withHalfDay, withLeaveType, withSession,
  type RequestForm,
} from '@/lib/time-off/request-form'
import type { LeaveSummary } from '@/lib/time-off/request-summary'
import { LEAVE_TYPES, type HalfDaySession, type LeaveBalance, type LeaveType } from '@/lib/time-off/types'
import { LEAVE_TYPE_STYLE } from './leave-style'
import { RequestSummaryBox } from './RequestSummaryBox'

export interface StepProps {
  form: RequestForm
  onChange: (form: RequestForm) => void
}

interface DatesTypeStepProps extends StepProps {
  summary: LeaveSummary
  balance: LeaveBalance | null
}

export const REASON_HELP = 'Your lead, HR and the people you add in step 3 see this in the request email.'

const SESSION_OPTIONS: ReadonlyArray<{ value: HalfDaySession; label: string }> = [
  { value: 'FIRST_HALF', label: 'First Half' },
  { value: 'SECOND_HALF', label: 'Second Half' },
]

const BALANCE_KEY: Record<LeaveType, 'casual' | 'sick' | 'annual'> = { CASUAL: 'casual', SICK: 'sick', ANNUAL: 'annual' }

export function balanceFor(balance: LeaveBalance | null, type: LeaveType): { remaining: number; total: number } | null {
  if (!balance) return null
  const key = BALANCE_KEY[type]
  return { remaining: balance.remaining[key], total: balance[`${key}Days`] }
}

const SECTION = 'space-y-3 border-b border-border px-5 py-5 last:border-b-0'
const SECTION_TITLE = 'text-sm font-semibold text-foreground'

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function DatesSection({ form, onChange, summary }: StepProps & { summary: LeaveSummary }) {
  const changeStart = (start: string) => {
    const end = form.endDate && form.endDate >= start ? form.endDate : start
    onChange(withDates(form, start, end))
  }
  return (
    <div className={SECTION}>
      <div>
        <h3 className={SECTION_TITLE}>Dates</h3>
        <p className="mt-1 text-xs text-muted-foreground">Drag on the calendar, or type the dates.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <Label htmlFor="leave-start" className="mb-1 block text-xs text-muted-foreground">First day off</Label>
          <Input id="leave-start" type="date" required value={form.startDate} onChange={(e) => changeStart(e.target.value)} />
        </div>
        <div className="min-w-0">
          <Label htmlFor="leave-end" className="mb-1 block text-xs text-muted-foreground">Last day off</Label>
          <Input
            id="leave-end"
            type="date"
            required
            value={form.isHalfDay ? form.startDate : form.endDate}
            min={form.startDate || undefined}
            disabled={form.isHalfDay}
            onChange={(e) => onChange(withDates(form, form.startDate, e.target.value))}
          />
        </div>
      </div>
      <RequestSummaryBox summary={summary} />
    </div>
  )
}

function TypeTiles({ form, onChange, balance }: StepProps & { balance: LeaveBalance | null }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const choose = (type: LeaveType) => onChange(withLeaveType(form, type))
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = (index + step + LEAVE_TYPES.length) % LEAVE_TYPES.length
    choose(LEAVE_TYPES[next])
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Leave type" className="grid grid-cols-3 overflow-hidden rounded-lg border border-border">
      {LEAVE_TYPES.map((type, index) => {
        const checked = form.leaveType === type
        const left = balanceFor(balance, type)
        const empty = left !== null && left.remaining <= 0
        return (
          <button
            key={type}
            ref={(el) => { refs.current[index] = el }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => choose(type)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`min-w-0 border-l border-border px-3 py-2.5 text-left first:border-l-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
              checked ? 'bg-primary/10 ring-1 ring-inset ring-primary' : 'hover:bg-muted/60'
            }`}
          >
            <span className={`block text-sm font-medium ${checked ? 'text-primary' : 'text-foreground'}`}>
              {LEAVE_TYPE_LABEL[type]}
            </span>
            {left && (
              <span className={`block text-xs ${empty ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                {empty ? 'None left' : `${formatNumber(left.remaining)} left`}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function BalanceAfter({ form, summary, balance }: { form: RequestForm; summary: LeaveSummary; balance: LeaveBalance | null }) {
  if (summary.otherYear && summary.problem !== 'missing-dates') {
    return <p className="text-sm text-muted-foreground">Next year&apos;s balance applies</p>
  }
  const left = balanceFor(balance, form.leaveType)
  if (summary.balanceAfter === null || !left || summary.problem) return null
  const after = Math.max(summary.balanceAfter, 0)
  const fraction = left.total > 0 ? Math.min(after / left.total, 1) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-foreground">{LEAVE_TYPE_LABEL[form.leaveType]} after this request</span>
        <span
          className={`font-semibold ${summary.overBalance ? 'text-red-600 dark:text-red-400' : 'text-primary'}`}
        >
          {formatDaysLeft(summary.balanceAfter, left.total)}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={`h-full rounded-full ${LEAVE_TYPE_STYLE[form.leaveType].bar}`} style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  )
}

function HalfDayBlock({ form, onChange }: StepProps) {
  const eligible = isHalfDayEligible(form.leaveType)
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor="leave-half-day" className="mb-1">Half-Day Leave</Label>
          <p id="leave-half-day-help" className="text-xs text-muted-foreground">
            Available for Casual and Sick only. Half-day leave counts as 0.5 day.
          </p>
        </div>
        <Checkbox
          id="leave-half-day"
          aria-describedby="leave-half-day-help"
          checked={form.isHalfDay}
          disabled={!eligible}
          onCheckedChange={(checked) => onChange(withHalfDay(form, checked === true))}
        />
      </div>
      {form.isHalfDay && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="min-w-0">
            <Label htmlFor="leave-session" className="mb-2">Session</Label>
            <Select
              value={form.halfDaySession}
              onValueChange={(value: HalfDaySession) => onChange(withSession(form, value))}
            >
              <SelectTrigger id="leave-session"><SelectValue placeholder="Select session" /></SelectTrigger>
              <SelectContent>
                {SESSION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label htmlFor="leave-unavailable-start" className="mb-2">Unavailable From</Label>
            <Input
              id="leave-unavailable-start"
              type="time"
              required
              value={form.unavailableStartTime}
              onChange={(e) => onChange({ ...form, unavailableStartTime: e.target.value })}
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="leave-unavailable-end" className="mb-2">Unavailable To</Label>
            <Input
              id="leave-unavailable-end"
              type="time"
              required
              value={form.unavailableEndTime}
              onChange={(e) => onChange({ ...form, unavailableEndTime: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Step 1: dates, live summary, leave type, half day and reason. */
export function DatesTypeStep({ form, onChange, summary, balance }: DatesTypeStepProps) {
  return (
    <div>
      <DatesSection form={form} onChange={onChange} summary={summary} />
      <div className={SECTION}>
        <h3 className={SECTION_TITLE}>Leave type</h3>
        <TypeTiles form={form} onChange={onChange} balance={balance} />
        <BalanceAfter form={form} summary={summary} balance={balance} />
        <HalfDayBlock form={form} onChange={onChange} />
      </div>
      <div className={SECTION}>
        <div>
          <Label htmlFor="leave-reason" className={SECTION_TITLE}>Reason</Label>
          <p id="leave-reason-help" className="mt-1 text-xs text-muted-foreground">{REASON_HELP}</p>
        </div>
        <Textarea
          id="leave-reason"
          aria-describedby="leave-reason-help"
          required
          rows={3}
          value={form.reason}
          onChange={(e) => onChange({ ...form, reason: e.target.value })}
          placeholder="Brief description of why you need this leave..."
        />
      </div>
    </div>
  )
}
