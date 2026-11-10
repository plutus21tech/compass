'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const REASON_MAX = 500

interface Props {
  id: string
  label: string
  saveLabel: string
  busy: boolean
  onCancel: () => void
  onSave: (reason: string) => void
  /** Where focus goes on close when the control that opened the form is gone (say, a finished row). */
  fallbackFocus?: () => HTMLElement | null
}

/**
 * A short required reason. Focus moves into the field when it opens and back to whatever opened it
 * when it closes, so a keyboard user never lands on the page body.
 */
export function ReasonForm({ id, label, saveLabel, busy, onCancel, onSave, fallbackFocus }: Props) {
  const [reason, setReason] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  const fallback = useRef(fallbackFocus)
  fallback.current = fallbackFocus

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    field.current?.focus()
    return () => {
      // Runs after React has updated the row, so a removed opener is seen as gone.
      requestAnimationFrame(() => {
        const target = opener?.isConnected && !opener.hasAttribute('disabled') ? opener : fallback.current?.()
        target?.focus()
      })
    }
  }, [])

  const save = () => {
    const trimmed = reason.trim()
    if (trimmed) onSave(trimmed)
  }

  return (
    <div
      className="mt-2 space-y-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
    >
      <label htmlFor={id} className="block text-xs text-muted-foreground">{label}</label>
      <Textarea ref={field} id={id} value={reason} maxLength={REASON_MAX} rows={2} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy || reason.trim() === ''} onClick={save}>{saveLabel}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}
