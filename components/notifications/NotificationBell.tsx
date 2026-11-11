'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BellList } from '@/components/notifications/BellList'
import { useBell } from '@/components/notifications/use-bell'
import type { BellItem } from '@/lib/notifications/service'

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { items, unread, loading, error, refresh, markShownRead } = useBell(true)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void refresh().then(markShownRead)
  }

  const handleSelect = (item: BellItem) => {
    setOpen(false)
    router.push(item.href)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</div>
        <div className="max-h-96 overflow-y-auto">
          <BellList items={items} loading={loading} error={error} onSelect={handleSelect} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
