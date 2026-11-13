import { z } from 'zod'
import { stripHtml } from '@/lib/sanitize'
import { isValidBirthday, leaveHolidayTeamsError, normalizeLeaveHolidayTeams } from '@/lib/leave-holidays'
import type { TeamCatalog } from '@/lib/teams/catalog'

/** Request bodies for the HR holiday and birthday APIs. */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** "YYYY-MM-DD" as a UTC midnight Date, or null when it is not a real calendar day. */
export function parseDateOnly(value: string): Date | null {
  const match = DATE_ONLY.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  const roundTrips = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return roundTrips ? date : null
}

export const leaveHolidayInputSchema = z.object({
  date: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const date = parseDateOnly(value)
      if (!date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid date' })
        return z.NEVER
      }
      return date
    }),
  name: z
    .string()
    .trim()
    .min(1, 'Enter a holiday name')
    .max(120, 'Keep the name under 120 characters')
    .transform((value) => stripHtml(value)),
  // Checked against the HR-managed catalog after parsing (resolveLeaveHolidayTeams).
  teamTags: z.array(z.string().trim().min(1)).min(1, 'Choose at least one team'),
})

/**
 * The teams a holiday is saved with: validated against the catalog, then widened by
 * the Pakistan pairing so what HR sees is what applies. `existing` is the holiday's
 * current teams on edit, so an archived team it already has is kept.
 */
export function resolveLeaveHolidayTeams(
  catalog: TeamCatalog,
  requested: readonly string[],
  existing: readonly string[] = []
): { ok: true; teamTags: string[] } | { ok: false; error: string } {
  const error = leaveHolidayTeamsError(catalog, requested, existing)
  return error ? { ok: false, error } : { ok: true, teamTags: normalizeLeaveHolidayTeams(catalog, requested) }
}

export type LeaveHolidayInput = z.infer<typeof leaveHolidayInputSchema>

export const birthdayInputSchema = z
  .object({
    userId: z.string().trim().min(1, 'Choose a person'),
    month: z.coerce.number().int(),
    day: z.coerce.number().int(),
  })
  .refine((value) => isValidBirthday(value.month, value.day), {
    message: 'Enter a real day for that month',
    path: ['day'],
  })

/** The first readable message from a failed parse, for the UI's toast. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input'
}
