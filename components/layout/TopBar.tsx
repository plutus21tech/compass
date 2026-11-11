'use client'

import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { SearchPage } from '@/components/layout/sidebar-config'
import { SearchTrigger } from '@/components/search/SearchTrigger'
import { CommandPalette } from '@/components/search/CommandPalette'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { UserMenu } from '@/components/layout/top-bar/UserMenu'
import { isMacPlatform, shortcutLabel, isPaletteShortcut } from '@/lib/search/shortcut'

interface TopBarUser {
  name: string
  role: string
  position?: string | null
  department?: string | null
}

interface TopBarProps {
  user: TopBarUser | null
  /** Pages the person can search for. */
  pages: readonly SearchPage[]
  /** True while the person is still in onboarding: no search, no bell. */
  locked: boolean
  onMenuClick: () => void
  className?: string
}

export function TopBar({ user, pages, locked, onMenuClick, className }: TopBarProps) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [hint, setHint] = useState(shortcutLabel(false))
  const searchEnabled = !locked && !!user

  useEffect(() => {
    setHint(shortcutLabel(isMacPlatform(navigator.platform)))
  }, [])

  useEffect(() => {
    if (!searchEnabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return
      event.preventDefault()
      if (event.repeat) return
      setPaletteOpen((open) => !open)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [searchEnabled])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6',
        className
      )}
    >
      {/* Left: mobile menu button */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {/* Right: search, bell, theme, account */}
      <div className="flex items-center gap-2 ml-auto">
        {searchEnabled && <SearchTrigger onOpen={() => setPaletteOpen(true)} hint={hint} />}
        {searchEnabled && <NotificationBell />}
        <ThemeToggle />
        {user ? (
          <UserMenu user={user} />
        ) : (
          <div className="flex items-center gap-2.5 pl-2" aria-hidden="true">
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        )}
      </div>
      {searchEnabled && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} pages={pages} />}
    </header>
  )
}
