'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Chip } from '@/components/academy/hr/Chip'
import type { ContentModuleRow } from '@/lib/academy/service/content'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { academyFetch } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'

export default function ContentModulesPage() {
  const [rows, setRows] = useState<ContentModuleRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    academyFetch<ContentModuleRow[]>('/api/admin/onboarding/content')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the modules'))
  }, [])

  if (!rows) return error ? <div className="p-6"><ErrorNotice message={error} /></div> : <LoadingScreen />

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Modules</h1>
        <p className="mt-1 text-sm text-muted-foreground">Edit the words hires read. Nothing changes for them until you publish.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Module</th>
              <th scope="col" className="px-4 py-2.5 font-medium">When</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Live version</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Published</th>
              <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3">
                  <span className="tabular-nums text-muted-foreground">{row.number}.</span> {row.title}
                  {row.hasDraft ? <Chip chip={{ label: 'Draft', tone: 'warning' }} className="ml-2" /> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{row.phase}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{row.version}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatAcademyDate(row.publishedAt, null)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/onboarding/academy/modules/${row.id}`} aria-label={`Edit ${row.title}`} className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
