'use client'

import { Input } from '@/components/ui/input'
import type { AcademyLink } from '@/lib/academy/links'
import type { HandbookOption } from './academy-api'

const EXTERNAL = '__url'
const SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm'

interface LinkPickerProps {
  id: string
  value: AcademyLink | null
  handbook: HandbookOption[]
  onChange: (next: AcademyLink | null) => void
}

function selectValue(value: AcademyLink | null): string {
  if (!value) return ''
  return value.kind === 'url' ? EXTERNAL : `h:${value.slug}`
}

/** A handbook page, an external https URL, or nothing (empty means hidden). */
export function LinkPicker({ id, value, handbook, onChange }: LinkPickerProps) {
  const current = selectValue(value)
  const known = current.startsWith('h:') && handbook.some((p) => `h:${p.slug}` === current)
  const change = (next: string) => {
    if (next === '') onChange(null)
    else if (next === EXTERNAL) onChange({ kind: 'url', url: value?.kind === 'url' ? value.url : 'https://' })
    else onChange({ kind: 'handbook', slug: next.slice(2) })
  }
  return (
    <div className="space-y-2">
      <select id={id} className={SELECT_CLASS} value={current} onChange={(e) => change(e.target.value)}>
        <option value="">Hidden (no link)</option>
        <option value="h:">Handbook home</option>
        {current.startsWith('h:') && current !== 'h:' && !known && <option value={current}>{`Handbook: ${current.slice(2)}`}</option>}
        {handbook.map((p) => (
          <option key={p.slug} value={`h:${p.slug}`}>{`Handbook: ${p.title}`}</option>
        ))}
        <option value={EXTERNAL}>External URL</option>
      </select>
      {value?.kind === 'url' && (
        <Input
          aria-label="External URL"
          placeholder="https://"
          value={value.url}
          onChange={(e) => onChange({ kind: 'url', url: e.target.value })}
        />
      )}
    </div>
  )
}
