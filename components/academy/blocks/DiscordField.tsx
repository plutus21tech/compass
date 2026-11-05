'use client'

import type { FormEvent } from 'react'
import { academyRequest } from '../api'
import type { BlockContext } from '../types'
import { FieldError, FieldPanel, SaveButton, SavedNote, TextField, useFieldSave } from './FieldParts'

interface DiscordFieldProps {
  label: string
  context: BlockContext
}

export function DiscordField({ label, context }: DiscordFieldProps) {
  const { view, readOnly, onSaved } = context
  const { saving, error, run } = useFieldSave()
  const saved = view.discordUsername

  if (readOnly) {
    return (
      <FieldPanel title={label}>
        <SavedNote>{saved ?? 'No username saved.'}</SavedNote>
      </FieldPanel>
    )
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const discordUsername = String(new FormData(event.currentTarget).get('discordUsername') ?? '')
    const ok = await run(() => academyRequest('/api/onboarding/academy/discord', 'PUT', { discordUsername }))
    if (ok) onSaved()
  }

  return (
    <FieldPanel title={label}>
      <form onSubmit={submit} className="space-y-3">
        <TextField id="discord-username" name="discordUsername" label="Discord username" defaultValue={saved ?? ''} />
        <FieldError message={error} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SaveButton saving={saving}>Save username</SaveButton>
          {saved ? <SavedNote>Saved as {saved}</SavedNote> : null}
        </div>
      </form>
    </FieldPanel>
  )
}
