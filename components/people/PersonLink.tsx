import Link from 'next/link'
import { profilePath } from '@/lib/people/profile-rules'
import { cn } from '@/lib/utils'

export interface PersonLinkProps {
  personId: string
  children: React.ReactNode
  className?: string
}

/** A person's name that opens their profile. */
export function PersonLink({ personId, children, className }: PersonLinkProps) {
  return (
    <Link
      href={profilePath(personId)}
      className={cn('rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40', className)}
    >
      {children}
    </Link>
  )
}
