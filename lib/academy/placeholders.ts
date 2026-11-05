// Pure rules: no server-only imports. Safe for client components.

export const PLACEHOLDER_KEYS = [
  'preferred name',
  'title',
  'department',
  'location',
  'lead first name',
  'core hours',
  'overlap local time',
  'blockers local time',
  'security contacts',
  'accounts contacts',
  'bank name',
  'day 1 goal',
  'week 1 goal',
  'month 1 goal',
  'month 3 goal',
] as const

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number]

const PLACEHOLDER = /\{([^{}]+)\}/g
const KNOWN = new Set<string>(PLACEHOLDER_KEYS)

/** Replaces every {name} with its value; a missing or unknown name renders as empty. */
export function renderPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(PLACEHOLDER, (_match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : '',
  )
}

/** Names used in {braces} that are not in PLACEHOLDER_KEYS, each listed once. */
export function findUnknownPlaceholders(text: string): string[] {
  const names = Array.from(text.matchAll(PLACEHOLDER), (m) => m[1])
  return Array.from(new Set(names.filter((name) => !KNOWN.has(name))))
}
