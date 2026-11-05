'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Rocket, Save } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AttributeFields } from '../../../../users/_components/AttributeFields'
import type { PersonAttributes } from '@/lib/academy/attributes'

interface UserOption { id: string; name: string }
interface MissingItem { key: string; label: string }

interface SetupResponse {
  setup: {
    preferredName: string | null
    title: string | null
    department: string | null
    companyWing: 'CAPITAL' | 'PARTNERS' | null
    clientAccount: string | null
    attributes: PersonAttributes
    onboardingDate: string | null
    hrCallAt: string | null
    teamCallAt: string | null
    teamLeadId: string | null
    teamMemberIds: string[]
    buddyId: string | null
    coreHoursStart: string | null
    coreHoursEnd: string | null
  }
  readiness: { ready: boolean; missing: MissingItem[] }
  releasedAt: string | null
}

interface FormState {
  preferredName: string
  title: string
  department: string
  companyWing: string
  clientAccount: string
  attributes: PersonAttributes
  onboardingDate: string
  hrCallAt: string
  teamCallAt: string
  teamLeadId: string
  teamMemberIds: string[]
  buddyId: string
  coreHoursStart: string
  coreHoursEnd: string
}

interface Props {
  newHireId: string
  users: UserOption[]
  onSaved?: () => void
}

const NONE = '__none__'
const EMPTY_ATTRIBUTES: PersonAttributes = {
  officeLocation: null, remoteCountry: null, workMode: null, contractType: null, employmentStatus: null,
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : '')

function formatReleasedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toForm(data: SetupResponse['setup']): FormState {
  return {
    preferredName: data.preferredName ?? '',
    title: data.title ?? '',
    department: data.department ?? '',
    companyWing: data.companyWing ?? '',
    clientAccount: data.clientAccount ?? '',
    attributes: data.attributes ?? EMPTY_ATTRIBUTES,
    onboardingDate: data.onboardingDate ? data.onboardingDate.slice(0, 10) : '',
    hrCallAt: toLocalInput(data.hrCallAt),
    teamCallAt: toLocalInput(data.teamCallAt),
    teamLeadId: data.teamLeadId ?? '',
    teamMemberIds: data.teamMemberIds,
    buddyId: data.buddyId ?? '',
    coreHoursStart: data.coreHoursStart ?? '',
    coreHoursEnd: data.coreHoursEnd ?? '',
  }
}

function UserSelect(props: { id: string; label: string; value: string; users: UserOption[]; onChange: (id: string) => void }) {
  return (
    <div>
      <Label htmlFor={props.id} className="mb-1">{props.label}</Label>
      <Select value={props.value || NONE} onValueChange={(v) => props.onChange(v === NONE ? '' : v)}>
        <SelectTrigger id={props.id}><SelectValue placeholder="Select a person" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {props.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function TextField(props: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={props.id} className="mb-1">{props.label}</Label>
      <Input id={props.id} type={props.type} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  )
}

export function OnboardingSetupSection({ newHireId, users, onSaved }: Props) {
  const [form, setForm] = useState<FormState | null>(null)
  const [missing, setMissing] = useState<MissingItem[]>([])
  const [saving, setSaving] = useState(false)
  const [releasedAt, setReleasedAt] = useState<string | null>(null)
  const [releasing, setReleasing] = useState(false)

  const apply = useCallback((data: SetupResponse) => {
    setForm(toForm(data.setup))
    setMissing(data.readiness.missing)
    setReleasedAt(data.releasedAt)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/onboarding/new-hires/${newHireId}/setup`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Failed to load setup')
        if (!cancelled) apply(body.data)
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load setup'))
    return () => { cancelled = true }
  }, [newHireId, apply])

  if (!form) return null
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch })
  const toggleMember = (id: string) =>
    set({ teamMemberIds: form.teamMemberIds.includes(id) ? form.teamMemberIds.filter((m) => m !== id) : [...form.teamMemberIds, id] })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/onboarding/new-hires/${newHireId}/setup`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hrCallAt: toIso(form.hrCallAt), teamCallAt: toIso(form.teamCallAt) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save setup')
      apply(body.data)
      toast.success('Setup saved')
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save setup')
    } finally {
      setSaving(false)
    }
  }

  const release = async () => {
    setReleasing(true)
    try {
      const res = await fetch(`/api/admin/onboarding/new-hires/${newHireId}/release`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to release the course')
      setReleasedAt(body.data.releasedAt)
      toast.success('Course released')
      onSaved?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to release the course')
    } finally {
      setReleasing(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="p-6 sm:p-8 space-y-5">
        <h2 className="text-xl font-semibold text-foreground">Onboarding Academy setup</h2>

        {missing.length > 0 ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" role="status">
            <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> {missing.length} {missing.length === 1 ? 'item' : 'items'} missing
            </p>
            <ul className="mt-1 list-disc pl-6 text-muted-foreground">
              {missing.map((m) => <li key={m.key}>{m.label}</li>)}
            </ul>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Everything needed is in place.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField id="su-pref" label="Preferred name" value={form.preferredName} onChange={(v) => set({ preferredName: v })} />
          <TextField id="su-title" label="Job title" value={form.title} onChange={(v) => set({ title: v })} />
          <TextField id="su-dept" label="Department" value={form.department} onChange={(v) => set({ department: v })} />
          <div>
            <Label htmlFor="su-wing" className="mb-1">Company wing</Label>
            <Select value={form.companyWing || NONE} onValueChange={(v) => set({ companyWing: v === NONE ? '' : v })}>
              <SelectTrigger id="su-wing"><SelectValue placeholder="Select a wing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                <SelectItem value="CAPITAL">Capital</SelectItem>
                <SelectItem value="PARTNERS">Partners</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <TextField id="su-client" label="Client account (optional)" value={form.clientAccount} onChange={(v) => set({ clientAccount: v })} />
          <TextField id="su-join" label="Joining date" type="date" value={form.onboardingDate} onChange={(v) => set({ onboardingDate: v })} />
          <TextField id="su-hr" label="HR call" type="datetime-local" value={form.hrCallAt} onChange={(v) => set({ hrCallAt: v })} />
          <TextField id="su-team" label="Team call" type="datetime-local" value={form.teamCallAt} onChange={(v) => set({ teamCallAt: v })} />
          <TextField id="su-cs" label="Core hours start" type="time" value={form.coreHoursStart} onChange={(v) => set({ coreHoursStart: v })} />
          <TextField id="su-ce" label="Core hours end" type="time" value={form.coreHoursEnd} onChange={(v) => set({ coreHoursEnd: v })} />
          <UserSelect id="su-lead" label="Team lead" value={form.teamLeadId} users={users} onChange={(id) => set({ teamLeadId: id })} />
          <UserSelect id="su-buddy" label="Onboarding buddy" value={form.buddyId} users={users} onChange={(id) => set({ buddyId: id })} />
        </div>

        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">Team members</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.teamMemberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                {u.name}
              </label>
            ))}
          </div>
        </fieldset>

        <AttributeFields value={form.attributes} onChange={(attributes) => set({ attributes })} />

        <div className="flex items-center justify-between gap-3">
          {releasedAt ? (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Released {formatReleasedDate(releasedAt)}
            </p>
          ) : (
            <Button variant="outline" onClick={release} disabled={releasing || missing.length > 0}>
              <Rocket className="w-4 h-4" /> {releasing ? 'Releasing...' : 'Release course'}
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save setup'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
