'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Eye, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { academyFetch } from '@/app/(hr)/admin/onboarding/academy/_components/academy-api'
import { ErrorNotice } from '@/app/(hr)/admin/onboarding/academy/_components/ErrorNotice'
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES, OFFICE_LOCATIONS, WORK_MODES } from '@/lib/academy/attributes'
import { COMPANY_WINGS } from '@/lib/academy/blocks'
import { ATTRIBUTE_LABELS, attributeValueLabel } from '@/lib/academy/labels'
import { DEFAULT_PREVIEW_FACTS, type PreviewFacts, type PreviewSource, type PreviewView } from '@/lib/academy/preview'
import { parseProgressState } from '@/lib/academy/progress'
import { cn } from '@/lib/utils'
import { BlockRenderer } from '../BlockRenderer'
import { ACADEMY_THEME_VARS } from '../brand'
import { academySans, academySerif } from '../fonts'
import { ModuleHeader } from '../ModuleHeader'
import type { BlockContext } from '../types'
import type { VideoController } from '../video/useVideoSession'

const WING_LABELS: Record<PreviewFacts['companyWing'], string> = { CAPITAL: 'Capital', PARTNERS: 'Partners' }
const COUNTRY_CODE = /^[A-Z]{2}$/

const nothing = () => {}
/** A preview reports nothing and completes nothing: every call is a no-op. */
const INERT_VIDEO: { controller: VideoController; next: { label: string; href: string } } = {
  controller: { report: async () => null, reportOnHide: nothing, complete: async () => null, moduleDone: false, onCompleted: nothing },
  next: { label: '', href: '#' },
}

interface ChoiceProps<T extends string> {
  id: string
  label: string
  options: readonly T[]
  value: T
  labelFor: (value: T) => string
  onChange: (value: T) => void
}

