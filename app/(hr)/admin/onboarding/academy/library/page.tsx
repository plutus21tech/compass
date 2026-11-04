'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { academyFetch, loadHandbookOptions, type HandbookOption } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'
import { LibraryCardForm, type LibraryCardRow } from '../_components/LibraryCardForm'

type Kind = 'BENEFIT' | 'REIMBURSEMENT'

function summarize(card: LibraryCardRow): string {
  const parts = [...card.countries, ...card.workModes, ...card.contractTypes, ...card.employmentStatuses]
  return parts.length === 0 ? 'Everyone' : parts.join(' / ')
}

export default function AcademyLibraryPage() {
  const [kind, setKind] = useState<Kind>('BENEFIT')
  // null while the current tab's cards are on their way.
  const [cards, setCards] = useState<LibraryCardRow[] | null>(null)
  const [handbook, setHandbook] = useState<HandbookOption[]>([])
  const [editing, setEditing] = useState<LibraryCardRow | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latestLoad = useRef(0)

  const load = useCallback(async (which: Kind) => {
    latestLoad.current += 1
    const thisLoad = latestLoad.current
    try {
      setError(null)
      const rows = await academyFetch<LibraryCardRow[]>(`/api/admin/onboarding/library?kind=${which}`)
      if (thisLoad === latestLoad.current) setCards(rows)
    } catch (e) {
      if (thisLoad !== latestLoad.current) return
      setCards([])
      setError(e instanceof Error ? e.message : 'Could not load cards')
    }
  }, [])

  useEffect(() => {
    void load(kind)
  }, [kind, load])

  useEffect(() => {
    void loadHandbookOptions().then(setHandbook)
  }, [])

  const hide = async (card: LibraryCardRow) => {
    try {
      await academyFetch(`/api/admin/onboarding/library/${card.id}`, { method: 'DELETE', body: {} })
      toast.success('Card hidden')
      await load(kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not hide the card')
    }
  }

  const unhide = async (card: LibraryCardRow) => {
    try {
      await academyFetch(`/api/admin/onboarding/library/${card.id}`, { method: 'PUT', body: { isActive: true } })
      toast.success('Card unhidden')
      await load(kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unhide the card')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Academy library</h1>
        <p className="mt-1 text-muted-foreground">Benefit and reimbursement cards shown to new hires who qualify.</p>
      </div>
      <Tabs
        value={kind}
        onValueChange={(v) => {
          setEditing(null)
          setCards(null)
          setKind(v as Kind)
        }}
      >
        <TabsList>
          <TabsTrigger value="BENEFIT">Benefits</TabsTrigger>
          <TabsTrigger value="REIMBURSEMENT">Reimbursements</TabsTrigger>
        </TabsList>
      </Tabs>
      <ErrorNotice message={error} />
      {editing ? (
        <LibraryCardForm
          key={editing === 'new' ? 'new' : editing.id}
          kind={kind}
          card={editing === 'new' ? null : editing}
          handbook={handbook}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            toast.success('Card saved')
            void load(kind)
          }}
        />
      ) : (
        <>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New card
          </Button>
          {cards === null && <p className="text-sm text-muted-foreground">Loading cards...</p>}
          {cards?.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
          {cards?.map((card) => (
            <Card key={card.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="font-medium">
                    {card.title} {!card.isActive && <Badge variant="outline">Hidden</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{summarize(card)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label={`Edit ${card.title}`} onClick={() => setEditing(card)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {card.isActive ? (
                    <Button variant="ghost" size="sm" aria-label={`Hide ${card.title}`} onClick={() => hide(card)}>
                      <EyeOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => unhide(card)}>
                      <Eye className="h-4 w-4" /> Unhide
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}
