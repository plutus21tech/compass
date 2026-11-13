'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import {
  ACADEMY_LINK_KEYS,
  academyConfigInputSchema,
  academyLinkLabel,
  type AcademyConfigView,
  type AcademyLink,
  type AcademyLinkKey,
} from '@/lib/academy/links'
import { academyFetch, loadHandbookOptions, type HandbookOption } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'
import { InvoiceTemplatesEditor, type InvoiceRow } from '../_components/InvoiceTemplatesEditor'
import { LinkPicker } from '../_components/LinkPicker'

type LinkMap = Partial<Record<AcademyLinkKey, AcademyLink>>

function withLink(map: LinkMap, key: AcademyLinkKey, link: AcademyLink | null): LinkMap {
  const { [key]: _removed, ...rest } = map
  return link ? { ...rest, [key]: link } : rest
}

export default function AcademyLinksPage() {
  const [links, setLinks] = useState<LinkMap>({})
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [bankLetter, setBankLetter] = useState('')
  const [blockers, setBlockers] = useState('WED 07:00')
  const [cooldown, setCooldown] = useState('15')
  const [threshold, setThreshold] = useState('3')
  const [handbook, setHandbook] = useState<HandbookOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([academyFetch<AcademyConfigView>('/api/admin/onboarding/academy-config'), loadHandbookOptions()])
      .then(([config, pages]) => {
        setLinks(config.links)
        setInvoices(Object.entries(config.invoiceTemplates).map(([department, url]) => ({ department, url })))
        setBankLetter(config.bankLetterTemplate ?? '')
        setBlockers(config.blockersCallCt)
        setCooldown(String(config.retakeCooldownMinutes))
        setThreshold(String(config.failAlertThreshold))
        setHandbook(pages)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load settings'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    const names = invoices.map((r) => r.department.trim())
    if (names.some((n) => !n) || new Set(names).size !== names.length) {
      setError('Each invoice template needs a unique department name')
      return
    }
    const payload = {
      links,
      invoiceTemplates: Object.fromEntries(invoices.map((r) => [r.department.trim(), r.url.trim()])),
      bankLetterTemplate: bankLetter.trim() === '' ? null : bankLetter,
      blockersCallCt: blockers,
      retakeCooldownMinutes: Number(cooldown),
      failAlertThreshold: Number(threshold),
    }
    const checked = academyConfigInputSchema.safeParse(payload)
    if (!checked.success) {
      setError(checked.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; '))
      return
    }
    setError(null)
    setSaving(true)
    try {
      await academyFetch('/api/admin/onboarding/academy-config', { method: 'PUT', body: checked.data })
      toast.success('Settings saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading settings..." />

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Links &amp; settings</h1>
        <p className="mt-1 text-muted-foreground">Where each Academy link points. A link left empty is hidden from new hires.</p>
      </div>
      <ErrorNotice message={error} />

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Links</h2>
        {ACADEMY_LINK_KEYS.map((key) => (
          <div key={key} className="grid gap-2 md:grid-cols-[14rem_1fr] md:items-start">
            <Label htmlFor={`link-${key}`} className="pt-2">{academyLinkLabel(key)}</Label>
            <LinkPicker id={`link-${key}`} value={links[key] ?? null} handbook={handbook} onChange={(next) => setLinks(withLink(links, key, next))} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Invoice templates</h2>
        <p className="text-sm text-muted-foreground">One https link per department.</p>
        <InvoiceTemplatesEditor rows={invoices} onChange={setInvoices} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Bank letter template</h2>
        <Textarea aria-label="Bank letter template" className="min-h-[160px]" value={bankLetter} onChange={(e) => setBankLetter(e.target.value)} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor="blockers" className="mb-1">Blockers Call (CT)</Label>
          <Input id="blockers" placeholder="WED 07:00" value={blockers} onChange={(e) => setBlockers(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="cooldown" className="mb-1">Quiz retake cooldown (minutes)</Label>
          <Input id="cooldown" type="number" min={0} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="threshold" className="mb-1">Failed attempts before alert</Label>
          <Input id="threshold" type="number" min={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </div>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </div>
    </div>
  )
}