function Choice<T extends string>({ id, label, options, value, labelFor, onChange }: ChoiceProps<T>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{labelFor(option)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

interface FactsFormProps {
  facts: PreviewFacts
  source: PreviewSource
  country: string
  onFacts: (next: PreviewFacts) => void
  onSource: (next: PreviewSource) => void
  onCountry: (typed: string) => void
}

function FactsForm({ facts, source, country, onFacts, onSource, onCountry }: FactsFormProps) {
  const set = <K extends keyof PreviewFacts>(key: K, value: PreviewFacts[K]) => onFacts({ ...facts, [key]: value })
  const countryInvalid = country !== '' && !COUNTRY_CODE.test(country)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Choice id="preview-source" label="Version" options={['draft', 'live'] as const} value={source} onChange={onSource}
        labelFor={(v) => (v === 'draft' ? 'Saved draft' : 'Live')} />
      <Choice id="preview-location" label={ATTRIBUTE_LABELS.officeLocation} options={OFFICE_LOCATIONS} value={facts.officeLocation}
        labelFor={attributeValueLabel} onChange={(v) => set('officeLocation', v)} />
      {facts.officeLocation === 'REMOTE' ? (
        <div className="space-y-1">
          <Label htmlFor="preview-country" className="text-xs">Country (optional)</Label>
          <Input id="preview-country" className="h-9" maxLength={2} placeholder="e.g. ID" value={country}
            aria-invalid={countryInvalid} aria-describedby="preview-country-hint"
            onChange={(e) => onCountry(e.target.value.toUpperCase())} />
          <p id="preview-country-hint" className="text-xs text-muted-foreground">
            {countryInvalid ? 'Use a two-letter code.' : 'Leave it empty to see a hire with no country yet.'}
          </p>
        </div>
      ) : null}
      <Choice id="preview-mode" label={ATTRIBUTE_LABELS.workMode} options={WORK_MODES} value={facts.workMode}
        labelFor={attributeValueLabel} onChange={(v) => set('workMode', v)} />
      <Choice id="preview-contract" label={ATTRIBUTE_LABELS.contractType} options={CONTRACT_TYPES} value={facts.contractType}
        labelFor={attributeValueLabel} onChange={(v) => set('contractType', v)} />
      <Choice id="preview-status" label={ATTRIBUTE_LABELS.employmentStatus} options={EMPLOYMENT_STATUSES} value={facts.employmentStatus}
        labelFor={attributeValueLabel} onChange={(v) => set('employmentStatus', v)} />
      <Choice id="preview-wing" label="Wing" options={COMPANY_WINGS} value={facts.companyWing}
        labelFor={(v) => WING_LABELS[v]} onChange={(v) => set('companyWing', v)} />
      <div className="flex items-end gap-2 pb-2">
        <Switch id="preview-client" checked={facts.clientAccount} onCheckedChange={(on) => set('clientAccount', on)} />
        <Label htmlFor="preview-client" className="text-xs">Has a client account</Label>
      </div>
    </div>
  )
}

function showingLine(preview: PreviewView, source: PreviewSource): string {
  if (preview.showing === 'draft') return 'Showing your saved draft.'
  if (source === 'draft') return `There's no saved draft, so this is live version ${preview.version}.`
  return `Showing live version ${preview.version}.`
}

/** The real page, inert: a disabled fieldset stops every input, and the context makes every call a no-op. */
function RenderedModule({ preview }: { preview: PreviewView }) {
  const view = preview.module
  const context = useMemo<BlockContext>(
    () => ({ view, state: parseProgressState(null), readOnly: false, preview: true, setCheck: nothing, openLink: nothing, onSaved: nothing, video: INERT_VIDEO }),
    [view],
  )
  return (
    <div style={ACADEMY_THEME_VARS} className={cn(academySans.className, academySerif.variable, 'overflow-hidden rounded-xl border bg-academy-paper text-academy-navy')}>
      <ModuleHeader view={view} />
      <fieldset disabled className="mx-auto w-full max-w-[720px] min-w-0 space-y-7 px-5 py-8 text-[16px]">
        <legend className="sr-only">Preview. Nothing here can be changed.</legend>
        {view.blocks.map((block, index) => <BlockRenderer key={index} block={block} context={context} />)}
      </fieldset>
    </div>
  )
}

interface PreviewAsProps {
  moduleId: string
  /** Unsaved edits aren't in the preview, so it says so. */
  dirty: boolean
}

export function PreviewAs({ moduleId, dirty }: PreviewAsProps) {
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<PreviewSource>('draft')
  const [facts, setFacts] = useState<PreviewFacts>(DEFAULT_PREVIEW_FACTS)
  const [country, setCountry] = useState('')
  const [preview, setPreview] = useState<PreviewView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCountry = (typed: string) => {
    setCountry(typed)
    if (typed === '' || COUNTRY_CODE.test(typed)) setFacts((current) => ({ ...current, remoteCountry: typed || null }))
  }

  // Only the latest answer lands: a slow one for facts HR has already changed is dropped.
  useEffect(() => {
    if (!open) return
    let current = true
    setLoading(true)
    setError(null)
    academyFetch<PreviewView>(`/api/admin/onboarding/content/${moduleId}/preview`, { method: 'POST', body: { source, facts } })
      .then((next) => { if (current) setPreview(next) })
      .catch((e) => { if (current) setError(e instanceof Error ? e.message : 'Could not load the preview') })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [facts, moduleId, open, source])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Eye aria-hidden="true" />
          Preview as
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Preview as</SheetTitle>
          <SheetDescription>
            Pick who to preview as. People and details set for each hire show as labelled samples. Nothing here is saved.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <FactsForm facts={facts} source={source} country={country} onFacts={setFacts} onSource={setSource} onCountry={onCountry} />
          {dirty ? <p className="text-sm text-muted-foreground">You have unsaved changes. Save the draft to see them here.</p> : null}
          <ErrorNotice message={error} />
          {preview?.unknownPlaceholders.length ? (
            <div role="status" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {`These aren't placeholders we recognise, so hires see nothing in their place: `}
                {preview.unknownPlaceholders.map((name) => `{${name}}`).join(', ')}
              </p>
            </div>
          ) : null}
          {preview ? (
            <div aria-busy={loading} className={cn('space-y-2 transition-opacity', loading && 'opacity-60')}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                {showingLine(preview, source)}
              </p>
              <RenderedModule preview={preview} />
            </div>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading the preview</p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
