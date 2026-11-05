import type { ModuleView } from '@/lib/academy/view'
import { Markdown } from './Markdown'

const NOT_WRITTEN_YET = 'Your team lead will go through this with you on your first call.'

interface RoleExpectationsBlockProps {
  view: ModuleView
}

export function RoleExpectationsBlock({ view }: RoleExpectationsBlockProps) {
  return <Markdown>{view.roleExpectations?.trim() || NOT_WRITTEN_YET}</Markdown>
}
