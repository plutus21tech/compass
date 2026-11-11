export const SEARCH_MIN = 2
export const SEARCH_MAX = 64

/** Trim, collapse inner whitespace, drop too-short queries, cut to the maximum length. */
export function parseSearchQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const collapsed = raw.trim().replace(/\s+/g, ' ')
  if (collapsed.length < SEARCH_MIN) return null
  return collapsed.slice(0, SEARCH_MAX).trim()
}
