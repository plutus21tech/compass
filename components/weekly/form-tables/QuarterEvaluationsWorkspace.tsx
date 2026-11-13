'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { FormTableKind, FormTablesResponse, TableRelationshipTypeValue } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { FormTable } from './FormTable'

const RELATIONSHIP_LABELS: Record<TableRelationshipTypeValue, string> = {
  C_LEVEL: 'C-Level', DEPT: 'Department', HR: 'HR', TEAM_LEAD: 'As their lead', DIRECT_REPORT: 'As a member of their team',
  PEER: 'As a peer', CROSS_DEPARTMENT: 'Cross-department', SELF: 'Self',
}

const PARTNER_ENDPOINT = '/api/weekly/partner-tables'

/** `mine`: a partner's own tables on their evaluations page, rather than HR's view of every partner. */
export function TablesPanel({ kind, periodId, mine = false }: { kind: FormTableKind; periodId?: string; mine?: boolean }) {
  const [data, setData] = useState<FormTablesResponse | null>(null)
  const load = useCallback(async () => {
    try {
      const quarter = periodId ? `&periodId=${encodeURIComponent(periodId)}` : ''
      setData(await weeklyRequest<FormTablesResponse>(mine ? PARTNER_ENDPOINT : `/api/admin/weekly/form-tables?kind=${kind}${quarter}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the evaluations'))
    }
  }, [kind, periodId, mine])
  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!data.quarter) return <p className="text-sm text-muted-foreground">No quarter is running on weekly evaluations.</p>
  if (data.tables.length === 0) {
    const none = mine ? 'You have no evaluations mapped this quarter.' : kind === 'HR' ? 'You have no HR evaluations this quarter.' : 'No partner has evaluations mapped this quarter.'
    return <p className="text-sm text-muted-foreground">{none}</p>
  }
  return (
    <div className="space-y-6">
      {data.locked && <p className="text-sm text-muted-foreground">This quarter is locked, so these evaluations can no longer change.</p>}
      {!data.locked && !data.open && data.opensAt && <p className="text-sm text-muted-foreground">These open on {formatKarachiDate(data.opensAt)}. Until then you can look but not score.</p>}
      {data.tables.map((table) => (
        <Card key={`${table.evaluator.id}-${table.relationshipType}`}>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-semibold">
              {kind === 'HR' ? 'HR evaluation' : mine ? RELATIONSHIP_LABELS[table.relationshipType] : `${table.evaluator.name} · ${RELATIONSHIP_LABELS[table.relationshipType]}`}
            </h2>
            <FormTable kind={kind} table={table} editable={data.open && !data.locked} periodId={periodId} endpoint={mine ? PARTNER_ENDPOINT : undefined} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/**
 * The round's Quarter-end forms tab: HR's own HR evaluations, and the partners' evaluations it fills in on their behalf.
 * `periodId`: an earlier quarter HR is finishing; the running round's when left out.
 */
export function QuarterEvaluationsWorkspace({ periodId }: { periodId?: string } = {}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Score everyone in one table, 1 to 4 per question (quarter steps like 2.75 or 3.5 are fine). Rows save as you go; submit a row when it is complete.</p>
      <Tabs defaultValue="hr">
        <TabsList>
          <TabsTrigger value="hr">HR evaluations</TabsTrigger>
          <TabsTrigger value="partners">Partner evaluations</TabsTrigger>
        </TabsList>
        <TabsContent value="hr" className="pt-4"><TablesPanel kind="HR" periodId={periodId} /></TabsContent>
        <TabsContent value="partners" className="pt-4">
          <p className="mb-4 text-sm text-muted-foreground">The partners see these same tables on their own accounts and can fill them in themselves; HR can fill them in too. Whatever either saves shows here, with who saved each row last.</p>
          <TablesPanel kind="PARTNER" periodId={periodId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
