'use client'

import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { BackgroundBeams } from '@/components/aceternity/background-beams'

export function HandbookHero({
  firstName,
  teamLabel,
  query,
  onQueryChange,
}: {
  firstName: string | null
  teamLabel: string | null
  query: string
  onQueryChange: (q: string) => void
}) {
  // Ctrl/Cmd+K is the global command palette's (TopBar); this hero only offers the inline search.

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card border border-border bg-card p-8 sm:p-10 mb-8"
    >
      {/* opacity-70 in light: 40% of a faint violet over a white card is invisible. */}
      <BackgroundBeams className="opacity-70 dark:opacity-20" />

      <div className="relative">
        {/* The label always renders -- it and the rule are one editorial unit, and
            omitting it for untagged users left the rule orphaned above the greeting.
            Untagged is the state every employee starts in, so it is not an edge case. */}
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {teamLabel ? `Plutus21 · ${teamLabel}` : 'Plutus21'}
        </p>
        <div className="h-px w-full max-w-xs bg-gradient-to-r from-primary/60 to-transparent my-3.5" />

        <h2 className="text-3xl sm:text-4xl font-display font-light tracking-tight text-foreground">
          {firstName ? (
            <>
              Welcome to Plutus21, <span className="gradient-text">{firstName}</span>.
            </>
          ) : (
            <>
              The <span className="gradient-text">Handbook</span>
            </>
          )}
        </h2>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Everything about how we work — the policies, the benefits, the people.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the handbook — leave, hours, benefits…"
            aria-label="Search the handbook"
            className="w-full rounded-button border border-border bg-background/80 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>
    </motion.div>
  )
}
