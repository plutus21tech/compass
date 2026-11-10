import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { isAcademyEnabled } from '@/lib/academy/flag'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function AcademyLayout({ children }: { children: ReactNode }) {
  if (!isAcademyEnabled()) notFound()
  return children
}
