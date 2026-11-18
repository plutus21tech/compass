'use client'

import type { ReactNode } from 'react'
import { formatDate } from '@/lib/format-date'

export type SideTab = 'day' | 'requests'

interface SidePanelProps {
  tab: SideTab
  onTabChange: (tab: SideTab) => void
  dayKey: string
  todayKey: string
  /** Requests still waiting for approval, shown as a badge on the tab; hidden at 0. */
  waitingCount: number
  day: ReactNode
  requests: ReactNode
}

const TAB = 'flex-1 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'
const ACTIVE = 'border-primary text-foreground'
const IDLE = 'border-transparent text-muted-foreground hover:text-foreground'

/**
 * The calendar's fixed right-hand panel while no request form is open:
 * the chosen day's details, or the viewer's own requests.
 */
export function SidePanel({ tab, onTabChange, dayKey, todayKey, waitingCount, day, requests }: SidePanelProps) {
  const dayLabel = dayKey === todayKey ? 'Today' : formatDate(dayKey)
  return (
    <section
      aria-label="Day details and your requests"
      className="flex min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:sticky lg:top-6 lg:max-h-[calc(100vh-3.5rem-3rem)]"
    >
      <div role="tablist" aria-label="Side panel" className="flex border-b border-border">
        <button
          type="button"
          role="tab"
          id="side-tab-day"
          aria-selected={tab === 'day'}
          aria-controls="side-panel-body"
          className={`${TAB} ${tab === 'day' ? ACTIVE : IDLE}`}
          onClick={() => onTabChange('day')}
        >
          {dayLabel}
        </button>
        <button
          type="button"
          role="tab"
          id="side-tab-requests"
          aria-selected={tab === 'requests'}
          aria-controls="side-panel-body"
          className={`${TAB} ${tab === 'requests' ? ACTIVE : IDLE}`}
          onClick={() => onTabChange('requests')}
        >
          My requests
          {waitingCount > 0 && (
            <span
              className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
              aria-label={`${waitingCount} waiting for approval`}
            >
              {waitingCount}
            </span>
          )}
        </button>
      </div>
      <div
        id="side-panel-body"
        role="tabpanel"
        aria-labelledby={tab === 'day' ? 'side-tab-day' : 'side-tab-requests'}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {tab === 'day' ? day : requests}
      </div>
    </section>
  )
}
