'use client'

import { FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { suggestTeamTagCode } from '@/lib/teams/catalog'
import { createTeamTagSchema, firstIssueMessage } from '@/lib/teams/schemas'

const EMPTY = { label: '', code: '', shortLabel: '', isInternal: true }

/**
 * Adds a tag. The code is derived from the name until HR edits it, because the
 * code is permanent and most people should never have to think about it.
 */
export function AddTeamTagForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY)
  const [codeEdited, setCodeEdited] = useState(false)
  const [saving, setSaving] = useState(false)

  const setLabel = (label: string) =>
    setForm((prev) => ({ ...prev, label, code: codeEdited ? prev.code : suggestTeamTagCode(label) }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = createTeamTagSchema.safeParse(form)
    if (!parsed.success) {
      toast.error(firstIssueMessage(parsed.error))
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/admin/team-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        handbookVariantsExtended?: number
      }
      if (!res.ok || data.error) {
        toast.error(data.error || 'Failed to add team tag')
        return
      }
      const extended = data.handbookVariantsExtended ?? 0
      toast.success(
        extended > 0
          ? `${parsed.data.label} added and included in ${extended} handbook "Everyone"/"Internal" variant(s)`
          : `${parsed.data.label} added`
      )
      setForm(EMPTY)
      setCodeEdited(false)
      onCreated()
    } catch {
      toast.error('Failed to add team tag')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <p className="text-sm font-medium text-foreground">Add a team tag</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="team-tag-label" className="mb-1">
            Name
          </Label>
          <Input
            id="team-tag-label"
            value={form.label}
            placeholder="e.g. Bosnia Team"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="team-tag-code" className="mb-1">
            Code (permanent)
          </Label>
          <Input
            id="team-tag-code"
            value={form.code}
            placeholder="BOSNIA"
            onChange={(e) => {
              setCodeEdited(true)
              setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))
            }}
          />
        </div>
        <div>
          <Label htmlFor="team-tag-short" className="mb-1">
            Short name (optional)
          </Label>
          <Input
            id="team-tag-short"
            value={form.shortLabel}
            placeholder="BA"
            onChange={(e) => setForm((prev) => ({ ...prev, shortLabel: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={form.isInternal}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isInternal: checked }))}
          />
          Part of the &quot;Plutus21 Internal Team&quot; group (off for 3E-style teams)
        </label>
        <Button type="submit" disabled={saving}>
          {saving ? 'Adding…' : 'Add tag'}
        </Button>
      </div>
    </form>
  )
}
