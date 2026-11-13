'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, MessageCircle } from 'lucide-react'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const LOAD_ERROR = 'Could not load your team. Try again.'

interface TeamMember {
  id: string
  name: string
  discordId: string | null
  department: string | null
  position: string | null
}

interface TeamResponse {
  teamMembers?: TeamMember[]
  scope?: 'direct_reports' | 'department' | 'company'
  department?: string | null
  error?: string
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; members: TeamMember[]; heading: string }

function headingFor(body: TeamResponse): string {
  if (body.scope === 'direct_reports') return 'Your direct reports'
  return body.department ? `People in ${body.department}` : 'People in the company'
}

function useTeam(): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/users/team')
        const body = (await res.json().catch(() => null)) as TeamResponse | null
        if (cancelled) return
        if (!res.ok || !body?.teamMembers) {
          setState({ status: 'error', message: LOAD_ERROR })
          return
        }
        setState({ status: 'ready', members: body.teamMembers, heading: headingFor(body) })
      } catch (error) {
        console.error('Failed to load team members:', error)
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

function TeamRow({ member, highlighted }: { member: TeamMember; highlighted: boolean }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])
  return (
    <li
      ref={ref}
      data-highlighted={highlighted || undefined}
      className={cn('flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3', highlighted && 'ring-2 ring-primary')}
    >
      <UserAvatar name={member.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
        <p className="truncate text-xs text-muted-foreground">{member.position || member.department || 'Team member'}</p>
      </div>
      <p className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">Discord ID</span>
        <span className="font-mono text-[11px] text-foreground/90">{member.discordId || 'Discord ID not set'}</span>
      </p>
    </li>
  )
}

export interface MyTeamListProps {
  highlightId: string | null
}

/** The people the viewer works with day to day (direct reports, else their department). */
export function MyTeamList({ highlightId }: MyTeamListProps) {
  const state = useTeam()
  if (state.status === 'loading') {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
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
    <section aria-labelledby="my-team-heading" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="my-team-heading" className="text-lg font-semibold text-foreground">{state.heading}</h2>
        <Badge variant="secondary">{state.members.length}</Badge>
      </div>
      {state.members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No team members found yet.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {state.members.map((member) => (
            <TeamRow key={member.id} member={member} highlighted={member.id === highlightId} />
          ))}
        </ul>
      )}
    </section>
  )
}
