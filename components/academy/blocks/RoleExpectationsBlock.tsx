import type { ModuleView } from '@/lib/academy/view'
import { Markdown } from './Markdown'

const NOT_WRITTEN_YET = 'Your role expectations will appear here once your team lead has added them.'

interface RoleExpectationsBlockProps {
  view: ModuleView
}

export function RoleExpectationsBlock({ view }: RoleExpectationsBlockProps) {
  return <Markdown>{view.roleExpectations?.trim() || NOT_WRITTEN_YET}</Markdown>
}
