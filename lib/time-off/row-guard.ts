/** Marks a row busy; null when it already is, so a second click can be ignored. */
export const beginRow = (busy: ReadonlySet<string>, id: string): ReadonlySet<string> | null =>
  busy.has(id) ? null : new Set([...busy, id])

export const endRow = (busy: ReadonlySet<string>, id: string): ReadonlySet<string> =>
  new Set([...busy].filter((x) => x !== id))
