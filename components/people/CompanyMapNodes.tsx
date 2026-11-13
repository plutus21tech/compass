'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Building2 } from 'lucide-react'
import type { CompanyNodeData, PersonNodeData } from '@/lib/people/company-map'
import { cn } from '@/lib/utils'

/** Node data as rendered: the scene's data plus the search/focus highlight. */
export type PersonFlowData = PersonNodeData & { highlighted: boolean }

const HANDLE_CLASS = '!h-1.5 !w-1.5 !border-0 !bg-muted-foreground/50'

/** "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function PersonNodeView({ data }: NodeProps<PersonFlowData>) {
  const classes = cn(
    'w-[220px] rounded-xl border border-border bg-card px-4 py-3 text-left text-foreground shadow-sm transition-shadow',
    data.isViewer && 'ring-2 ring-primary',
    data.highlighted && 'ring-4 ring-primary/60 shadow-lg'
  )
  return (
    <div className={classes} data-viewer={data.isViewer || undefined}>
      <Handle type="target" position={Position.Top} className={HANDLE_CLASS} isConnectable={false} />
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold">{data.name}</p>
        {data.isViewer ? (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
            You
          </span>
        ) : null}
      </div>
      {data.position ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{data.position}</p> : null}
      {data.department ? (
        <p className="mt-1 truncate text-[11px] uppercase tracking-wider text-muted-foreground">{data.department}</p>
      ) : null}
      {data.leads.length >= 2 ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">Reports to {joinNames(data.leads)}</p>
      ) : null}
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} isConnectable={false} />
    </div>
  )
}

function CompanyNodeView({ data }: NodeProps<CompanyNodeData>) {
  return (
    <div className="flex min-w-[200px] items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-foreground shadow-sm">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} isConnectable={false} />
    </div>
  )
}

export const PersonNode = memo(PersonNodeView)
export const CompanyNode = memo(CompanyNodeView)

/** Stable across renders, as React Flow requires. */
export const COMPANY_MAP_NODE_TYPES = { person: PersonNode, company: CompanyNode }
