'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { libraryCardSchema, type AcademyLink } from '@/lib/academy/links'
import { academyFetch, type HandbookOption } from './academy-api'
import { EligibilityEditor, type EligibilityValue } from './EligibilityEditor'
import { ErrorNotice } from './ErrorNotice'
import { LinkPicker } from './LinkPicker'

export interface CardLink {
  label: string
  link: AcademyLink
}

export interface LibraryCardRow extends EligibilityValue {
  id: string
  kind: 'BENEFIT' | 'REIMBURSEMENT'
  title: string
  icon: string
  body: string
  links: CardLink[]
  isActive: boolean
}

interface LibraryCardFormProps {
  kind: 'BENEFIT' | 'REIMBURSEMENT'
  card: LibraryCardRow | null
  handbook: HandbookOption[]
  onSaved: () => void
  onCancel: () => void
}

const MAX_LINKS = 5

export function LibraryCardForm({ kind, card, handbook, onSaved, onCancel }: LibraryCardFormProps) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [icon, setIcon] = useState(card?.icon ?? 'Gift')
  const [body, setBody] = useState(card?.body ?? '')
  const [links, setLinks] = useState<CardLink[]>(card?.links ?? [])
  const [rules, setRules] = useState<EligibilityValue>({
    countries: card?.countries ?? [],
    workModes: card?.workModes ?? [],
    contractTypes: card?.contractTypes ?? [],
    employmentStatuses: card?.employmentStatuses ?? [],
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setLink = (index: number, patch: Partial<CardLink>) =>
    setLinks(links.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const save = async () => {
    const checked = libraryCardSchema.safeParse({ kind, title, icon, body, links, ...rules })
    if (!checked.success) {
      setError(checked.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; '))
      return
    }
    setError(null)
    setSaving(true)
    try {
      await academyFetch(card ? `/api/admin/onboarding/library/${card.id}` : '/api/admin/onboarding/library', {
        method: card ? 'PUT' : 'POST',
        body: checked.data,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the card')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-medium">{card ? 'Edit card' : 'New card'}</h2>
      <ErrorNotice message={error} />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label htmlFor="card-title" className="mb-1">Title</Label>
          <Input id="card-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="card-icon" className="mb-1">Icon (Lucide name)</Label>
          <Input id="card-icon" value={icon} onChange={(e) => setIcon(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="card-body" className="mb-1">Description</Label>
        <Textarea id="card-body" className="min-h-[140px]" value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Links (up to {MAX_LINKS})</Label>
        {links.map((item, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <Input aria-label="Link label" placeholder="Label" value={item.label} onChange={(e) => setLink(index, { label: e.target.value })} />
            <LinkPicker id={`card-link-${index}`} value={item.link} handbook={handbook} onChange={(next) => next && setLink(index, { link: next })} />
            <Button type="button" variant="ghost" size="sm" aria-label="Remove link" onClick={() => setLinks(links.filter((_, i) => i !== index))}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinks([...links, { label: '', link: { kind: 'handbook', slug: '' } }])}>
            <Plus className="h-4 w-4" /> Add link
          </Button>
        )}
      </div>
      <EligibilityEditor value={rules} onChange={setRules} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save card'}</Button>
      </div>
    </div>
  )
}
