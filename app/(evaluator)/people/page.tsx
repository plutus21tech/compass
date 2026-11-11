'use client'

import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/page-container'
import { Skeleton } from '@/components/ui/skeleton'
import { PeopleWorkspace } from '@/components/people/PeopleWorkspace'

function PeopleSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="mb-6 h-9 w-40" />
      <Skeleton className="h-10 w-56 rounded-xl" />
      <Skeleton className="mt-4 h-64 w-full rounded-xl" />
    </PageContainer>
  )
}

// useSearchParams requires a Suspense boundary in the App Router.
export default function PeoplePage() {
  return (
    <Suspense fallback={<PeopleSkeleton />}>
      <PeopleWorkspace />
    </Suspense>
  )
}
