'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, RotateCcw, Archive } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { QuizQuestionForm, optionsOf, type QuizQuestionRow } from '@/components/academy/hr/QuizQuestionForm'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

interface QuestionList {
  questions: QuizQuestionRow[]
  usableCount: number
  minimum: number
}

const API = '/api/admin/onboarding/quiz-questions'
const WARN_MARGIN = 2

export default function AcademyQuizPage() {
  const [list, setList] = useState<QuestionList | null>(null)
  const [editing, setEditing] = useState<QuizQuestionRow | 'new' | null>(null)
  const [showRetired, setShowRetired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await academyFetch<QuestionList>(API))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the questions')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const change = async (question: QuizQuestionRow, method: 'DELETE' | 'PUT', done: string) => {
    setError(null)
    try {
      await academyFetch(`${API}/${question.id}`, { method, body: method === 'PUT' ? { isActive: true } : {} })
      toast.success(done)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the question')
    }
  }

  if (!list) return error ? <div className="p-8"><ErrorNotice message={error} /></div> : <LoadingScreen message="Loading quiz questions..." />

  const visible = list.questions.filter((q) => showRetired || q.retiredAt === null)
  const near = list.usableCount <= list.minimum + WARN_MARGIN
  const retiredCount = list.questions.filter((q) => q.retiredAt !== null).length

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Culture quiz</h1>
        <p className="mt-1 text-muted-foreground">
          The question bank for the culture quiz. Each hire gets every usable question, in a shuffled order.
        </p>
      </div>

      <div
        role="status"
        className={`rounded-lg border px-4 py-3 text-sm ${near ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200' : 'bg-muted/40'}`}
      >
        <strong>{list.usableCount}</strong> usable {list.usableCount === 1 ? 'question' : 'questions'}.{' '}
        {near
          ? `The quiz needs at least ${list.minimum}. Add questions before you retire any more.`
          : `The quiz needs at least ${list.minimum}.`}
      </div>

      <ErrorNotice message={error} />

      {editing ? (
        <QuizQuestionForm
          key={editing === 'new' ? 'new' : editing.id}
          question={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast.success('Question saved')
            void load()
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-3">
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New question
          </Button>
          {retiredCount > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
              Show retired ({retiredCount})
            </label>
          )}
        </div>
      )}

      {visible.map((q) => (
        <Card key={q.id}>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0 space-y-1">
              <div className="font-medium">
                {q.questionText}{' '}
                {q.retiredAt && <Badge variant="outline">Retired</Badge>}
                {!q.retiredAt && !q.isActive && <Badge variant="outline">Off</Badge>}
                {!q.retiredAt && q.isActive && !q.explanation?.trim() && <Badge variant="outline">Needs an explanation</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {optionsOf(q).length} options. Correct: {q.correctAnswer}
                {q.valueKey ? `. Value: ${q.valueKey}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(q)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
              {q.retiredAt || !q.isActive ? (
                <Button variant="outline" size="sm" onClick={() => change(q, 'PUT', 'Question brought back')}>
                  <RotateCcw className="h-4 w-4" /> Bring back
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => change(q, 'DELETE', 'Question retired')}>
                  <Archive className="h-4 w-4" /> Retire
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
