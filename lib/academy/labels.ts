// Every human label for Academy fields and values, and readable validation messages.
// Pure: no server-only imports, safe for client components.
import type { z } from 'zod'
import type { PersonAttributes } from './attributes'

export const ATTRIBUTE_LABELS: Record<keyof PersonAttributes, string> = {
  officeLocation: 'Office location',
  remoteCountry: 'Remote country',
  workMode: 'Work mode',
  contractType: 'Contract type',
  employmentStatus: 'Employment status',
}

const ATTRIBUTE_VALUE_LABELS: Record<string, string> = {
  KARACHI: 'Karachi',
  CASABLANCA: 'Casablanca',
  BOGOTA: 'Bogota',
  DALLAS: 'Dallas',
  REMOTE: 'Remote',
  OFFICE: 'Office',
  HYBRID: 'Hybrid',
  PK_EMPLOYMENT: 'Pakistan employment contract',
  INDEPENDENT_CONTRACTOR: 'Independent contractor',
  OTHER_EMPLOYMENT: 'Other employment',
  PERMANENT: 'Permanent',
  FIXED_TERM: 'Fixed term',
  INTERN: 'Intern',
}

export function attributeValueLabel(value: string | null | undefined): string {
  if (!value) return 'Not set'
  return ATTRIBUTE_VALUE_LABELS[value] ?? value
}

export const SETUP_FIELD_LABELS = {
  preferredName: 'Preferred name',
  title: 'Job title',
  department: 'Department',
  companyWing: 'Company wing',
  clientAccount: 'Client account',
  onboardingDate: 'Joining date',
  hrCallAt: 'HR call',
  teamCallAt: 'Team call',
  teamLeadId: 'Team lead',
  teamMemberIds: 'Team members',
  buddyId: 'Onboarding buddy',
  coreHoursStart: 'Core hours start',
  coreHoursEnd: 'Core hours end',
  ...ATTRIBUTE_LABELS,
} as const

const LEAD_FIELD_LABELS: Record<string, string> = {
  roleExpectations: 'Role expectations',
  day1Goal: 'Day 1 goal',
  week1Goal: 'Week 1 goal',
  month1Goal: 'Month 1 goal',
  month3Goal: 'Month 3 goal',
  tutorials: 'Tutorials',
  teamTools: 'Team tools',
}

const LEAD_ROW_LABELS: Record<string, string> = { tutorials: 'Tutorial', teamTools: 'Team tool' }
const LEAD_CELL_LABELS: Record<string, string> = { title: 'title', url: 'link', name: 'name', purpose: 'purpose' }

const TIME_HINT = 'must be a time like 09:30'
const DATE_TIME_HINT = 'must be a date and time'

/** What a value of this field should look like, for values that are present but wrong. */
const FORMAT_HINTS: Record<string, string> = {
  onboardingDate: 'must be a date',
  hrCallAt: DATE_TIME_HINT,
  teamCallAt: DATE_TIME_HINT,
  coreHoursStart: TIME_HINT,
  coreHoursEnd: TIME_HINT,
  remoteCountry: 'must be a two-letter code, like ID',
  url: 'must be an https link',
}

type Path = ReadonlyArray<PropertyKey>
type Issue = z.ZodError['issues'][number]

const FALLBACK_LABEL = 'One of the values'

function fieldOf(path: Path): string | undefined {
  return [...path].reverse().find((key): key is string => typeof key === 'string')
}

function isMissing(issue: Issue): boolean {
  if (issue.code === 'too_small') return true
  return issue.code === 'invalid_type' && /received (undefined|null)$/.test(issue.message)
}

function sentence(label: string, field: string | undefined, issue: Issue): string {
  if (issue.code === 'custom') return issue.message
  if (issue.code === 'too_big') return `${label} is too long.`
  if (isMissing(issue)) return `${label} is required.`
  const hint = field ? FORMAT_HINTS[field] : undefined
  return hint ? `${label} ${hint}.` : `${label} is not valid.`
}

function describe(error: z.ZodError, labelOf: (path: Path) => string | undefined): string {
  const sentences = error.issues.map((issue) => sentence(labelOf(issue.path) ?? FALLBACK_LABEL, fieldOf(issue.path), issue))
  return [...new Set(sentences)].join(' ')
}

export function describeSetupIssues(error: z.ZodError): string {
  const labels: Record<string, string> = SETUP_FIELD_LABELS
  return describe(error, (path) => labels[fieldOf(path) ?? ''])
}

function leadLabel([list, index, cell]: Path): string | undefined {
  if (typeof list !== 'string') return undefined
  const row = LEAD_ROW_LABELS[list]
  if (!row || typeof index !== 'number') return LEAD_FIELD_LABELS[list]
  const cellLabel = typeof cell === 'string' ? LEAD_CELL_LABELS[cell] : undefined
  return cellLabel ? `${row} ${index + 1} ${cellLabel}` : `${row} ${index + 1}`
}

export function describeLeadIssues(error: z.ZodError): string {
  return describe(error, leadLabel)
}
