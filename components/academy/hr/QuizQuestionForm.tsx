'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { academyFetch } from '@/app/(hr)/admin/onboarding/academy/_components/academy-api'
import { ErrorNotice } from '@/app/(hr)/admin/onboarding/academy/_components/ErrorNotice'
import { VALUE_COLOURS } from '@/components/academy/brand'
import { questionInputSchema } from '@/lib/academy/quiz'

export interface QuizQuestionRow {
  id: string
  questionText: string
  optionsJson: unknown
  correctAnswer: string
  explanation: string | null
  valueKey: string | null
  videoChapterKey: string | null
  orderIndex: number
  isActive: boolean
  retiredAt: string | null
}

export const optionsOf = (row: Pick<QuizQuestionRow, 'optionsJson'>): string[] =>
  Array.isArray(row.optionsJson) ? row.optionsJson.filter((o): o is string => typeof o === 'string') : []

interface QuizQuestionFormProps {
  question: QuizQuestionRow | null
  onSaved: () => void
  onCancel: () => void
}

const NO_VALUE = '__none__'
const VALUE_NAMES = Object.keys(VALUE_COLOURS)
const fieldClass = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm'

export function QuizQuestionForm({ question, onSaved, onCancel }: QuizQuestionFormProps) {
  const [text, setText] = useState(question?.questionText ?? '')
  const [optionsText, setOptionsText] = useState(question ? optionsOf(question).join('\n') : '')
  const [correct, setCorrect] = useState(question?.correctAnswer ?? '')
  const [explanation, setExplanation] = useState(question?.explanation ?? '')
  const [valueKey, setValueKey] = useState(question?.valueKey ?? NO_VALUE)
  const [chapter, setChapter] = useState(question?.videoChapterKey ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const options = optionsText.split('\n').map((o) => o.trim()).filter(Boolean)

  const save = async () => {
    const payload = {
      questionText: text,
      options,
      correctAnswer: correct.trim(),
      explanation,
      valueKey: valueKey === NO_VALUE ? null : valueKey,
      videoChapterKey: chapter.trim() === '' ? null : chapter.trim(),
    }
    const checked = questionInputSchema.safeParse(payload)
    if (!checked.success) {
      setError(checked.error.issues.map((i) => i.message).join(' '))
      return
    }
    setError(null)
    setSaving(true)
    try {
      const url = question ? `/api/admin/onboarding/quiz-questions/${question.id}` : '/api/admin/onboarding/quiz-questions'
      await academyFetch(url, { method: question ? 'PUT' : 'POST', body: checked.data })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the question')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-medium">{question ? 'Edit question' : 'New question'}</h2>
      {question && (
        <p className="text-sm text-muted-foreground">
          Changes apply to new attempts. Past attempts keep the answer that was right at the time.
        </p>
      )}
      <ErrorNotice message={error} />
      <div>
        <Label htmlFor="q-text" className="mb-1">Question</Label>
        <Input id="q-text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="q-options" className="mb-1">Options (one per line, 2 to 6)</Label>
        <Textarea id="q-options" className="min-h-[120px]" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="q-correct" className="mb-1">Correct answer</Label>
        <select id="q-correct" className={fieldClass} value={correct} onChange={(e) => setCorrect(e.target.value)}>
          <option value="">Pick one of the options</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="q-explanation" className="mb-1">Explanation (shown in the review)</Label>
        <Textarea id="q-explanation" className="min-h-[90px]" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="q-value" className="mb-1">Company value (optional)</Label>
          <select id="q-value" className={fieldClass} value={valueKey} onChange={(e) => setValueKey(e.target.value)}>
            <option value={NO_VALUE}>None</option>
            {VALUE_NAMES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="q-chapter" className="mb-1">Video chapter (optional)</Label>
          <Input id="q-chapter" value={chapter} onChange={(e) => setChapter(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save question'}</Button>
      </div>
    </div>
  )
}
