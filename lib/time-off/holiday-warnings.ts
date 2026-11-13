/**
 * Public holidays are loaded per month while someone picks dates. A month that fails should warn
 * once per page session, not again on every date change. Returns a new set; never mutates `warned`.
 */
export function notePublicHolidayFailures(
  warned: ReadonlySet<string>,
  failedMonths: readonly string[]
): { warn: boolean; warned: ReadonlySet<string> } {
  const fresh = failedMonths.filter((month) => !warned.has(month))
  if (fresh.length === 0) return { warn: false, warned }
  return { warn: true, warned: new Set([...warned, ...fresh]) }
}
