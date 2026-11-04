'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  OFFICE_LOCATIONS,
  WORK_MODES,
  type PersonAttributes,
} from '@/lib/academy/attributes'
import { ATTRIBUTE_LABELS, attributeValueLabel } from '@/lib/academy/labels'

const NONE = '__none__'

interface Props {
  value: PersonAttributes
  onChange: (next: PersonAttributes) => void
  disabled?: boolean
}

function EnumSelect<T extends string>(props: {
  id: string
  title: string
  options: readonly T[]
  value: T | null
  onChange: (next: T | null) => void
}) {
  return (
    <div>
      <Label htmlFor={props.id} className="mb-1">{props.title}</Label>
      <Select value={props.value ?? NONE} onValueChange={(v) => props.onChange(v === NONE ? null : (v as T))}>
        <SelectTrigger id={props.id}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {props.options.map((option) => (
            <SelectItem key={option} value={option}>{attributeValueLabel(option)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function AttributeFields({ value, onChange, disabled }: Props) {
  const set = <K extends keyof PersonAttributes>(key: K, next: PersonAttributes[K]) => onChange({ ...value, [key]: next })

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-foreground">Onboarding attributes</legend>
      <p className="text-xs text-muted-foreground">These choose which Academy content a person sees. Only HR can change them.</p>
      <p className="text-xs text-muted-foreground">Empty fields are suggested from the team and employment type. Save to keep them.</p>
      <EnumSelect id="attr-office" title={ATTRIBUTE_LABELS.officeLocation} options={OFFICE_LOCATIONS} value={value.officeLocation} onChange={(v) => set('officeLocation', v)} />
      {value.officeLocation === 'REMOTE' && (
        <div>
          <Label htmlFor="attr-country" className="mb-1">Country (two-letter code)</Label>
          <Input
            id="attr-country"
            maxLength={2}
            placeholder="e.g. ID"
            value={value.remoteCountry ?? ''}
            onChange={(e) => set('remoteCountry', e.target.value.toUpperCase() || null)}
          />
        </div>
      )}
      <EnumSelect id="attr-mode" title={ATTRIBUTE_LABELS.workMode} options={WORK_MODES} value={value.workMode} onChange={(v) => set('workMode', v)} />
      <EnumSelect id="attr-contract" title={ATTRIBUTE_LABELS.contractType} options={CONTRACT_TYPES} value={value.contractType} onChange={(v) => set('contractType', v)} />
      <EnumSelect id="attr-status" title={ATTRIBUTE_LABELS.employmentStatus} options={EMPLOYMENT_STATUSES} value={value.employmentStatus} onChange={(v) => set('employmentStatus', v)} />
    </fieldset>
  )
}
