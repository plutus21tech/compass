'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'
import { useAcademyGate } from '../_components/useAcademyGate'

const GROUPS = [
  { value: 'HR', label: 'HR' },
  { value: 'SECURITY_IT', label: 'Security / IT' },
  { value: 'ACCOUNTS', label: 'Accounts' },
  { value: 'EXECUTION', label: 'Execution' },
] as const

type Group = (typeof GROUPS)[number]['value']

interface ContactRow {
  group: Group
  userId: string
  label: string
  email: string
}

interface ServerContact {
  group: Group
  userId: string | null
  label: string | null
  email: string | null
}

interface UserOption {
  id: string
  name: string
}

const SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm'

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export default function AcademyContactsPage() {
  const enabled = useAcademyGate()
  const [rows, setRows] = useState<ContactRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    Promise.all([
      academyFetch<ServerContact[]>('/api/admin/onboarding/key-contacts'),
      fetch('/api/users').then((res) => (res.ok ? res.json() : { users: [] })) as Promise<{ users: UserOption[] }>,
    ])
      .then(([contacts, userList]) => {
        setRows(contacts.map((c) => ({ group: c.group, userId: c.userId ?? '', label: c.label ?? '', email: c.email ?? '' })))
        setUsers(userList.users ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load key contacts'))
      .finally(() => setLoading(false))
  }, [enabled])

  const patch = (index: number, change: Partial<ContactRow>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))

  const save = async () => {
    const missing = rows.findIndex((r) => !r.userId && !r.label.trim())
    if (missing >= 0) {
      setError(`Row ${missing + 1}: pick a person or enter a label`)
      return
    }
    setError(null)
    setSaving(true)
    try {
      await academyFetch('/api/admin/onboarding/key-contacts', {
        method: 'PUT',
        body: rows.map((r) => ({ group: r.group, userId: r.userId || null, label: r.label.trim() || null, email: r.email.trim() })),
      })
      toast.success('Key contacts saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save key contacts')
    } finally {
      setSaving(false)
    }
  }

  if (!enabled) return null
  if (loading) return <LoadingScreen message="Loading key contacts..." />

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Key contacts</h1>
        <p className="mt-1 text-muted-foreground">Who new hires are told to reach for each kind of help. The order here is the order they see.</p>
      </div>
      <ErrorNotice message={error} />
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-xl border p-3 md:grid-cols-[10rem_1fr_1fr_1fr_auto]">
          <select aria-label="Group" className={SELECT_CLASS} value={row.group} onChange={(e) => patch(index, { group: e.target.value as Group })}>
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          <select aria-label="Person" className={SELECT_CLASS} value={row.userId} onChange={(e) => patch(index, { userId: e.target.value })}>
            <option value="">No Compass user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input aria-label="Label" placeholder="Label (if no user)" value={row.label} onChange={(e) => patch(index, { label: e.target.value })} />
          <Input aria-label="Email" placeholder="Email" value={row.email} onChange={(e) => patch(index, { email: e.target.value })} />
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" aria-label="Move up" onClick={() => setRows(move(rows, index, index - 1))}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="sm" aria-label="Move down" onClick={() => setRows(move(rows, index, index + 1))}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove contact" onClick={() => setRows(rows.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={() => setRows([...rows, { group: 'HR', userId: '', label: '', email: '' }])}>
          <Plus className="h-4 w-4" /> Add contact
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save contacts'}
        </Button>
      </div>
    </div>
  )
}
