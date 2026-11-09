import { z } from 'zod'
import { TEAM_TAG_CODE_MAX_LENGTH, TEAM_TAG_CODE_PATTERN } from './catalog'

/** Request shapes for HR's team-tag management. Pure, so they are unit-tested. */

const label = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(60, 'Name must be 60 characters or fewer')

const shortLabel = z
  .string()
  .trim()
  .max(8, 'Short name must be 8 characters or fewer')
  .transform((value) => value || null)
  .nullable()
  .optional()

export const teamTagCodeSchema = z
  .string()
  .trim()
  .min(1, 'Code is required')
  .max(TEAM_TAG_CODE_MAX_LENGTH, `Code must be ${TEAM_TAG_CODE_MAX_LENGTH} characters or fewer`)
  .regex(
    TEAM_TAG_CODE_PATTERN,
    'Code must be capital letters, digits and underscores, starting with a letter (e.g. BOSNIA)'
  )

export const createTeamTagSchema = z.object({
  code: teamTagCodeSchema,
  label,
  shortLabel,
  isInternal: z.boolean().default(true),
})

export const updateTeamTagSchema = z
  .object({
    code: teamTagCodeSchema,
    label: label.optional(),
    shortLabel,
    isInternal: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.label !== undefined ||
      value.shortLabel !== undefined ||
      value.isInternal !== undefined ||
      value.archived !== undefined,
    { message: 'Nothing to update' }
  )

export const reorderTeamTagsSchema = z.object({
  order: z
    .array(teamTagCodeSchema)
    .min(1, 'Order is required')
    .refine((codes) => new Set(codes).size === codes.length, 'Order lists a tag twice'),
})

export type CreateTeamTagInput = z.infer<typeof createTeamTagSchema>
export type UpdateTeamTagInput = z.infer<typeof updateTeamTagSchema>

/** The first validation message, phrased for HR rather than as a zod dump. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request'
}
