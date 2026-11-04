// Pure rules: no server-only imports. Safe for client components.
import { z } from 'zod'
import type {
  ContractType,
  EmploymentStatus,
  OfficeLocation,
  TeamTag,
  WorkMode,
} from '@prisma/client'

export const OFFICE_LOCATIONS = ['KARACHI', 'CASABLANCA', 'BOGOTA', 'DALLAS', 'REMOTE'] as const satisfies readonly OfficeLocation[]
export const WORK_MODES = ['OFFICE', 'HYBRID', 'REMOTE'] as const satisfies readonly WorkMode[]
export const CONTRACT_TYPES = ['PK_EMPLOYMENT', 'INDEPENDENT_CONTRACTOR', 'OTHER_EMPLOYMENT'] as const satisfies readonly ContractType[]
export const EMPLOYMENT_STATUSES = ['PERMANENT', 'FIXED_TERM', 'INTERN'] as const satisfies readonly EmploymentStatus[]

export interface PersonAttributes {
  officeLocation: OfficeLocation | null
  remoteCountry: string | null
  workMode: WorkMode | null
  contractType: ContractType | null
  employmentStatus: EmploymentStatus | null
}

const OFFICE_COUNTRY: Record<Exclude<OfficeLocation, 'REMOTE'>, string> = {
  KARACHI: 'PK',
  CASABLANCA: 'MA',
  BOGOTA: 'CO',
  DALLAS: 'US',
}

const COUNTRY_CODE = /^[A-Z]{2}$/

export const personAttributesSchema: z.ZodType<PersonAttributes, unknown> = z
  .object({
    officeLocation: z.enum(OFFICE_LOCATIONS).nullable(),
    remoteCountry: z.string().regex(COUNTRY_CODE).nullable().default(null),
    workMode: z.enum(WORK_MODES).nullable(),
    contractType: z.enum(CONTRACT_TYPES).nullable(),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.officeLocation === 'REMOTE' && !v.remoteCountry) {
      ctx.addIssue({ code: 'custom', path: ['remoteCountry'], message: 'remoteCountry is required for REMOTE' })
    }
  })
  .transform((v): PersonAttributes => ({
    ...v,
    remoteCountry: v.officeLocation === 'REMOTE' ? v.remoteCountry : null,
  }))

export function countryOf(a: Pick<PersonAttributes, 'officeLocation' | 'remoteCountry'>): string | null {
  if (!a.officeLocation) return null
  if (a.officeLocation === 'REMOTE') return a.remoteCountry ?? null
  return OFFICE_COUNTRY[a.officeLocation]
}

export function missingAttributes(a: PersonAttributes): Array<keyof PersonAttributes> {
  const missing: Array<keyof PersonAttributes> = []
  if (!a.officeLocation) missing.push('officeLocation')
  if (a.officeLocation === 'REMOTE' && !a.remoteCountry) missing.push('remoteCountry')
  if (!a.workMode) missing.push('workMode')
  if (!a.contractType) missing.push('contractType')
  if (!a.employmentStatus) missing.push('employmentStatus')
  return missing
}

const TAG_PREFILL: Partial<Record<TeamTag, Partial<PersonAttributes>>> = {
  PAKISTAN: { officeLocation: 'KARACHI' },
  MOROCCO: { officeLocation: 'CASABLANCA' },
  COLOMBIA: { officeLocation: 'BOGOTA' },
  INDONESIA: { officeLocation: 'REMOTE', remoteCountry: 'ID' },
  ECUADOR: { officeLocation: 'REMOTE', remoteCountry: 'EC' },
}

/** A suggestion only; HR confirms. */
export function prefillFromTeamTag(
  teamTag: TeamTag | null,
  payrollEmploymentTypeName: string | null,
): Partial<PersonAttributes> {
  const base: Partial<PersonAttributes> = teamTag ? { ...(TAG_PREFILL[teamTag] ?? {}) } : {}
  const name = payrollEmploymentTypeName ?? ''
  if (/contract/i.test(name)) return { ...base, contractType: 'INDEPENDENT_CONTRACTOR' }
  if (teamTag === 'PAKISTAN' && /permanent|employ/i.test(name)) return { ...base, contractType: 'PK_EMPLOYMENT' }
  return base
}
