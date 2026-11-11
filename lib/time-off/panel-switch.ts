export type PanelModeLike = { kind: 'create' } | { kind: 'edit'; request: { id: string } }

/** One key per panel session: create, or the edited request. */
export const panelModeKey = (mode: PanelModeLike): string =>
  mode.kind === 'edit' ? `edit:${mode.request.id}` : 'create'

export interface PanelSwitchState {
  open: boolean
  modeKey: string
  dirty: boolean
}

/**
 * What asking for a panel in `nextKey` mode should do: open it now, keep the form already open
 * in that mode, or confirm first because switching would discard what was typed.
 */
export function panelSwitchAction(current: PanelSwitchState, nextKey: string): 'open' | 'keep' | 'confirm' {
  if (!current.open) return 'open'
  if (current.modeKey === nextKey) return 'keep'
  return current.dirty ? 'confirm' : 'open'
}
