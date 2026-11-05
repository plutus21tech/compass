'use client'

import type { FormEvent } from 'react'
import { academyRequest } from '../api'
import type { BlockContext } from '../types'
import { FieldError, FieldPanel, SaveButton, SavedNote, TextField, useFieldSave } from './FieldParts'

interface LinkedinFieldProps {
  label: string
  context: BlockContext
}

export function LinkedinField({ label, context }: LinkedinFieldProps) {
  const { state, readOnly, onSaved } = context
  const { saving, error, run } = useFieldSave()
  const saved = state.linkedinUrl

  if (readOnly) {
    return (
      <FieldPanel title={label}>
        <SavedNote>{saved ?? 'No link saved.'}</SavedNote>
      </FieldPanel>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const linkedinUrl = String(new FormData(event.currentTarget).get('linkedinUrl') ?? '')
    const ok = await run(() => academyRequest('/api/onboarding/academy/linkedin', 'PUT', { linkedinUrl }))
    if (ok) onSaved()
  }

  return (
    <FieldPanel title={label}>
      <form onSubmit={submit} className="space-y-3">
        <TextField
          id="linkedin-url"
          name="linkedinUrl"
          label="LinkedIn profile link"
          hint="Like https://www.linkedin.com/in/your-name"
          defaultValue={saved ?? ''}
        />
        <FieldError message={error} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveButton saving={saving}>Save link</SaveButton>
          {saved ? <SavedNote>Saved</SavedNote> : null}
        </div>
      </form>
    </FieldPanel>
  )
}
