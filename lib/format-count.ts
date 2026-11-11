/** Counts in words for employee pages: "5 days left of 10", "3 of 5". */

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function dayWord(value: number): string {
  return value === 1 ? 'day' : 'days'
}

/** "1 day", "0.5 days", "4.5 days". */
export function formatDays(days: number): string {
  return `${formatNumber(days)} ${dayWord(days)}`
}

/** The phrase after the number, for components that render the number themselves. */
export function daysLeftSuffix(left: number, total: number): string {
  return `${dayWord(left)} left of ${formatNumber(total)}`
}

/** "5 days left of 10", or "None left of 6". */
export function formatDaysLeft(left: number, total: number): string {
  if (left <= 0) return `None left of ${formatNumber(total)}`
  return `${formatNumber(left)} ${daysLeftSuffix(left, total)}`
}

/** "3 of 5". */
export function formatCountOf(done: number, total: number): string {
  return `${formatNumber(done)} of ${formatNumber(total)}`
}
