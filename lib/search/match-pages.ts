import type { SearchPage } from '@/components/layout/sidebar-config'

function rank(page: SearchPage, q: string): number | null {
  const label = page.label.toLowerCase()
  if (label.startsWith(q)) return 0
  if (label.includes(q)) return 1
  if (page.keywords.some((k) => k.toLowerCase().includes(q))) return 2
  if (page.section.toLowerCase().includes(q)) return 3
  return null
}

/** Pages whose label, keywords or section match the query, best first; menu order within a rank. */
export function matchPages(pages: readonly SearchPage[], query: string, limit = 8): SearchPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return pages.slice(0, limit)
  return pages
    .map((page, index) => ({ page, index, r: rank(page, q) }))
    .filter((x): x is { page: SearchPage; index: number; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.page)
}
