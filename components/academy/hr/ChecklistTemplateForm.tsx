'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { academyFetch } from '@/app/(hr)/admin/onboarding/academy/_components/academy-api'
import { ErrorNotice } from '@/app/(hr)/admin/onboarding/academy/_components/ErrorNotice'
import {
  OWNER_LABELS,
  OWNER_ROLES,
  newTemplateItemSchema,
  offsetPhrase,
  templateItemInputSchema,
} from '@/lib/academy/checklist-template'

export interface TemplateRow {
  id: string
  key: string
  title: string
  ownerRole: (typeof OWNER_ROLES)[number]
  dueOffsetDays: number
  autoTickEvent: string | null
  orderIndex: number
  isActive: boolean
}

interface ChecklistTemplateFormProps {
  item: TemplateRow | null
  onSaved: () => void
  onCancel: () => void
}

const fieldClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm'

export function ChecklistTemplateForm({ item, onSaved, onCancel }: ChecklistTemplateFormProps) {
  const [title, setTitle] = useState(item?.title ?? '')
  const [ownerRole, setOwnerRole] = useState<TemplateRow['ownerRole']>(item?.ownerRole ?? 'HR')
  const [offset, setOffset] = useState(String(item?.dueOffsetDays ?? 0))
  const [order, setOrder] = useState(String(item?.orderIndex ?? 0))
  const [isActive, setIsActive] = useState(item?.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const days = Number(offset)
  const preview = offset.trim() !== '' && Number.isInteger(days) ? offsetPhrase(days) : null

  const save = async () => {
    const base = { title, ownerRole, dueOffsetDays: Number(offset), isActive }
    const checked = item
      ? templateItemInputSchema.safeParse({ ...base, orderIndex: Number(order) })
      : newTemplateItemSchema.safeParse(base)
    if (!checked.success) {
      setError(checked.error.issues.map((i) => i.message).join(' '))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const url = item ? `/api/admin/onboarding/checklist-template/${item.id}` : '/api/admin/onboarding/checklist-template'
      await academyFetch(url, { method: item ? 'PUT' : 'POST', body: checked.data })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-medium">{item ? 'Edit item' : 'New item'}</h2>
      <ErrorNotice message={error} />
      <div>
        <Label htmlFor="c-title" className="mb-1">Title</Label>
        <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="c-owner" className="mb-1">Owner</Label>
          <select id="c-owner" className={fieldClass} value={ownerRole} onChange={(e) => setOwnerRole(e.target.value as TemplateRow['ownerRole'])}>
            {OWNER_ROLES.map((r) => <option key={r} value={r}>{OWNER_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="c-offset" className="mb-1">Days from joining</Label>
          <Input id="c-offset" type="number" value={offset} onChange={(e) => setOffset(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">
            {preview ? `${preview}. ` : ''}Use a negative number for days before joining, a positive one for days after.
          </p>
        </div>
        {item && (
          <div>
            <Label htmlFor="c-order" className="mb-1">Order</Label>
            <Input id="c-order" type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (new hires get this item)
      </label>
      {item && (
        <p className="text-xs text-muted-foreground">
          {item.autoTickEvent ? 'This item ticks itself when its step is done. ' : ''}Its key ({item.key}) cannot be changed.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save item'}</Button>
      </div>
    </div>
  )
}
