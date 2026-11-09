'use client'

import { useEffect, useState } from 'react'
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
  videoConfigsSchema,
  type VideoConfig,
  type VideoConfigs,
  type VideoKey,
} from '@/lib/academy/video'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

type Drafts = Record<VideoKey, VideoDraft>

const TITLES: Record<VideoKey, string> = { VIDEO_1: 'Module 1 video', VIDEO_2: 'Module 2 video' }

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
function fromDraft(draft: VideoDraft): { video?: VideoConfig; error?: string } {
  if (isBlank(draft)) return {}
  const durationSeconds = parseDurationInput(draft.duration)
  if (durationSeconds === null) return { error: 'Length: use seconds or a format like 6:30' }
  const chapters = draft.chapters.map((c) => ({ key: c.key.trim(), label: c.label.trim(), start: parseDurationInput(c.start) }))
  if (chapters.some((c) => c.start === null)) return { error: 'Chapters: each start needs seconds or a format like 1:30' }
  const transcripts = Object.fromEntries(VIDEO_LANGUAGES.flatMap((l) => (draft.transcripts[l].trim() ? [[l, draft.transcripts[l]]] : [])))
  const checked = videoConfigSchema.safeParse({ youtubeId: draft.youtubeId, durationSeconds, chapters, transcripts })
  if (!checked.success) {
    return { error: checked.error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ') }
  }
  return { video: checked.data }
}

export default function AcademyVideosPage() {
  const [drafts, setDrafts] = useState<Drafts>({ VIDEO_1: EMPTY_VIDEO_DRAFT, VIDEO_2: EMPTY_VIDEO_DRAFT })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    academyFetch<VideoConfigs>('/api/admin/onboarding/videos')
      .then((videos) => setDrafts({ VIDEO_1: toDraft(videos.VIDEO_1), VIDEO_2: toDraft(videos.VIDEO_2) }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the videos'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    const payload: VideoConfigs = {}
    for (const key of VIDEO_KEYS) {
      const { video, error: problem } = fromDraft(drafts[key])
      if (problem) {
        setError(`${TITLES[key]} - ${problem}`)
        return
      }
      if (video) payload[key] = video
    }
    const checked = videoConfigsSchema.safeParse(payload)
    if (!checked.success) {
      setError(checked.error.issues.map((i) => i.message).join('; '))
      return
    }
    setError(null)
    setSaving(true)
    try {
      await academyFetch('/api/admin/onboarding/videos', { method: 'PUT', body: checked.data })
      toast.success('Videos saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the videos')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading videos..." />

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Videos</h1>
        <p className="mt-1 text-muted-foreground">
          The welcome video for each module. A video is ready once it has an ID, a length and at least one chapter. Saving never changes anyone&apos;s progress.
        </p>
      </div>
      <ErrorNotice message={error} />
      {VIDEO_KEYS.map((key) => (
        <VideoConfigForm key={key} id={key.toLowerCase()} title={TITLES[key]} value={drafts[key]} onChange={(next) => setDrafts({ ...drafts, [key]: next })} />
      ))}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save videos'}
        </Button>
      </div>
    </div>
  )
}
