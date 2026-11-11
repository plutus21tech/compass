export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform)
}

export function shortcutLabel(isMac: boolean): 'Ctrl K' | '⌘K' {
  return isMac ? '⌘K' : 'Ctrl K'
}

/** Ctrl+K or Cmd+K (either on any platform), never with Alt. */
export function isPaletteShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey
}
