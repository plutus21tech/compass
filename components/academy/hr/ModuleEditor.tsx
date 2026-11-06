'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { academyFetch } from '@/app/(hr)/admin/onboarding/academy/_components/academy-api'
import { ErrorNotice } from '@/app/(hr)/admin/onboarding/academy/_components/ErrorNotice'
import type { Block } from '@/lib/academy/blocks'
import {
  COMPLETION_RULE_LABELS,
  STALE_CONTENT_MESSAGE,
  checklistKeys,
  moduleDetailsSchema,
  publishProblems,
  type ModuleDetails,
} from '@/lib/academy/content-rules'
import type { ContentView } from '@/lib/academy/service/content'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { BlockList } from './editor/BlockList'
import { TextField } from './editor/fields'
import { PlaceholderList } from './editor/PlaceholderList'
import { PublishPanel, type Busy } from './editor/PublishPanel'

const LIST_HREF = '/admin/onboarding/academy/modules'

interface PublishResponse {
  version: number
  reopened?: number
  rereadFailed?: true
}

const snapshot = (details: ModuleDetails, blocks: readonly Block[]) => JSON.stringify({ details, blocks })
const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

function publishedMessage({ version, reopened }: PublishResponse): string {
  if (reopened === undefined) return `Version ${version} is live.`
  return `Version ${version} is live. Reopened for ${reopened} ${reopened === 1 ? 'person' : 'people'}.`
}

const REREAD_FAILED = (version: number) =>
  `Version ${version} is live, but the re-read request didn't go through. Use Assign a module to ask everyone.`

const REFRESH_FAILED = (version: number) => `Version ${version} is live, but this page couldn't refresh. Reload it before you edit again.`

const LEAVE_QUESTION = 'You have unsaved changes. Leave without saving?'

/** A plain click on a link that would take this page somewhere else in Compass. */
function leavingLink(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(link instanceof HTMLAnchorElement) || link.target === '_blank') return false
  return link.origin === window.location.origin && link.pathname !== window.location.pathname
}

interface DetailsFormProps {
  details: ModuleDetails
  onChange: (next: ModuleDetails) => void
}

