'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { academyFetch, loadHandbookOptions, type HandbookOption } from '../_components/academy-api'
import { ErrorNotice } from '../_components/ErrorNotice'
import { LibraryCardForm, type LibraryCardRow } from '../_components/LibraryCardForm'
import { useAcademyGate } from '../_components/useAcademyGate'

type Kind = 'BENEFIT' | 'REIMBURSEMENT'

function summarize(card: LibraryCardRow): string {
  const parts = [...card.countries, ...card.workModes, ...card.contractTypes, ...card.employmentStatuses]
  return parts.length === 0 ? 'Everyone' : parts.join(' / ')
}

export default function AcademyLibraryPage() {
  const enabled = useAcademyGate()
  const [kind, setKind] = useState<Kind>('BENEFIT')
  const [cards, setCards] = useState<LibraryCardRow[]>([])
  const [handbook, setHandbook] = useState<HandbookOption[]>([])
  const [editing, setEditing] = useState<LibraryCardRow | 'new' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (which: Kind) => {
    try {
      setError(null)
      setCards(await academyFetch<LibraryCardRow[]>(`/api/admin/onboarding/library?kind=${which}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load cards')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load(kind)
    void loadHandbookOptions().then(setHandbook)
  }, [enabled, kind, load])

  const hide = async (card: LibraryCardRow) => {
    try {
      await academyFetch(`/api/admin/onboarding/library/${card.id}`, { method: 'DELETE', body: {} })
      toast.success('Card hidden')
      await load(kind)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not hide the card')
    }
  }

  if (!enabled) return null
  if (loading) return <LoadingScreen message="Loading library..." />

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
          {cards.length === 0 && <p className="text-sm text-muted-foreground">No cards yet.</p>}
          {cards.map((card) => (
            <Card key={card.id}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {card.title} {!card.isActive && <Badge variant="outline">Hidden</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">{summarize(card)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label={`Edit ${card.title}`} onClick={() => setEditing(card)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {card.isActive && (
                    <Button variant="ghost" size="sm" aria-label={`Hide ${card.title}`} onClick={() => hide(card)}>
                      <Trash2 className="h-4 w-4" />
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
