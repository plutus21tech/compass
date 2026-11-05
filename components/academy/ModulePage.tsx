'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ModuleView } from '@/lib/academy/view'
import { completionToast, formatAcademyDate, neighbourSlugs } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'
import { BlockRenderer } from './BlockRenderer'
import { ACADEMY_THEME_VARS } from './brand'
import { CompleteFooter } from './CompleteFooter'
import { EndSentinel } from './EndSentinel'
import { academySans, academySerif } from './fonts'
import { ModuleHeader } from './ModuleHeader'
import { ModuleMobileBar } from './ModuleMobileBar'
import { ModuleRail } from './ModuleRail'
import type { BlockContext } from './types'
import { useModuleProgress } from './useModuleProgress'

const HOME_HREF = '/onboarding'
const CHECK_MOMENT_MS = 700

const moduleHref = (slug: string | null) => (slug ? `/onboarding/${slug}` : HOME_HREF)

interface ModulePageProps {
  view: ModuleView
}

export function ModulePage({ view }: ModulePageProps) {
  const router = useRouter()
  const progress = useModuleProgress(view.slug, view.progress)
  const { previous, nextTitle } = neighbourSlugs(view.rail, view.slug)
  const timeZone = view.callTimes.timeZone
  const { state, readOnly, setCheck, openLink, complete } = progress

  // The app shell scrolls <main>, not the window, and moving between modules should start at the top.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.closest('main')?.scrollTo({ top: 0 })
  }, [])

  const onSaved = useCallback(() => router.refresh(), [router])

  const context = useMemo<BlockContext>(
    () => ({ view, state, readOnly, setCheck, openLink, onSaved }),
    [view, state, readOnly, setCheck, openLink, onSaved],
  )

  const handleComplete = useCallback(async () => {
    const result = await complete()
    if (!result) {
      // The rule may have changed under us: the refreshed page shows the current reason.
      router.refresh()
      return false
    }
    toast.success(completionToast(view.number, nextTitle))
    setTimeout(() => router.push(moduleHref(result.nextSlug)), CHECK_MOMENT_MS)
    return true
  }, [complete, nextTitle, router, view.number])

  return (
    <div
      ref={root}
      style={ACADEMY_THEME_VARS}
      className={cn(
        academySans.className,
        academySerif.variable,
        'min-h-full bg-academy-paper text-academy-navy selection:bg-academy-blue/20 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]',
      )}
    >
      <ModuleMobileBar rail={view.rail} currentSlug={view.slug} timeZone={timeZone} />
      <ModuleRail rail={view.rail} currentSlug={view.slug} timeZone={timeZone} />
      <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-col">
        <ModuleHeader view={view} />
        <div className="mx-auto w-full max-w-[720px] flex-1 space-y-7 px-5 py-8 text-[16px] text-academy-navy sm:py-10">
          {view.blocks.map((block, index) => (
            <BlockRenderer key={index} block={block} context={context} />
          ))}
          <EndSentinel armed={!readOnly && !progress.scrollSaved} onSeen={progress.markScrolledEnd} />
        </div>
        <CompleteFooter
          state={progress.footer}
          backHref={moduleHref(previous)}
          nextHref={moduleHref(view.nextSlug)}
          completedOn={view.progress.completedAt ? formatAcademyDate(view.progress.completedAt, timeZone) : null}
          isLastModule={view.nextSlug === null}
          onComplete={handleComplete}
        />
      </div>
    </div>
  )
}
