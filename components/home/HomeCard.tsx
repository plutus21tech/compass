import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export type HomeCardLink = { label: string; href: string } | { label: string; onClick: () => void }

interface HomeCardProps {
  title: string
  link?: HomeCardLink
  children: ReactNode
  footer?: ReactNode
}

const LINK_CLASS = 'text-sm text-primary hover:underline'

function CardLink({ link }: { link: HomeCardLink }) {
  if ('href' in link) {
    return (
      <Link href={link.href} className={LINK_CLASS}>
        {link.label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={link.onClick} className={LINK_CLASS}>
      {link.label}
    </button>
  )
}

export function HomeCard({ title, link, children, footer }: HomeCardProps) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {link ? <CardLink link={link} /> : null}
      </div>
      <div className="mt-3 flex-1">{children}</div>
      {footer ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">{footer}</div>
      ) : null}
    </Card>
  )
}

export function CardSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      <Skeleton className="h-9 w-24" />
      <Skeleton className="h-4 w-48" />
    </div>
  )
}
