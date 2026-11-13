'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { AddTeamTagForm } from './AddTeamTagForm'
import { TeamTagRow, type AdminTeamTag, type TeamTagPatch } from './TeamTagRow'

async function readError(res: Response, fallback: string): Promise<string | null> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return !res.ok || data.error ? data.error || fallback : null
}

/** Moves one code a step up or down, returning a new list. */
function moved(codes: readonly string[], code: string, direction: -1 | 1): string[] {
  const from = codes.indexOf(code)
  const to = from + direction
  if (from < 0 || to < 0 || to >= codes.length) return [...codes]
  const next = [...codes]
  ;[next[from], next[to]] = [next[to], next[from]]
  return next
}

/**
 * HR's team-tag list: add, rename, reorder, archive. `onChanged` lets the users
 * page refresh its team dropdown afterwards.
 */
export function TeamTagsManager({
  isOpen,
  onClose,
  onChanged,
}: {
  isOpen: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [tags, setTags] = useState<AdminTeamTag[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/team-tags', { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as { teams?: AdminTeamTag[]; error?: string }
      if (!res.ok || !data.teams) throw new Error(data.error || 'Failed to load team tags')
      setTags(data.teams)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load team tags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) void load()
  }, [isOpen, load])

  const refresh = async () => {
    await load()
    onChanged()
  }

  const send = async (method: 'PATCH' | 'PUT', body: unknown, fallback: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/team-tags', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const error = await readError(res, fallback)
      if (error) toast.error(error)
      await refresh()
    } catch {
      toast.error(fallback)
    } finally {
      setBusy(false)
    }
  }

  const patch = (code: string, change: TeamTagPatch) =>
    send('PATCH', { code, ...change }, 'Failed to update team tag')

  const move = (code: string, direction: -1 | 1) =>
    send('PUT', { order: moved(tags.map((t) => t.code), code, direction) }, 'Failed to reorder')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Team tags" size="xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Each person has one team tag. It decides their handbook content, public holidays and
          working days. Archived tags stay on the people who have them but can no longer be
          assigned.
        </p>
        {loading && tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-2">
            {tags.map((tag, index) => (
              <TeamTagRow
                // Keyed on the saved values so the uncontrolled inputs reset after a reload.
                key={`${tag.code}:${tag.label}:${tag.shortLabel ?? ''}`}
                tag={tag}
                busy={busy}
                isFirst={index === 0}
                isLast={index === tags.length - 1}
                onPatch={patch}
                onMove={move}
              />
            ))}
          </div>
        )}
        <AddTeamTagForm onCreated={refresh} />
      </div>
    </Modal>
  )
}