function DetailsForm({ details, onChange }: DetailsFormProps) {
  return (
    <section aria-labelledby="details-heading" className="space-y-3">
      <h2 id="details-heading" className="text-lg font-medium">Module details</h2>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[16rem] flex-[3]">
          <TextField label="Title" value={details.title} onChange={(title) => onChange({ ...details, title })} />
        </div>
        <div className="min-w-[10rem] flex-1">
          <TextField
            label="Estimated minutes"
            value={details.estimatedMinutes ? String(details.estimatedMinutes) : ''}
            onChange={(value) => {
              if (/^\d*$/.test(value)) onChange({ ...details, estimatedMinutes: Number(value) })
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[14rem] flex-1">
          <TextField label="Headline, first part" value={details.headlineLead} onChange={(headlineLead) => onChange({ ...details, headlineLead })} />
        </div>
        <div className="min-w-[14rem] flex-1">
          <TextField
            label="Headline, part in italics"
            hint="The title and headline change for hires when you publish."
            value={details.headlineAccent}
            onChange={(headlineAccent) => onChange({ ...details, headlineAccent })}
          />
        </div>
      </div>
    </section>
  )
}

function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    // In-app links never unload the page, so they are stopped here, before Next's router sees the click.
    const confirmLeave = (event: MouseEvent) => {
      if (!leavingLink(event) || window.confirm(LEAVE_QUESTION)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('beforeunload', warn)
    document.addEventListener('click', confirmLeave, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', confirmLeave, true)
    }
  }, [active])
}

export function ModuleEditor({ moduleId }: { moduleId: string }) {
  const url = `/api/admin/onboarding/content/${moduleId}`
  const [view, setView] = useState<ContentView | null>(null)
  const [details, setDetails] = useState<ModuleDetails | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [saved, setSaved] = useState('')
  const [updatedAt, setUpdatedAt] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [note, setNote] = useState('')
  const [askReread, setAskReread] = useState(false)
  const [confirmingReread, setConfirmingReread] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  const open = useCallback((next: ContentView) => {
    setView(next)
    setDetails(next.details)
    setBlocks(next.blocks)
    setSaved(snapshot(next.details, next.blocks))
    setUpdatedAt(next.updatedAt)
    setHasDraft(next.hasDraft)
    setConfirmingDiscard(false)
    setConfirmingReread(false)
  }, [])

  const load = useCallback(async () => open(await academyFetch<ContentView>(url)), [open, url])

  // A late answer must never land on top of what someone has started typing.
  useEffect(() => {
    let current = true
    academyFetch<ContentView>(url)
      .then((next) => { if (current) open(next) })
      .catch((e) => { if (current) setError(errorText(e, 'Could not load this module')) })
    return () => { current = false }
  }, [open, url])

  const dirty = details !== null && snapshot(details, blocks) !== saved
  useLeaveWarning(dirty)

  const rule = view?.rule
  const contentProblems = useMemo(() => (rule ? publishProblems(rule, blocks) : []), [rule, blocks])
  const detailsCheck = details ? moduleDetailsSchema.safeParse(details) : null
  const detailsProblem = detailsCheck && !detailsCheck.success ? detailsCheck.error.issues[0].message : null
  const problems = detailsProblem ? [detailsProblem, ...contentProblems] : contentProblems

  if (!view || !details) return error ? <div className="p-6"><ErrorNotice message={error} /></div> : <LoadingScreen />

  // A removal may not add a problem: that is what keeps a required block in the module.
  const isSafe = (next: Block[]) => publishProblems(view.rule, next).length <= contentProblems.length
  const takenKeys = () => checklistKeys(blocks)

  const persist = async (): Promise<string> => {
    if (detailsProblem) throw new Error(detailsProblem)
    const result = await academyFetch<{ updatedAt: string }>(url, {
      method: 'PUT',
      body: { blocks, details, expectedUpdatedAt: updatedAt },
    })
    setUpdatedAt(result.updatedAt)
    setSaved(snapshot(details, blocks))
    setHasDraft(true)
    return result.updatedAt
  }

  const run = async (kind: Exclude<Busy, null>, fallback: string, work: () => Promise<void>) => {
    setError(null)
    setBusy(kind)
    try {
      await work()
    } catch (e) {
      setError(errorText(e, fallback))
    } finally {
      setBusy(null)
    }
  }

  const save = () => run('save', 'Could not save the draft', async () => {
    await persist()
    toast.success('Draft saved.')
  })

  const publish = () => {
    if (!note.trim()) {
      setError('Add a short note about what changed.')
      return
    }
    if (askReread && !confirmingReread) {
      setConfirmingReread(true)
      return
    }
    setConfirmingReread(false)
    void run('publish', 'Could not publish', async () => {
      const expectedUpdatedAt = dirty ? await persist() : updatedAt
      const result = await academyFetch<PublishResponse>(`${url}/publish`, {
        method: 'POST',
        body: { changeNote: note, askReread, expectedUpdatedAt },
      })
      setNote('')
      setAskReread(false)
      if (result.rereadFailed) setError(REREAD_FAILED(result.version))
      else toast.success(publishedMessage(result))
      await load().catch(() => setError(result.rereadFailed ? `${REREAD_FAILED(result.version)} Then reload this page.` : REFRESH_FAILED(result.version)))
    })
  }

  const discard = () => {
    if (!confirmingDiscard) {
      setConfirmingDiscard(true)
      return
    }
    void run('discard', 'Could not discard the draft', async () => {
      if (hasDraft) await academyFetch(url, { method: 'DELETE', body: { expectedUpdatedAt: updatedAt } })
      await load()
      toast.success('Draft discarded.')
    })
  }

  return (
    <div className="mx-auto max-w-6xl p-6 sm:p-8">
      <Link href={LIST_HREF} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        All modules
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold text-foreground">{`Module ${view.number}: ${view.details.title}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{COMPLETION_RULE_LABELS[view.rule]}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {`Live: version ${view.version}, published ${formatAcademyDate(view.publishedAt, null)}.`}
          {view.changeNote ? ` ${view.changeNote}` : ''}
        </p>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <DetailsForm details={details} onChange={(next) => { setDetails(next); setConfirmingDiscard(false) }} />
          <section aria-labelledby="blocks-heading" className="space-y-3">
            <h2 id="blocks-heading" className="text-lg font-medium">Page content</h2>
            <BlockList blocks={blocks} onChange={(next) => { setBlocks(next); setConfirmingDiscard(false) }} isSafe={isSafe} takenKeys={takenKeys} />
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          {error ? (
            <div className="space-y-2">
              <ErrorNotice message={error} />
              {error === STALE_CONTENT_MESSAGE ? (
                <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>Reload</Button>
              ) : null}
            </div>
          ) : null}
          <PublishPanel
            busy={busy}
            dirty={dirty}
            hasDraft={hasDraft}
            problems={problems}
            note={note}
            onNote={setNote}
            askReread={askReread}
            onAskReread={(ask) => { setAskReread(ask); setConfirmingReread(false) }}
            confirmingReread={confirmingReread}
            confirmingDiscard={confirmingDiscard}
            onSave={save}
            onPublish={publish}
            onDiscard={discard}
          />
          <PlaceholderList />
        </aside>
      </div>
    </div>
  )
}
