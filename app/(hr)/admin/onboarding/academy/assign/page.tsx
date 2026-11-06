'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

const URL = '/api/admin/onboarding/assign'
const SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm'

interface ModuleOption { id: string; number: number; title: string }
interface PersonOption { id: string; name: string; department: string | null }
interface Assignable { modules: ModuleOption[]; people: PersonOption[] }

type Audience = 'PEOPLE' | 'ALL_ACTIVE'

const resultMessage = (assigned: number): string => {
  if (assigned === 0) return 'Nothing new to assign. Anyone still reading it keeps their place.'
  return `Assigned to ${assigned} ${assigned === 1 ? 'person' : 'people'}.`
}

function buttonLabel(audience: Audience, confirming: boolean, peopleCount: number, chosen: number): string {
  if (audience === 'PEOPLE') return `Assign to ${chosen} ${chosen === 1 ? 'person' : 'people'}`
  return confirming ? `Yes, email all ${peopleCount} active people` : 'Assign to all active'
}

export default function AssignModulePage() {
  const [data, setData] = useState<Assignable | null>(null)
  const [moduleId, setModuleId] = useState('')
  const [audience, setAudience] = useState<Audience>('PEOPLE')
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    academyFetch<Assignable>(URL)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the page'))
  }, [])

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data?.people ?? []).filter((p) => !term || p.name.toLowerCase().includes(term))
  }, [data, search])

  if (!data) return error ? <div className="p-6"><ErrorNotice message={error} /></div> : <LoadingScreen />

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen)
    if (on) next.add(id)
    else next.delete(id)
    setChosen(next)
  }

  const pickAudience = (next: Audience) => {
    setAudience(next)
    setConfirming(false)
  }

  const ready = moduleId !== '' && (audience === 'ALL_ACTIVE' || chosen.size > 0)

  const submit = async () => {
    if (audience === 'ALL_ACTIVE' && !confirming) {
      setConfirming(true)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const userIds = audience === 'ALL_ACTIVE' ? 'ALL_ACTIVE' : [...chosen]
      const { assigned } = await academyFetch<{ assigned: number }>(URL, { method: 'POST', body: { moduleId, userIds } })
      toast.success(resultMessage(assigned))
      setChosen(new Set())
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not assign the module')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Assign a module</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each person gets an email and a card on their dashboard. Their access to Compass stays as it is.
        </p>
      </div>

      <ErrorNotice message={error} />

      <div className="space-y-1.5">
        <Label htmlFor="assign-module">Module</Label>
        <select id="assign-module" value={moduleId} onChange={(e) => setModuleId(e.target.value)} className={SELECT_CLASS}>
          <option value="">Pick a module</option>
          {data.modules.map((m) => (
            <option key={m.id} value={m.id}>{`${m.number}. ${m.title}`}</option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who should read it</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="audience" checked={audience === 'PEOPLE'} onChange={() => pickAudience('PEOPLE')} />
          Choose people
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="audience" checked={audience === 'ALL_ACTIVE'} onChange={() => pickAudience('ALL_ACTIVE')} />
          All active
        </label>
      </fieldset>

      {audience === 'PEOPLE' ? (
        <div className="space-y-2">
          <Label htmlFor="assign-search">Find a person</Label>
          <Input id="assign-search" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl" />
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-input">
            {shown.map((person) => (
              <li key={person.id}>
                <label htmlFor={`assign-${person.id}`} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                  <Checkbox
                    id={`assign-${person.id}`}
                    checked={chosen.has(person.id)}
                    onCheckedChange={(checked) => toggle(person.id, checked === true)}
                  />
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{person.name}</span>
                  {person.department ? <span className="text-muted-foreground">{person.department}</span> : null}
                </label>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-3 py-2.5 text-sm text-muted-foreground">No one by that name.</li> : null}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {`This reaches ${data.people.length} people. Anyone who finished the module reads it again, and people still in the course stay where they are.`}
        </p>
      )}

      <Button type="button" onClick={submit} disabled={!ready || saving} className="rounded-xl">
        {saving ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
        {buttonLabel(audience, confirming, data.people.length, chosen.size)}
      </Button>
    </div>
  )
}
