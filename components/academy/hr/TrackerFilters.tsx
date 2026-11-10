'use client'

import { Label } from '@/components/ui/label'
import { HIRE_STATUS_OPTIONS } from '@/lib/academy/tracker-labels'
import type { TrackerFilters as Filters } from '@/lib/academy/tracker'

const SELECT_CLASS =
  'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'

interface Props {
  value: Filters
  locations: readonly string[]
  departments: readonly string[]
  onChange: (next: Filters) => void
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[10rem] flex-1 sm:flex-none">
      <Label htmlFor={id} className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function TrackerFilters({ value, locations, departments, onChange }: Props) {
  const set = (key: keyof Filters, raw: string) => onChange({ ...value, [key]: raw === '' ? undefined : raw })
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field id="filter-location" label="Location">
        <select id="filter-location" className={SELECT_CLASS} value={value.location ?? ''} onChange={(e) => set('location', e.target.value)}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>
      <Field id="filter-department" label="Department">
        <select id="filter-department" className={SELECT_CLASS} value={value.department ?? ''} onChange={(e) => set('department', e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field id="filter-status" label="Status">
        <select id="filter-status" className={SELECT_CLASS} value={value.status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {HIRE_STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </Field>
    </div>
  )
}
