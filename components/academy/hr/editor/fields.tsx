'use client'

import { useId, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Block } from '@/lib/academy/blocks'

const SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm'

/** What every block's form gets. `isSafe` says whether a changed block still lets hires finish the module. */
export interface BlockFormProps<T extends Block['type']> {
  block: Extract<Block, { type: T }>
  onChange: (next: Block) => void
  isSafe: (next: Block) => boolean
  takenKeys: () => string[]
}

interface FieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="text-xs text-muted-foreground">{children}</p>
}

export function TextField({ label, value, onChange, hint }: FieldProps) {
  const id = useId()
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} className="rounded-xl" />
      {hint ? <Hint id={`${id}-hint`}>{hint}</Hint> : null}
    </div>
  )
}

const FORMATTING_HINT = 'Start a line with ### for a heading or - for a list. Put ** on both sides of a word for bold.'

interface AreaProps extends FieldProps {
  /** Text that hires see as formatted copy, so the formatting hint applies. */
  formatted?: boolean
}

export function AreaField({ label, value, onChange, hint, formatted = false }: AreaProps) {
  const id = useId()
  const note = hint ?? (formatted ? FORMATTING_HINT : undefined)
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={note ? `${id}-hint` : undefined} className="min-h-[96px] rounded-xl" />
      {note ? <Hint id={`${id}-hint`}>{note}</Hint> : null}
    </div>
  )
}

interface SelectFieldProps<T extends string> {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}

export function SelectField<T extends string>({ label, value, options, onChange }: SelectFieldProps<T>) {
  const id = useId()
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={SELECT_CLASS}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

/** An optional heading: emptied, the block simply has none. */
export function HeadingField({ value, onChange }: { value: string | undefined; onChange: (value: string | undefined) => void }) {
  return <TextField label="Heading (optional)" value={value ?? ''} onChange={(next) => onChange(next || undefined)} />
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  )
}

interface RemoveRowProps {
  label: string
  onClick: () => void
  /** False when taking this row out would leave hires unable to finish. */
  allowed: boolean
}

export function RemoveRowButton({ label, onClick, allowed }: RemoveRowProps) {
  if (!allowed) return <p className="shrink-0 self-center text-xs text-muted-foreground">Needed to finish</p>
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className="shrink-0 self-end">
      <X aria-hidden="true" className="h-4 w-4" />
    </Button>
  )
}
