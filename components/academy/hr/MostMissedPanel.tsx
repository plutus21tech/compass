'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { answerNote, type MostMissedRow } from '@/lib/academy/most-missed'
import { ErrorLine } from './Chip'
import { trackerErrorText, trackerFetch } from './tracker-api'

const TOP = 10

const percent = (wrong: number, total: number) => (total === 0 ? '0%' : `${Math.round((wrong / total) * 100)}%`)

function Figures({ wrong, total }: { wrong: number; total: number }) {
  const note = answerNote(total)
  if (note) return <span className="text-xs text-muted-foreground">{note}</span>
  return (
    <span className="whitespace-nowrap tabular-nums">
      {percent(wrong, total)} <span className="text-xs text-muted-foreground">({wrong} of {total})</span>
    </span>
  )
}

export function MostMissedPanel() {
  const [rows, setRows] = useState<MostMissedRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    let live = true
    trackerFetch<MostMissedRow[]>('/api/admin/onboarding/tracker/most-missed')
      .then((next) => { if (live) setRows(next) })
      .catch((e) => { if (live) setError(trackerErrorText(e)) })
    return () => { live = false }
  }, [])

  const shown = rows && !all ? rows.slice(0, TOP) : rows

  return (
    <section aria-labelledby="most-missed-heading" className="space-y-3">
      <div>
        <h2 id="most-missed-heading" className="text-lg font-medium">Most-missed questions</h2>
        <p className="text-sm text-muted-foreground">How often each question is answered wrongly, over every attempt and over each person&apos;s first.</p>
      </div>
      <ErrorLine message={error} />
      {rows === null && !error && <p className="text-sm text-muted-foreground" role="status">Loading...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No quiz answers yet.</p>
      )}
      {shown !== null && shown.length > 0 && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">Question</th>
                <th scope="col" className="px-3 py-2 font-medium">All attempts</th>
                <th scope="col" className="px-3 py-2 font-medium">First attempts</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.questionId} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2">
                    {row.question}
                    {row.retired && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Retired</span>}
                  </td>
                  <td className="px-3 py-2"><Figures wrong={row.wrong} total={row.attempts} /></td>
                  <td className="px-3 py-2"><Figures wrong={row.firstWrong} total={row.firstAttempts} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows !== null && rows.length > TOP && (
        <Button type="button" size="sm" variant="outline" onClick={() => setAll((v) => !v)}>
          {all ? `Show top ${TOP}` : `Show all ${rows.length}`}
        </Button>
      )}
    </section>
  )
}
