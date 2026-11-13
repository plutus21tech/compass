'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES, WORK_MODES } from '@/lib/academy/attributes'

export interface EligibilityValue {
  countries: string[]
  workModes: string[]
  contractTypes: string[]
  employmentStatuses: string[]
}

const COUNTRIES = ['PK', 'MA', 'CO', 'US']

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

interface ChipsProps {
  label: string
  options: readonly string[]
  selected: string[]
  onToggle: (value: string) => void
}

function Chips({ label, options, selected, onToggle }: ChipsProps) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={selected.includes(option) ? 'default' : 'outline'}
            aria-pressed={selected.includes(option)}
            onClick={() => onToggle(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

interface EligibilityEditorProps {
  value: EligibilityValue
  onChange: (next: EligibilityValue) => void
}

export function EligibilityEditor({ value, onChange }: EligibilityEditorProps) {
  const [extra, setExtra] = useState('')
  const [extraError, setExtraError] = useState<string | null>(null)
  const countryOptions = [...COUNTRIES, ...value.countries.filter((c) => !COUNTRIES.includes(c))]

  const addCountry = () => {
    const code = extra.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setExtraError('Use a two-letter ISO country code, for example GB')
      return
    }
    setExtraError(null)
    setExtra('')
    if (!value.countries.includes(code)) onChange({ ...value, countries: [...value.countries, code] })
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">Who sees this card. Leave a group empty to include everyone.</p>
      <Chips label="Countries" options={countryOptions} selected={value.countries} onToggle={(v) => onChange({ ...value, countries: toggle(value.countries, v) })} />
      <div>
        <Label htmlFor="elig-country" className="mb-1">Other country (ISO code)</Label>
        <div className="flex gap-2">
          <Input id="elig-country" maxLength={2} className="w-24 uppercase" value={extra} onChange={(e) => setExtra(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={addCountry}>Add</Button>
        </div>
        {extraError && <p role="alert" className="mt-1 text-sm text-red-600">{extraError}</p>}
      </div>
      <Chips label="Work modes" options={WORK_MODES} selected={value.workModes} onToggle={(v) => onChange({ ...value, workModes: toggle(value.workModes, v) })} />
      <Chips label="Contract types" options={CONTRACT_TYPES} selected={value.contractTypes} onToggle={(v) => onChange({ ...value, contractTypes: toggle(value.contractTypes, v) })} />
      <Chips label="Statuses" options={EMPLOYMENT_STATUSES} selected={value.employmentStatuses} onToggle={(v) => onChange({ ...value, employmentStatuses: toggle(value.employmentStatuses, v) })} />
    </div>
  )
}
