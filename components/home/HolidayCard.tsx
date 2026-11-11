'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/format-date'
import { inDaysPhrase } from '@/lib/home/time'
import type { HolidayView, HomeOverview } from '@/lib/home/out-today'
import type { Source } from './fetch-source'
import { CardSkeleton, HomeCard } from './HomeCard'

const TITLE = 'Next public holiday'
const NO_TEAM = 'No team is set on your profile, so no holidays show here. Ask HR to set it.'
const NONE = 'No upcoming holidays for your team yet.'

interface HolidaysDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  holidays: HolidayView[]
}

function HolidaysDialog({ open, onOpenChange, holidays }: HolidaysDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>All holidays</DialogTitle>
        </DialogHeader>
        <ul className="divide-y divide-border/70">
          {holidays.map((h) => (
            <li key={`${h.date}-${h.name}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-medium">{formatDate(h.date)}</span>
              <span className="text-muted-foreground">{h.name}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function Message({ children }: { children: string }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

export function HolidayCard({ overview }: { overview: Source<HomeOverview> | null }) {
  const [open, setOpen] = useState(false)
  if (overview === null) {
    return (
      <HomeCard title={TITLE}>
        <CardSkeleton />
      </HomeCard>
    )
  }
  if (!overview.ok) {
    return (
      <HomeCard title={TITLE}>
        <Message>Could not load holidays.</Message>
      </HomeCard>
    )
  }
  const { teamLabel, nextHoliday, upcomingHolidays } = overview.data
  if (teamLabel === null) {
    return (
      <HomeCard title={TITLE}>
        <Message>{NO_TEAM}</Message>
      </HomeCard>
    )
  }
  if (nextHoliday === null) {
    return (
      <HomeCard title={TITLE}>
        <Message>{NONE}</Message>
      </HomeCard>
    )
  }
  return (
    <>
      <HomeCard
        title={TITLE}
        link={{ label: 'All holidays', onClick: () => setOpen(true) }}
        footer={
          <>
            <p className="text-sm text-muted-foreground">{inDaysPhrase(nextHoliday.daysAway)}</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{teamLabel}</span>
          </>
        }
      >
        <p className="text-3xl font-semibold">{formatDate(nextHoliday.date)}</p>
        <p className="mt-2 text-sm text-muted-foreground">{nextHoliday.name}</p>
      </HomeCard>
      <HolidaysDialog open={open} onOpenChange={setOpen} holidays={upcomingHolidays} />
    </>
  )
}
