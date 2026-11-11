'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Home, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { ApprovalQueue } from '@/components/leave/time-off/ApprovalQueue'
import { BalanceCards } from '@/components/leave/time-off/BalanceCards'
import { MyRequests } from '@/components/leave/time-off/MyRequests'
import { useScrollToHash } from '@/components/leave/time-off/use-scroll-to-hash'
import { OutTodayCard } from '@/components/leave/time-off/OutTodayCard'
import { PlanReminder } from '@/components/leave/time-off/PlanReminder'
import { RequestDetailsDialog } from '@/components/leave/time-off/RequestDetailsDialog'
import { RequestPanel, type PanelMode } from '@/components/leave/time-off/RequestPanel'
import { TeamCalendar } from '@/components/leave/time-off/TeamCalendar'
import { useTimeOffData } from '@/components/leave/time-off/useTimeOffData'
import { WfhRequestDialog } from '@/components/leave/time-off/WfhRequestDialog'
import { WfhSection } from '@/components/leave/time-off/WfhSection'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { isThreeEDepartment } from '@/lib/company-branding'
import { formatDate, localDayKey } from '@/lib/format-date'
import { cancelLeave } from '@/lib/time-off/api'
import { buildBalanceCards, nextLeave } from '@/lib/time-off/balance-cards'
import { filterEventsByDepartment, outToday } from '@/lib/time-off/calendar-grid'
import { DEEP_LINK_UNAVAILABLE, deepLinkTarget, parseTimeOffParams } from '@/lib/time-off/page-params'
import { panelModeKey, panelSwitchAction } from '@/lib/time-off/panel-switch'
import { planReminderRequests } from '@/lib/time-off/request-rules'
import type { LeaveRequest } from '@/lib/time-off/types'

type Range = { start: string; end: string }
interface PanelState {
  open: boolean
  mode: PanelMode
  range: Range | null
}

const CREATE: PanelMode = { kind: 'create' }
const CLOSED: PanelState = { open: false, mode: CREATE, range: null }
const SUBTITLE = "Plan leave, see who's around, and track your requests."
const SUBTITLE_3E =
  "Plan leave or work from home, see who's around, and track your requests. WFH does not use your leave balance."
const REMINDER_TOAST = 'Add transition plan for upcoming leave(s) before time off starts.'
const CALENDAR_ERROR = 'Could not load the calendar. Try another month or refresh.'

function BalanceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-36 rounded-card" />
      ))}
    </div>
  )
}

