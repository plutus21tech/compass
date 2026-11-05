'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import type { ModuleCardView } from '@/lib/academy/view'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from './brand'
import { academySans } from './fonts'
import { RowText, StatusIcon } from './ModuleRail'

interface ModuleMobileBarProps {
  rail: readonly ModuleCardView[]
  currentSlug: string
  timeZone: string | null
}

export function ModuleMobileBar({ rail, currentSlug, timeZone }: ModuleMobileBarProps) {
  const done = rail.filter((card) => card.status === 'COMPLETED').length
  return (
    <div className="sticky top-0 z-30 border-b border-academy-line bg-academy-paper lg:hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-1.5">
        <p className="text-sm font-semibold tabular-nums text-academy-navy">
          {done} of {rail.length} done
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" className="h-11 gap-1 px-2 text-academy-blue">
              Modules
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            collisionPadding={12}
            style={ACADEMY_THEME_VARS}
            className={cn(academySans.className, 'w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl p-2 text-academy-navy')}
          >
            <DropdownMenuItem asChild className="rounded-xl px-3 py-2.5 font-medium text-academy-blue">
              <Link href="/onboarding" prefetch={false}>
                Home
              </Link>
            </DropdownMenuItem>
            {rail.map((card) => (
              <DropdownMenuItem
                key={card.slug}
                asChild
                disabled={card.status === 'LOCKED'}
                className={cn(
                  'items-start gap-2.5 rounded-xl px-3 py-2 data-[disabled]:opacity-100',
                  card.slug === currentSlug && 'bg-academy-blue-tint',
                )}
              >
                {/* No prefetch: loading a module marks it as started. */}
                <Link
                  href={`/onboarding/${card.slug}`}
                  prefetch={false}
                  aria-current={card.slug === currentSlug ? 'page' : undefined}
                >
                  <StatusIcon card={card} />
                  <RowText card={card} timeZone={timeZone} />
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Progress value={(done / rail.length) * 100} aria-label="Course progress" className="h-1 rounded-none" />
    </div>
  )
}
