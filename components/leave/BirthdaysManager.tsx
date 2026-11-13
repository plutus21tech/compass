'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isValidBirthday } from '@/lib/leave-holidays'

/**
 * HR enters each person's birthday as a month and day -- never a year. Birthdays show
 * on everyone's leave calendar; clearing one removes it.
 */

interface Person {
  id: string
  name: string
  department?: string | null
}

type Draft = { month: string; day: string }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const EMPTY_DRAFT: Draft = { month: '', day: '' }

const selectClassName =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data
}

export function BirthdaysManager({ isOpen, onClose, people }: { isOpen: boolean; onClose: () => void; people: Person[] }) {
  const [saved, setSaved] = useState<Record<string, Draft>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/leave/birthdays')
      .then(readJson)
      .then((data: { birthdays: Array<{ userId: string; month: number; day: number }> }) => {
        const byUser = Object.fromEntries(
          (data.birthdays || []).map((b) => [b.userId, { month: String(b.month), day: String(b.day) }])
        )
        setSaved(byUser)
        setDrafts(byUser)
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load birthdays'))
      .finally(() => setLoading(false))
  }, [isOpen])

  const visiblePeople = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? people.filter((person) => person.name.toLowerCase().includes(q)) : people
  }, [people, query])

  const draftFor = (id: string) => drafts[id] ?? EMPTY_DRAFT
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? EMPTY_DRAFT), ...patch } }))

  const isDirty = (id: string) => {
    const draft = draftFor(id)
    const stored = saved[id] ?? EMPTY_DRAFT
    return draft.month !== stored.month || draft.day !== stored.day
  }

  const handleSave = async (person: Person) => {
    const draft = draftFor(person.id)
    const month = Number(draft.month)
    const day = Number(draft.day)
    if (!isValidBirthday(month, day)) {
      toast.error(`Enter a real day for ${MONTHS[month - 1] ?? 'that month'}`)
      return
    }

    setBusyId(person.id)
    try {
      await readJson(
        await fetch('/api/leave/birthdays', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: person.id, month, day }),
        })
      )
      setSaved((current) => ({ ...current, [person.id]: { month: String(month), day: String(day) } }))
      toast.success(`Birthday saved for ${person.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save birthday')
    } finally {
      setBusyId(null)
    }
  }

  const handleClear = async (person: Person) => {
    setBusyId(person.id)
    try {
      await readJson(await fetch(`/api/leave/birthdays?userId=${encodeURIComponent(person.id)}`, { method: 'DELETE' }))
      setSaved(({ [person.id]: _removed, ...rest }) => rest)
      setDrafts(({ [person.id]: _removed, ...rest }) => rest)
      toast.success(`Birthday cleared for ${person.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clear birthday')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Birthdays" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Birthdays show on everyone&apos;s leave calendar as &quot;Name&apos;s birthday&quot;. Only the month and day are kept.
          A 29 February birthday shows on 28 February in other years.
        </p>
        <Input placeholder="Search people..." value={query} onChange={(e) => setQuery(e.target.value)} />

        <div className="max-h-[50vh] overflow-y-auto divide-y divide-border rounded-xl border border-border/70">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading birthdays...</p>
          ) : visiblePeople.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No people match that search.</p>
          ) : (
            visiblePeople.map((person) => {
              const draft = draftFor(person.id)
              const hasSaved = Boolean(saved[person.id])
              const busy = busyId === person.id
              return (
                <div key={person.id} className="flex flex-wrap items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
                    {person.department && <p className="truncate text-xs text-muted-foreground">{person.department}</p>}
                  </div>
                  <select
                    aria-label={`Birthday month for ${person.name}`}
                    className={selectClassName}
                    value={draft.month}
                    onChange={(e) => setDraft(person.id, { month: e.target.value })}
                  >
                    <option value="">Month</option>
                    {MONTHS.map((label, index) => (
                      <option key={label} value={String(index + 1)}>{label}</option>
                    ))}
                  </select>
                  <Input
                    aria-label={`Birthday day for ${person.name}`}
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Day"
                    className="w-20"
                    value={draft.day}
                    onChange={(e) => setDraft(person.id, { day: e.target.value })}
                  />
                  <Button size="sm" onClick={() => handleSave(person)} disabled={busy || !isDirty(person.id) || !draft.month || !draft.day}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleClear(person)} disabled={busy || !hasSaved}>
                    Clear
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}
