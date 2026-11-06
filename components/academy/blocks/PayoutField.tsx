'use client'

import { useState, type FormEvent } from 'react'
import { PAYOUT_METHODS, payoutBody, payoutFieldsFor, type PayoutField as PayoutFieldSpec, type PayoutMethod } from '@/lib/academy/view-labels'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { academyRequest } from '../api'
import type { BlockContext } from '../types'
import { FieldError, FieldPanel, SaveButton, SavedNote, TextField, useFieldSave } from './FieldParts'

const PAYOUT_URL = '/api/onboarding/payout'
const SAVED_LINE = 'Your payout details are saved.'

interface PayoutFieldProps {
  label: string
  context: BlockContext
}

function PayoutInput({ field }: { field: PayoutFieldSpec }) {
  const id = `payout-${field.name}`
  if (!field.multiline) {
    return <TextField id={id} name={field.name} label={field.label} hint={field.hint} type={field.type} required={!field.optional} />
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[15px] text-academy-navy">
        {field.label}
      </Label>
      <Textarea id={id} name={field.name} required rows={4} autoComplete="off" className="rounded-xl bg-white md:text-base" />
    </div>
  )
}

function MethodPicker({ method, onChange }: { method: PayoutMethod; onChange: (method: PayoutMethod) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[15px] font-medium text-academy-navy">How would you like to be paid?</legend>
      <RadioGroup
        value={method}
        onValueChange={(value) => onChange(value as PayoutMethod)}
        className="grid-cols-2 sm:grid-cols-4"
      >
        {PAYOUT_METHODS.map((option) => (
          <Label
            key={option.value}
            htmlFor={`payout-method-${option.value}`}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-academy-line px-3 py-2 text-sm text-academy-navy has-[[data-state=checked]]:border-academy-blue has-[[data-state=checked]]:bg-academy-blue-tint"
          >
            <RadioGroupItem id={`payout-method-${option.value}`} value={option.value} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}

/** Saved details are never read back here: the view's saved flag is all this form needs. */
export function PayoutField({ label, context }: PayoutFieldProps) {
  const { view, readOnly, onSaved } = context
  const { saving, error, run } = useFieldSave()
  const [method, setMethod] = useState<PayoutMethod>('WISE')
  const [saved, setSaved] = useState(view.payoutSaved)
  const [editing, setEditing] = useState(false)

  // A finished module is read-only, but saved payout details can still be updated (§5.9): this never re-opens it.
  if (readOnly && !(saved && editing)) {
    return (
      <FieldPanel title={label}>
        <div className="space-y-3">
          <SavedNote>{saved ? SAVED_LINE : 'No payout details saved.'}</SavedNote>
          {saved ? (
            <Button type="button" variant="outline" className="h-11 rounded-xl bg-white px-5" onClick={() => setEditing(true)}>
              Update details
            </Button>
          ) : null}
        </div>
      </FieldPanel>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form)) as Record<string, string>
    const ok = await run(() => academyRequest(PAYOUT_URL, 'PUT', payoutBody(method, values)))
    if (!ok) return
    form.reset()
    setSaved(true)
    setEditing(false)
    onSaved()
  }

  if (saved && !editing) {
    return (
      <FieldPanel title={label}>
        <div className="space-y-3">
          <SavedNote>{SAVED_LINE}</SavedNote>
          <Button type="button" variant="outline" className="h-11 rounded-xl bg-white px-5" onClick={() => setEditing(true)}>
            Change details
          </Button>
        </div>
      </FieldPanel>
    )
  }

  return (
    <FieldPanel title={label}>
      <form onSubmit={submit} className="space-y-4">
        <MethodPicker method={method} onChange={setMethod} />
        {/* The key clears what was typed for one method when the hire picks another. */}
        <div key={method} className="space-y-3">
          {payoutFieldsFor(method).map((field) => (
            <PayoutInput key={field.name} field={field} />
          ))}
        </div>
        <FieldError message={error} />
        <SaveButton saving={saving}>Save payout details</SaveButton>
      </form>
    </FieldPanel>
  )
}
