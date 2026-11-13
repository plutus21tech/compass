import { ModuleEditor } from '@/components/academy/hr/ModuleEditor'

interface PageProps {
  params: Promise<{ moduleId: string }>
}

export default async function ModuleEditorPage({ params }: PageProps) {
  const { moduleId } = await params
  return <ModuleEditor key={moduleId} moduleId={moduleId} />
}
