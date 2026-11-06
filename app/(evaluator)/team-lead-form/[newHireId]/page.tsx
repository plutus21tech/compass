'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft, Save } from 'lucide-react'
import { MyChecklist } from '@/components/academy/hr/MyChecklist'
import { isLeadInputSubmitted } from '@/lib/academy/setup'

interface TeamLeadFormData {
  emailGroups: string
  discordChannels: string
  tools: string
  earlyKpis: string
  availableOnDate: string
  resources: string
  submittedAt: string | null
}

interface TutorialRow { title: string; url: string }
interface ToolRow { name: string; purpose: string; url: string }
interface LeadInputData {
  roleExpectations: string
  day1Goal: string
  week1Goal: string
  month1Goal: string
  month3Goal: string
  tutorials: TutorialRow[]
  teamTools: ToolRow[]
}

const EMPTY_LEAD_INPUT: LeadInputData = {
  roleExpectations: '', day1Goal: '', week1Goal: '', month1Goal: '', month3Goal: '', tutorials: [], teamTools: [],
}

interface NewHireSummary {
  id: string
  name: string
  title: string
  department: string | null
}

export default function TeamLeadFormPage() {
  const params = useParams<{ newHireId: string }>()
  const newHireId = params?.newHireId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newHire, setNewHire] = useState<NewHireSummary | null>(null)
  const [academyEnabled, setAcademyEnabled] = useState(false)
  const [leadInputComplete, setLeadInputComplete] = useState(false)
  const [leadInput, setLeadInput] = useState<LeadInputData>(EMPTY_LEAD_INPUT)
  const [form, setForm] = useState<TeamLeadFormData>({
    emailGroups: '',
    discordChannels: '',
    tools: '',
    earlyKpis: '',
    availableOnDate: '',
    resources: '',
    submittedAt: null,
  })

  const loadData = async () => {
    if (!newHireId) return
    try {
      const res = await fetch(`/api/onboarding/team-lead-form/${newHireId}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load team lead form')
      }
      setNewHire(data.newHire)
      setAcademyEnabled(data.academyEnabled === true)
      setLeadInputComplete(isLeadInputSubmitted(data.form))
      setLeadInput({
        roleExpectations: data.form?.roleExpectations || '',
        day1Goal: data.form?.day1Goal || '',
        week1Goal: data.form?.week1Goal || '',
        month1Goal: data.form?.month1Goal || '',
        month3Goal: data.form?.month3Goal || '',
        tutorials: Array.isArray(data.form?.tutorials) ? data.form.tutorials : [],
        teamTools: Array.isArray(data.form?.teamTools)
          ? data.form.teamTools.map((t: Partial<ToolRow>) => ({ name: t.name ?? '', purpose: t.purpose ?? '', url: t.url ?? '' }))
          : [],
      })
      setForm({
        emailGroups: data.form?.emailGroups || '',
        discordChannels: data.form?.discordChannels || '',
        tools: data.form?.tools || '',
        earlyKpis: data.form?.earlyKpis || '',
        availableOnDate: data.form?.availableOnDate || '',
        resources: data.form?.resources || '',
        submittedAt: data.form?.submittedAt || null,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load team lead form')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [newHireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveForm = async (submit: boolean) => {
    if (!newHireId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/team-lead-form/${newHireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...(academyEnabled ? leadInput : {}),
          submit,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save form')
      }
      toast.success(submit ? 'Form submitted' : 'Draft saved')
      setLeadInputComplete(isLeadInputSubmitted(data.form))
      setForm((prev) => ({
        ...prev,
        submittedAt: submit ? new Date().toISOString() : prev.submittedAt,
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save form')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading team lead form..." />
  }

  // A form submitted before the Academy, or blanked by a later draft, can be submitted again.
  const submitted = !!form.submittedAt && (!academyEnabled || leadInputComplete)

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Team Lead Onboarding Form</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {newHire ? `${newHire.name} · ${newHire.title}` : 'New hire onboarding preparation'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Email Groups</Label>
              <Textarea
                value={form.emailGroups}
                onChange={(e) => setForm({ ...form, emailGroups: e.target.value })}
                placeholder="List email groups for this new hire"
              />
            </div>
            <div>
              <Label className="mb-1">Discord Channels</Label>
              <Textarea
                value={form.discordChannels}
                onChange={(e) => setForm({ ...form, discordChannels: e.target.value })}
                placeholder="List Discord channels to add"
              />
            </div>
            <div>
              <Label className="mb-1">Tools & Access</Label>
              <Textarea
                value={form.tools}
                onChange={(e) => setForm({ ...form, tools: e.target.value })}
                placeholder="Required tools and permissions"
              />
            </div>
            <div>
              <Label className="mb-1">Early KPIs</Label>
              <Textarea
                value={form.earlyKpis}
                onChange={(e) => setForm({ ...form, earlyKpis: e.target.value })}
                placeholder="Expected first-week KPIs"
              />
            </div>
            <div>
              <Label className="mb-1">Availability On Onboarding Date</Label>
              <Input
                value={form.availableOnDate}
                onChange={(e) => setForm({ ...form, availableOnDate: e.target.value })}
                placeholder="e.g. Available 9am-1pm"
              />
            </div>
            <div>
              <Label className="mb-1">Resources</Label>
              <Textarea
                value={form.resources}
                onChange={(e) => setForm({ ...form, resources: e.target.value })}
                placeholder="Guides, docs, and intro resources"
              />
            </div>
          </div>

          {academyEnabled && (
            <LeadInputFields value={leadInput} onChange={setLeadInput} />
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => saveForm(false)} disabled={saving}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button onClick={() => saveForm(true)} disabled={saving || submitted}>
              {submitted ? 'Submitted' : 'Submit Form'}
            </Button>
          </div>

          {academyEnabled && newHireId && <MyChecklist newHireId={newHireId} />}
        </CardContent>
      </Card>
      </motion.div>
    </div>
  )
}

function LeadInputFields({ value, onChange }: { value: LeadInputData; onChange: (next: LeadInputData) => void }) {
  const set = (patch: Partial<LeadInputData>) => onChange({ ...value, ...patch })
  const goal = (key: 'day1Goal' | 'week1Goal' | 'month1Goal' | 'month3Goal', label: string) => (
    <div>
      <Label className="mb-1">{label}</Label>
      <Textarea value={value[key]} maxLength={1000} onChange={(e) => set({ [key]: e.target.value })} />
    </div>
  )
  return (
    <div className="space-y-4 border-t border-border pt-5">
      <h2 className="text-lg font-semibold text-foreground">Role expectations and goals</h2>
      <div>
        <Label className="mb-1">What you expect from this role</Label>
        <Textarea value={value.roleExpectations} maxLength={10000} onChange={(e) => set({ roleExpectations: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {goal('day1Goal', 'Day 1 goal (optional)')}
        {goal('week1Goal', 'Week 1 goal')}
        {goal('month1Goal', 'Month 1 goal')}
        {goal('month3Goal', 'Month 3 goal')}
      </div>

      <div className="space-y-2">
        <Label>Tutorials (https links)</Label>
        {value.tutorials.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder="Title" value={row.title} onChange={(e) => set({ tutorials: value.tutorials.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)) })} />
            <Input placeholder="https://" value={row.url} onChange={(e) => set({ tutorials: value.tutorials.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)) })} />
            <Button type="button" variant="ghost" onClick={() => set({ tutorials: value.tutorials.filter((_, j) => j !== i) })}>Remove</Button>
          </div>
        ))}
        {value.tutorials.length < 30 && (
          <Button type="button" variant="outline" size="sm" onClick={() => set({ tutorials: [...value.tutorials, { title: '', url: '' }] })}>Add tutorial</Button>
        )}
      </div>

      <div className="space-y-2">
        <Label>Team tools</Label>
        {value.teamTools.map((row, i) => (
          <div key={i} className="flex gap-2">
            <Input placeholder="Name" value={row.name} onChange={(e) => set({ teamTools: value.teamTools.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)) })} />
            <Input placeholder="What it is for" value={row.purpose} onChange={(e) => set({ teamTools: value.teamTools.map((r, j) => (j === i ? { ...r, purpose: e.target.value } : r)) })} />
            <Input placeholder="https:// (optional)" value={row.url} onChange={(e) => set({ teamTools: value.teamTools.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)) })} />
            <Button type="button" variant="ghost" onClick={() => set({ teamTools: value.teamTools.filter((_, j) => j !== i) })}>Remove</Button>
          </div>
        ))}
        {value.teamTools.length < 30 && (
          <Button type="button" variant="outline" size="sm" onClick={() => set({ teamTools: [...value.teamTools, { name: '', purpose: '', url: '' }] })}>Add tool</Button>
        )}
      </div>
    </div>
  )
}