export default function LeavePage() {
  const user = useLayoutUser()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { openRequest, requestId } = parseTimeOffParams(searchParams)
  const data = useTimeOffData(true)
  const { loading, snapshot, reload, reloadCalendar, calendar } = data

  const [departmentFilter, setDepartmentFilter] = useState('ALL')
  const [panel, setPanel] = useState<PanelState>(CLOSED)
  const [pendingPanel, setPendingPanel] = useState<PanelState | null>(null)
  const panelDirtyRef = useRef(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null)
  const [wfhOpen, setWfhOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState('')
  const handledDeepLinkRef = useRef('')
  const handledOpenRef = useRef(false)
  const reminderShownRef = useRef(false)

  const viewerDepartment = user?.department ?? null
  const isThreeE = isThreeEDepartment(user?.department)
  const balanceYear = new Date().getFullYear()
  const reminders = planReminderRequests(snapshot.requests, viewerDepartment)
  const outTodayEvents = outToday(filterEventsByDepartment(calendar.events, departmentFilter), localDayKey(new Date()))

  // The details dialog always shows the latest copy of its request, and closes if it is gone.
  const detailsRequest = detailsId ? snapshot.requests.find((r) => r.id === detailsId) ?? null : null
  if (detailsId && !loading && !detailsRequest) setDetailsId(null)

  const reloadAll = useCallback(async () => {
    await Promise.all([reload(), reloadCalendar()])
  }, [reload, reloadCalendar])

  // Switching the open panel to another request (or to a new one) asks before discarding a filled form.
  const requestPanel = (next: PanelState) => {
    const current = { open: panel.open, modeKey: panelModeKey(panel.mode), dirty: panelDirtyRef.current }
    const action = panelSwitchAction(current, panelModeKey(next.mode))
    if (action === 'open') setPanel(next)
    else if (action === 'confirm') setPendingPanel(next)
  }
  const requestPanelRef = useRef(requestPanel)
  requestPanelRef.current = requestPanel
  const openCreate = () => requestPanel({ open: true, mode: CREATE, range: null })
  const closePanel = () => setPanel(CLOSED)
  const onRangeCommit = (range: Range) =>
    setPanel((p) => (p.open ? { ...p, range } : { open: true, mode: CREATE, range }))
  const onSaved = () => {
    closePanel()
    void reloadAll()
  }
  const openEdit = (r: LeaveRequest) => {
    setDetailsId(null)
    requestPanel({ open: true, mode: { kind: 'edit', request: r }, range: null })
  }
  const askCancel = (r: LeaveRequest) => {
    setDetailsId(null)
    setCancelTarget(r)
  }
  const confirmCancel = async (r: LeaveRequest) => {
    const res = await cancelLeave(r.id)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Request cancelled')
    // A cancelled request can no longer be edited.
    setPanel((p) => (p.open && p.mode.kind === 'edit' && p.mode.request.id === r.id ? CLOSED : p))
    await reloadAll()
  }

  useEffect(() => {
    if (reminders.length > 0 && !reminderShownRef.current) {
      reminderShownRef.current = true
      toast.warning(REMINDER_TOAST)
    }
  }, [reminders.length])

  useScrollToHash('my-requests', !loading)
  // Deep links: `requestId` once per id, then `request=1` (dropped from the URL once handled).
  useEffect(() => {
    if (!openRequest) handledOpenRef.current = false
    if (loading) return
    if (requestId && handledDeepLinkRef.current !== requestId) {
      handledDeepLinkRef.current = requestId
      setHighlightedId('')
      const target = deepLinkTarget(requestId, snapshot.approvals, snapshot.requests)
      if (target === 'approval') setHighlightedId(requestId)
      else if (target === 'own') setDetailsId(requestId)
      else toast.info(DEEP_LINK_UNAVAILABLE)
    }
    if (openRequest && !handledOpenRef.current) {
      handledOpenRef.current = true
      if (!requestId) requestPanelRef.current({ open: true, mode: CREATE, range: null })
      const next = new URLSearchParams(searchParams.toString())
      next.delete('request')
      const query = next.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    }
  }, [loading, requestId, openRequest, snapshot.approvals, snapshot.requests, searchParams, pathname, router])

  const actions = (
    <>
      {isThreeE && (
        <Button variant="outline" disabled={loading} onClick={() => setWfhOpen(true)}>
          <Home className="h-4 w-4" aria-hidden="true" />
          Request WFH
        </Button>
      )}
      <Button disabled={loading} onClick={openCreate}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Request leave
      </Button>
    </>
  )

  return (
    <PageContainer>
      <PageHeader
        dateLine={formatDate(localDayKey(new Date()))}
        title="Time off"
        subtitle={isThreeE ? SUBTITLE_3E : SUBTITLE}
        actions={actions}
      />

      {reminders.length > 0 && <PlanReminder count={reminders.length} onAdd={() => setDetailsId(reminders[0].id)} />}

      {loading ? (
        <BalanceSkeleton />
      ) : (
        snapshot.balance && (
          <BalanceCards
            cards={buildBalanceCards(snapshot.balance, snapshot.requests, balanceYear)}
            next={nextLeave(snapshot.requests)}
            onOpenRequest={setDetailsId}
          />
        )
      )}

      {/* No transform or z-index here: below lg the panel is a fixed z-50 layer above the z-40 top bar. */}
      <div className={`mt-8 grid gap-6 ${panel.open ? 'lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start' : ''}`}>
        <div className="min-w-0 space-y-2">
          {/* Range selection opens the panel, which needs the balance and directory: wait for them. */}
          {loading ? (
            <Skeleton className="h-[36rem] rounded-xl" aria-hidden="true" />
          ) : (
            <TeamCalendar
              year={calendar.year}
              month={calendar.month}
              onMonthChange={data.setMonth}
              events={calendar.events}
              holidays={calendar.holidays}
              birthdays={calendar.birthdays}
              users={snapshot.users}
              viewerDepartment={viewerDepartment}
              departmentFilter={departmentFilter}
              onDepartmentFilterChange={setDepartmentFilter}
              selection={panel.open ? panel.range : null}
              onRangeCommit={onRangeCommit}
              panelOpen={panel.open}
            />
          )}
          {data.calendarError && <p className="text-sm text-muted-foreground">{CALENDAR_ERROR}</p>}
        </div>
        <RequestPanel
          open={panel.open}
          mode={panel.mode}
          initialRange={panel.range}
          balance={snapshot.balance}
          balanceYear={balanceYear}
          viewerDepartment={viewerDepartment}
          viewerId={user?.id ?? ''}
          users={snapshot.users}
          holidayKeysFor={data.holidayKeysFor}
          onClose={closePanel}
          onSaved={onSaved}
          onDirtyChange={(dirty) => { panelDirtyRef.current = dirty }}
        />
      </div>

      {loading ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-2">
            <MyRequests requests={snapshot.requests} onView={(r) => setDetailsId(r.id)} onEdit={openEdit} onCancel={askCancel} />
            <ApprovalQueue requests={snapshot.approvals} highlightedId={highlightedId} onChanged={reloadAll} />
            <OutTodayCard events={outTodayEvents} />
          </div>
          <div className="mt-6">
            <WfhSection
              isThreeE={isThreeE}
              requests={snapshot.wfhRequests}
              approvals={snapshot.wfhApprovals}
              onRequest={() => setWfhOpen(true)}
              onChanged={reload}
            />
          </div>
        </>
      )}

      <RequestDetailsDialog
        request={detailsRequest}
        users={snapshot.users}
        onClose={() => setDetailsId(null)}
        onEdit={openEdit}
        onCancel={askCancel}
        onChanged={() => void reload()}
      />
      <ConfirmDialog
        isOpen={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) void confirmCancel(cancelTarget)
        }}
        title="Cancel this leave request?"
        message="Any days already taken from your balance go back, and the leave comes off the calendar."
        confirmText="Cancel request"
        cancelText="Keep it"
        variant="danger"
      />
      <ConfirmDialog
        isOpen={pendingPanel !== null}
        onClose={() => setPendingPanel(null)}
        onConfirm={() => { if (pendingPanel) setPanel(pendingPanel) }}
        title="Discard this request?"
        message={panel.mode.kind === 'edit' ? 'Your changes to this request will be lost.' : 'The dates and details you entered will be lost.'}
        confirmText="Discard"
        cancelText="Keep editing"
        variant="danger"
      />
      <WfhRequestDialog open={wfhOpen} onClose={() => setWfhOpen(false)} onSubmitted={reload} />
    </PageContainer>
  )
}
