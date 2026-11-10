'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { pickerTeams, teamLabel } from '@/lib/teams/catalog'
import { useTeamCatalog } from '@/lib/teams/use-team-catalog'

/**
 * HR's add / edit / delete list for leave-calendar holidays. A holiday applies to the
 * teams chosen; selecting either Pakistan team selects both (applied by the API).
 * Saving re-counts approved leave that overlaps it, so the toast says how many
 * balances moved.
 */

interface LeaveHoliday {
  id: string
  date: string
  name: string
  teamTags: string[]
}

type HolidayForm = { id: string | null; date: string; name: string; teamTags: string[] }

const EMPTY_FORM: HolidayForm = { id: null, date: '', name: '', teamTags: [] }

const formatHolidayDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const adjustedSuffix = (count: number) =>
  count > 0 ? ` ${count} leave balance${count === 1 ? '' : 's'} re-counted.` : ''

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export function LeaveHolidaysManager({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [holidays, setHolidays] = useState<LeaveHoliday[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM)
  // HR-managed teams: active ones, plus any archived team the edited holiday still carries.
  const { catalog, loading: loadingTeams, error: teamsError } = useTeamCatalog()
  const teamOptions = pickerTeams(catalog, form.teamTags)

  const loadHolidays = async () => {
    setLoading(true)
    try {
      const data = await readJson(await fetch('/api/leave/holidays'))
      setHolidays(data.holidays || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load holidays')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      setForm(EMPTY_FORM)
      void loadHolidays()
    }
  }, [isOpen])

  const toggleTeam = (tag: string, checked: boolean) =>
    setForm((current) => ({
      ...current,
      teamTags: checked ? [...current.teamTags, tag] : current.teamTags.filter((t) => t !== tag),
    }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.date || !form.name.trim()) {
      toast.error('Enter a date and a name for the holiday')
      return
    }
    if (form.teamTags.length === 0) {
      toast.error('Choose at least one team')
      return
    }

    setSaving(true)
    try {
      const isEdit = Boolean(form.id)
      const data = await readJson(
        await fetch(isEdit ? `/api/leave/holidays/${form.id}` : '/api/leave/holidays', {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: form.date, name: form.name, teamTags: form.teamTags }),
        })
      )
      toast.success(`${isEdit ? 'Holiday updated.' : 'Holiday added.'}${adjustedSuffix(data.adjustedBalances ?? 0)}`)
      setForm(EMPTY_FORM)
      await loadHolidays()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save holiday')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (holiday: LeaveHoliday) => {
    if (!window.confirm(`Delete "${holiday.name}"? Approved leave over that day will count it again.`)) return
    setDeletingId(holiday.id)
    try {
      const data = await readJson(await fetch(`/api/leave/holidays/${holiday.id}`, { method: 'DELETE' }))
      toast.success(`Holiday deleted.${adjustedSuffix(data.adjustedBalances ?? 0)}`)
      if (form.id === holiday.id) setForm(EMPTY_FORM)
      await loadHolidays()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete holiday')
    } finally {
      setDeletingId(null)
    }
  }

  const startEdit = (holiday: LeaveHoliday) =>
    setForm({ id: holiday.id, date: holiday.date.slice(0, 10), name: holiday.name, teamTags: [...holiday.teamTags] })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team Holidays" size="lg">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Holidays show on the leave calendar for the teams chosen, and are not counted as leave days for those teams.
          Choosing either Pakistan team applies to both.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border/70 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-3">
            <div>
              <Label htmlFor="leave-holiday-date" className="mb-2">Date</Label>
              <Input
                id="leave-holiday-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((current) => ({ ...current, date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="leave-holiday-name" className="mb-2">Name</Label>
              <Input
                id="leave-holiday-name"
                maxLength={120}
                placeholder="e.g. Independence Day"
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label className="mb-2">Teams</Label>
            {loadingTeams && <p className="text-sm text-muted-foreground">Loading teams...</p>}
            {teamsError && <p className="text-sm text-red-600">{teamsError}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {teamOptions.map((tag) => (
                <label key={tag} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <Checkbox
                    checked={form.teamTags.includes(tag)}
                    onCheckedChange={(checked) => toggleTeam(tag, checked === true)}
                  />
                  {teamLabel(catalog, tag)}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {form.id && (
              <Button type="button" variant="outline" onClick={() => setForm(EMPTY_FORM)} disabled={saving}>
                Cancel edit
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : form.id ? 'Save changes' : 'Add holiday'}
            </Button>
          </div>
        </form>

        <div className="divide-y divide-border rounded-xl border border-border/70">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading holidays...</p>
          ) : holidays.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No holidays added yet.</p>
          ) : (
            holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{holiday.name}</p>
                  <p className="text-xs text-muted-foreground">{formatHolidayDate(holiday.date)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {holiday.teamTags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{teamLabel(catalog, tag)}</Badge>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(holiday)} aria-label={`Edit ${holiday.name}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(holiday)}
                    disabled={deletingId === holiday.id}
                    aria-label={`Delete ${holiday.name}`}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
