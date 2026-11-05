import { redirect } from 'next/navigation'
import { ModulePage } from '@/components/academy/ModulePage'
import { getSession } from '@/lib/auth'
import { AcademyError } from '@/lib/academy/errors'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { loadModule, type ModuleView } from '@/lib/academy/service/course'
import { prisma } from '@/lib/db'
import LegacyModulePage from './LegacyModulePage'

interface PageProps {
  params: Promise<{ moduleSlug: string }>
}

/** Null means "not for this hire": locked, unknown, or the course isn't released. Anything else is a real failure. */
async function readModule(userId: string, slug: string): Promise<ModuleView | null> {
  try {
    return await loadModule(prisma, userId, slug)
  } catch (error) {
    if (error instanceof AcademyError && (error.status === 403 || error.status === 404)) return null
    throw error
  }
}

export default async function OnboardingModuleRoute({ params }: PageProps) {
  if (!isAcademyEnabled()) return <LegacyModulePage />

  const user = await getSession()
  if (!user) redirect('/login')

  const { moduleSlug } = await params
  const view = await readModule(user.id, moduleSlug)
  if (!view) redirect('/onboarding')

  return <ModulePage key={view.slug} view={view} />
}
