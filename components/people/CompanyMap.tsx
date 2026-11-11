'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type Node,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { AlertCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { COMPANY_NAME } from '@/lib/config'
import { buildCompanyMapScene, findPeople, type CompanyMapScene, type PersonNodeData } from '@/lib/people/company-map'
import type { CompanyMapData, DirectoryPerson } from '@/lib/people/directory'
import { COMPANY_MAP_NODE_TYPES } from './CompanyMapNodes'

const LOAD_ERROR = 'Could not load the company map. Try again.'
const FOCUS_ZOOM = 1.1
const FOCUS_DURATION_MS = 600

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: CompanyMapData }

function useCompanyMapData(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/people/company-map')
        const body = (await res.json().catch(() => null)) as { success?: boolean; data?: CompanyMapData; error?: string } | null
        if (cancelled) return
        if (!res.ok || !body?.success || !body.data) {
          setState({ status: 'error', message: body?.error || LOAD_ERROR })
          return
        }
        setState({ status: 'ready', data: body.data })
      } catch (error) {
        console.error('Failed to load the company map:', error)
        if (!cancelled) setState({ status: 'error', message: LOAD_ERROR })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

function toFlow(scene: CompanyMapScene, highlightedId: string | null): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = scene.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.type === 'person' ? { ...(node.data as PersonNodeData), highlighted: node.id === highlightedId } : node.data,
    draggable: false,
    connectable: false,
  }))
  const edges: Edge[] = scene.edges.map((edge) => ({ ...edge, type: 'smoothstep', focusable: false }))
  return { nodes, edges }
}

interface PersonSearchProps {
  people: readonly DirectoryPerson[]
  onChoose: (personId: string) => void
}

function PersonSearch({ people, onChoose }: PersonSearchProps) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => findPeople(people, query), [people, query])
  const choose = (personId: string) => {
    setQuery('')
    onChoose(personId)
  }
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results[0]) choose(results[0].id)
          if (event.key === 'Escape') setQuery('')
        }}
        placeholder="Find someone"
        aria-label="Find someone"
        className="pl-9"
      />
      {query.trim() ? (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No one matches that name.</li>
          ) : (
            results.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => choose(person.id)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="text-sm font-medium">{person.name}</span>
                  <span className="text-xs text-muted-foreground">{person.position || person.department || 'Team member'}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

interface MapCanvasProps {
  data: CompanyMapData
  focusId: string | null
}

function MapCanvas({ data, focusId }: MapCanvasProps) {
  const scene = useMemo(() => buildCompanyMapScene(data, COMPANY_NAME), [data])
  const [highlightedId, setHighlightedId] = useState<string | null>(
    focusId && data.people.some((person) => person.id === focusId) ? focusId : null
  )
  const flow = useMemo(() => toFlow(scene, highlightedId), [scene, highlightedId])
  const { getNode, setCenter } = useReactFlow()
  const nodesInitialized = useNodesInitialized()
  const focusedOnLoad = useRef(false)

  const centreOn = useCallback(
    (personId: string) => {
      const node = getNode(personId)
      if (!node) return
      const origin = node.positionAbsolute ?? node.position
      setCenter(origin.x + (node.width ?? 0) / 2, origin.y + (node.height ?? 0) / 2, {
        zoom: FOCUS_ZOOM,
        duration: FOCUS_DURATION_MS,
      })
    },
    [getNode, setCenter]
  )

  useEffect(() => {
    if (!nodesInitialized || focusedOnLoad.current || !highlightedId) return
    focusedOnLoad.current = true
    centreOn(highlightedId)
  }, [nodesInitialized, highlightedId, centreOn])

  const choose = (personId: string) => {
    focusedOnLoad.current = true
    setHighlightedId(personId)
    centreOn(personId)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <PersonSearch people={data.people} onChoose={choose} />
        <p className="text-xs text-muted-foreground">Lines show who reports to whom.</p>
      </div>
      <div className="h-[70vh] min-h-[520px] overflow-hidden rounded-xl border border-border bg-background">
        <ReactFlow
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={COMPANY_MAP_NODE_TYPES}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

export interface CompanyMapProps {
  focusId: string | null
}

/** The whole company's reporting lines (names, titles and departments only). */
export function CompanyMap({ focusId }: CompanyMapProps) {
  const state = useCompanyMapData()
  if (state.status === 'loading') {
    return <Skeleton className="h-[70vh] min-h-[520px] w-full rounded-xl" />
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        {state.message}
      </div>
    )
  }
  return (
    <ReactFlowProvider>
      <MapCanvas key={focusId ?? ''} data={state.data} focusId={focusId} />
    </ReactFlowProvider>
  )
}
