'use client'

import { use } from 'react'
import { PersonProfileWorkspace } from '@/components/people/profile/PersonProfile'

export default function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PersonProfileWorkspace personId={id} />
}
