'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ChecklistTemplateForm, type TemplateRow } from '@/components/academy/hr/ChecklistTemplateForm'
import { OWNER_LABELS, offsetPhrase } from '@/lib/academy/checklist-template'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

const API = '/api/admin/onboarding/checklist-template'

export default function AcademyChecklistPage() {
  const [items, setItems] = useState<TemplateRow[] | null>(null)
  const [editing, setEditing] = useState<TemplateRow | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await academyFetch<TemplateRow[]>(API))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the checklist')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!items) return error ? <div className="p-8"><ErrorNotice message={error} /></div> : <LoadingScreen message="Loading checklist..." />

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Checklist template</h1>
        <p className="mt-1 text-muted-foreground">The steps every new hire&apos;s onboarding checklist starts with.</p>
      </div>
      <p role="note" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        Changes apply to hires set up after this. People already in progress keep their list. To stop an item reaching new hires, switch it off rather than deleting it.
      </p>
      <ErrorNotice message={error} />
      {editing ? (
        <ChecklistTemplateForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast.success('Item saved')
            void load()
          }}
        />
      ) : (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> New item
        </Button>
      )}
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="font-medium">
                {item.title} {!item.isActive && <Badge variant="outline">Off</Badge>}
                {item.autoTickEvent && <Badge variant="secondary">Ticks itself</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {OWNER_LABELS[item.ownerRole]}. {offsetPhrase(item.dueOffsetDays)}.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(item)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
