'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EMPTY_VIDEO_DRAFT, VideoConfigForm, type VideoDraft } from '@/components/academy/hr/VideoConfigForm'
import {
  VIDEO_KEYS,
  VIDEO_LANGUAGES,
  formatDuration,
  parseDurationInput,
  videoConfigSchema,
  type VideoConfig,
  type VideoKey,
} from '@/lib/academy/video'
import type { VideoSettingsView } from '@/lib/academy/service/videos'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

type Drafts = Record<VideoKey, VideoDraft>

const TITLES: Record<VideoKey, string> = { VIDEO_1: 'Module 1 video', VIDEO_2: 'Module 2 video' }
const UNREADABLE_NOTICE = 'A saved video could not be read. Saving will replace it.'

function toDraft(video: VideoConfig | undefined): VideoDraft {
  if (!video) return EMPTY_VIDEO_DRAFT
  return {
    youtubeId: video.youtubeId,
    duration: formatDuration(video.durationSeconds),
    chapters: video.chapters.map((c) => ({ key: c.key, label: c.label, start: formatDuration(c.start) })),
    transcripts: { en: video.transcripts.en ?? '', fr: video.transcripts.fr ?? '', es: video.transcripts.es ?? '' },
  }
}

function isBlank(draft: VideoDraft): boolean {
  return (
    draft.youtubeId === '' &&
    draft.duration.trim() === '' &&
    draft.chapters.every((c) => !c.key.trim() && !c.label.trim() && (c.start.trim() === '' || c.start.trim() === '0')) &&
    VIDEO_LANGUAGES.every((l) => draft.transcripts[l].trim() === '')
  )
}

/** Turns a draft into the stored shape, or says what to fix. A blank draft means no video. */
function fromDraft(draft: VideoDraft): { video: VideoConfig | null; error?: string } {
  if (isBlank(draft)) return { video: null }
  const durationSeconds = parseDurationInput(draft.duration)
  if (durationSeconds === null) return { video: null, error: 'Length: use seconds or a format like 6:30' }
  const chapters = draft.chapters.map((c) => ({ key: c.key.trim(), label: c.label.trim(), start: parseDurationInput(c.start) }))
  if (chapters.some((c) => c.start === null)) return { video: null, error: 'Chapters: each start needs seconds or a format like 1:30' }
  const transcripts = Object.fromEntries(VIDEO_LANGUAGES.flatMap((l) => (draft.transcripts[l].trim() ? [[l, draft.transcripts[l]]] : [])))
  const checked = videoConfigSchema.safeParse({ youtubeId: draft.youtubeId, durationSeconds, chapters, transcripts })
  if (!checked.success) {
    return { video: null, error: checked.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ') }
  }
  return { video: checked.data }
}

export default function AcademyVideosPage() {
  const [drafts, setDrafts] = useState<Drafts>({ VIDEO_1: EMPTY_VIDEO_DRAFT, VIDEO_2: EMPTY_VIDEO_DRAFT })
  const [unreadable, setUnreadable] = useState<VideoKey[]>([])
  const [savedIds, setSavedIds] = useState<Record<VideoKey, string | null>>({ VIDEO_1: null, VIDEO_2: null })
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<VideoKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    academyFetch<VideoSettingsView>('/api/admin/onboarding/videos')
      .then((view) => {
        setDrafts({ VIDEO_1: toDraft(view.videos.VIDEO_1), VIDEO_2: toDraft(view.videos.VIDEO_2) })
        setSavedIds({ VIDEO_1: view.videos.VIDEO_1?.youtubeId ?? null, VIDEO_2: view.videos.VIDEO_2?.youtubeId ?? null })
        setUnreadable(view.unreadable)
        setUpdatedAt(view.updatedAt)
        setLoaded(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the videos'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const save = async (key: VideoKey) => {
    const { video, error: problem } = fromDraft(drafts[key])
    if (problem) {
      setError(`${TITLES[key]} - ${problem}`)
      return
    }
    setError(null)
    setSaving(key)
    try {
      const view = await academyFetch<VideoSettingsView>('/api/admin/onboarding/videos', {
        method: 'PUT',
        body: { key, video, expectedUpdatedAt: updatedAt },
      })
      // Only the saved video's form is refreshed; the other form keeps whatever is being typed.
      setDrafts((current) => ({ ...current, [key]: toDraft(view.videos[key]) }))
      setSavedIds((current) => ({ ...current, [key]: view.videos[key]?.youtubeId ?? null }))
      setUnreadable((current) => current.filter((k) => k !== key))
      setUpdatedAt(view.updatedAt)
      toast.success(`${TITLES[key]} saved`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the video')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <LoadingScreen message="Loading videos..." />

  if (!loaded) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6 sm:p-8">
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Videos</h1>
        <ErrorNotice message={error ?? 'Could not load the videos'} />
        <Button type="button" onClick={load}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Videos</h1>
        <p className="mt-1 text-muted-foreground">
          The welcome video for each module. A video is ready once it has an ID, a length and at least one chapter. Saving never changes anyone&apos;s progress.
        </p>
      </div>
      <ErrorNotice message={error} />
      {error?.startsWith('Someone else') && <Button type="button" variant="outline" onClick={load}>Reload</Button>}
      {VIDEO_KEYS.map((key) => (
        <div key={key} className="space-y-3">
          {unreadable.includes(key) && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{UNREADABLE_NOTICE}</p>}
          <VideoConfigForm id={key.toLowerCase()} title={TITLES[key]} value={drafts[key]} savedYoutubeId={savedIds[key]} onChange={(next) => setDrafts((c) => ({ ...c, [key]: next }))} />
          <div className="flex justify-end">
            <Button type="button" onClick={() => save(key)} disabled={saving !== null}>
              <Save className="h-4 w-4" /> {saving === key ? 'Saving...' : `Save ${TITLES[key].toLowerCase()}`}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
