'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SearchTriggerProps {
  onOpen: () => void
  hint: string
}

export function SearchTrigger({ onOpen, hint }: SearchTriggerProps) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="hidden md:flex h-9 w-64 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1 text-left">Search Compass</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium">{hint}</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpen} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </>
  )
}
