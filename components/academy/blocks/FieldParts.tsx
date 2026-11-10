'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '../api'

export function FieldPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-academy-line bg-white p-4 sm:p-5">
      <h2 className="mb-3 font-semibold text-academy-navy">{title}</h2>
      {children}
    </section>
  )
}

export function SavedNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[15px] leading-6 text-academy-success">
      <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  )
}

export function FieldError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="text-[15px] leading-6 text-academy-danger">
      {message}
    </p>
  )
}

interface SaveButtonProps {
  saving: boolean
  children: ReactNode
}

export function SaveButton({ saving, children }: SaveButtonProps) {
  return (
    <Button type="submit" disabled={saving} className="h-11 rounded-xl px-5 text-[15px]">
      {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
      {saving ? 'Saving...' : children}
    </Button>
  )
}

interface TextFieldProps {
  id: string
  name: string
  label: string
  hint?: string
  type?: string
  required?: boolean
  defaultValue?: string
}

/** Uncontrolled on purpose: sensitive values stay in the form and leave with its reset. */
export function TextField({ id, name, label, hint, type = 'text', required = true, defaultValue }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[15px] text-academy-navy">
        {label}
        {required ? null : <span className="font-normal text-academy-slate"> (optional)</span>}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        autoComplete="off"
        aria-describedby={hintId}
        className="h-11 rounded-xl bg-white md:text-base"
      />
      {hint ? (
        <p id={hintId} className="text-sm text-academy-slate">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** The saving flag and the server's message for one form. Returns whether the save worked. */
export function useFieldSave(): { saving: boolean; error: string | null; run: (save: () => Promise<void>) => Promise<boolean> } {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (save: () => Promise<void>) => {
    setSaving(true)
    setError(null)
    try {
      await save()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setSaving(false)
    }
  }, [])
  return { saving, error, run }
}
