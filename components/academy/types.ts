import type { ProgressState } from '@/lib/academy/progress'
import type { ModuleView } from '@/lib/academy/view'

export interface BlockContext {
  view: ModuleView
  state: ProgressState
  /** The module is finished: show saved values and offer no edits. */
  readOnly: boolean
  setCheck: (key: string, checked: boolean) => void
  openLink: (key: string) => void
  /** After a field save: re-reads the module, so the saved value and the completion rule update. */
  onSaved: () => void
}
