'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_TRANSCRIPT_CHARS, VIDEO_LANGUAGES, type VideoLanguage } from '@/lib/academy/video'

export interface ChapterDraft {
  key: string
  label: string
  /** Seconds, or m:ss. */
  start: string
}

export interface VideoDraft {
  youtubeId: string
  /** Seconds, or m:ss. */
  duration: string
  chapters: ChapterDraft[]
  transcripts: Record<VideoLanguage, string>
}

export const EMPTY_VIDEO_DRAFT: VideoDraft = {
  youtubeId: '',
  duration: '',
  chapters: [{ key: '', label: '', start: '0' }],
  transcripts: { en: '', fr: '', es: '' },
}

const LANGUAGE_NAMES: Record<VideoLanguage, string> = { en: 'English', fr: 'French', es: 'Spanish' }

interface VideoConfigFormProps {
  id: string
  title: string
  value: VideoDraft
  onChange: (next: VideoDraft) => void
}

export function VideoConfigForm({ id, title, value, onChange }: VideoConfigFormProps) {
  const setChapter = (index: number, patch: Partial<ChapterDraft>) =>
    onChange({ ...value, chapters: value.chapters.map((c, i) => (i === index ? { ...c, ...patch } : c)) })

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-lg font-medium">{title}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-youtube`} className="mb-1">YouTube video ID</Label>
          <Input
            id={`${id}-youtube`}
            value={value.youtubeId}
            maxLength={11}
            placeholder="dQw4w9WgXcQ"
            onChange={(e) => onChange({ ...value, youtubeId: e.target.value.trim() })}
          />
          <p className="mt-1 text-xs text-muted-foreground">The 11 characters after v= in the video link.</p>
        </div>
        <div>
          <Label htmlFor={`${id}-duration`} className="mb-1">Length</Label>
          <Input
            id={`${id}-duration`}
            value={value.duration}
            placeholder="6:30"
            aria-describedby={`${id}-duration-hint`}
            onChange={(e) => onChange({ ...value, duration: e.target.value })}
          />
          <p id={`${id}-duration-hint`} className="mt-1 text-xs text-muted-foreground">Total length, for example 6:30</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Chapters</legend>
        <p className="text-xs text-muted-foreground">The first chapter starts at 0. Starts go up from there, as seconds or m:ss.</p>
        {value.chapters.map((chapter, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_7rem_auto] sm:items-end">
            <div>
              <Label htmlFor={`${id}-ch-key-${i}`} className="mb-1">Key</Label>
              <Input id={`${id}-ch-key-${i}`} value={chapter.key} placeholder="innovation" onChange={(e) => setChapter(i, { key: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`${id}-ch-label-${i}`} className="mb-1">Label</Label>
              <Input id={`${id}-ch-label-${i}`} value={chapter.label} onChange={(e) => setChapter(i, { label: e.target.value })} />
            </div>
            <div>
              <Label htmlFor={`${id}-ch-start-${i}`} className="mb-1">Starts at</Label>
              <Input id={`${id}-ch-start-${i}`} value={chapter.start} placeholder="0:00" onChange={(e) => setChapter(i, { start: e.target.value })} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove chapter ${i + 1}`}
              disabled={value.chapters.length === 1}
              onClick={() => onChange({ ...value, chapters: value.chapters.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...value, chapters: [...value.chapters, { key: '', label: '', start: '' }] })}
        >
          <Plus className="h-4 w-4" /> Add a chapter
        </Button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium">Transcripts</legend>
        <p className="text-xs text-muted-foreground">Plain text. A language left empty is hidden from new hires.</p>
        {VIDEO_LANGUAGES.map((lang) => (
          <div key={lang}>
            <Label htmlFor={`${id}-tr-${lang}`} className="mb-1">{LANGUAGE_NAMES[lang]}</Label>
            <Textarea
              id={`${id}-tr-${lang}`}
              className="min-h-[120px]"
              maxLength={MAX_TRANSCRIPT_CHARS}
              value={value.transcripts[lang]}
              onChange={(e) => onChange({ ...value, transcripts: { ...value.transcripts, [lang]: e.target.value } })}
            />
          </div>
        ))}
      </fieldset>
    </section>
  )
}
