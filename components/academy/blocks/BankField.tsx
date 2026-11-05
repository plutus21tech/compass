'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { academyRequest } from '../api'
import type { BlockContext } from '../types'
import { FieldError, FieldPanel, SaveButton, SavedNote, TextField, useFieldSave } from './FieldParts'

const BANK_URL = '/api/onboarding/academy/bank'

interface BankStatus { saved: boolean; held: boolean; ibanMasked: string | null }

interface BankFieldProps {
  label: string
  context: BlockContext
}

function savedLine(status: BankStatus | null): string {
  const masked = status?.ibanMasked ? ` IBAN ending ${status.ibanMasked}.` : ''
  const held = status?.held ? ' HR will add them to your payroll profile.' : ''
  return `Your bank details are saved.${masked}${held}`
}

/** The form is uncontrolled, so bank values never reach React state, and it resets after a save. */
export function BankField({ label, context }: BankFieldProps) {
  const { view, readOnly, onSaved } = context
  const { saving, error, run } = useFieldSave()
  const [status, setStatus] = useState<BankStatus | null>(null)
  const [saved, setSaved] = useState(view.bankSaved)
  const [editing, setEditing] = useState(false)

  // The masked IBAN is a nicety: if it can't be read, the line still says the details are saved.
  const loadStatus = useCallback(() => {
    academyRequest<BankStatus>(BANK_URL, 'GET').then(setStatus, () => setStatus(null))
  }, [])

  useEffect(() => {
    if (saved) loadStatus()
  }, [saved, loadStatus])

  if (readOnly) {
    return (
      <FieldPanel title={label}>
        <SavedNote>{saved ? savedLine(status) : 'No bank details saved.'}</SavedNote>
      </FieldPanel>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form))
    const ok = await run(() => academyRequest(BANK_URL, 'PUT', body))
    if (!ok) return
    form.reset()
    setSaved(true)
    setEditing(false)
    loadStatus()
    onSaved()
  }

  if (saved && !editing) {
    return (
      <FieldPanel title={label}>
        <div className="space-y-3">
          <SavedNote>{savedLine(status)}</SavedNote>
          <Button type="button" variant="outline" className="h-11 rounded-xl bg-white px-5" onClick={() => setEditing(true)}>
            Change details
          </Button>
        </div>
      </FieldPanel>
    )
  }

  return (
    <FieldPanel title={label}>
      <form onSubmit={submit} className="space-y-3">
        <TextField id="bank-title" name="accountTitle" label="Account title" />
        <TextField id="bank-name" name="bankName" label="Bank" />
        <TextField id="bank-branch" name="branch" label="Branch" />
        <TextField id="bank-iban" name="iban" label="IBAN" hint="Starts with PK and has 24 characters" />
        <FieldError message={error} />
        <SaveButton saving={saving}>Save bank details</SaveButton>
      </form>
    </FieldPanel>
  )
}
