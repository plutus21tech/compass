// Pure rules for HR's "Preview as". No server-only imports: safe for client components.
import { z } from 'zod'
import { CONTRACT_TYPES, EMPLOYMENT_STATUSES, OFFICE_LOCATIONS, WORK_MODES, type PersonAttributes } from './attributes'
import { COMPANY_WINGS, type ConditionFacts } from './blocks'
import type { PlaceholderKey } from './placeholders'
import type { ModuleView, PersonView, TeamToolView, TutorialLink } from './view'

export const PREVIEW_SOURCES = ['draft', 'live'] as const
export type PreviewSource = (typeof PREVIEW_SOURCES)[number]

const COUNTRY_CODE = /^[A-Z]{2}$/

/**
 * The facts HR picks. Unlike a real person's attributes, a remote preview may leave the country out:
 * that is how HR sees what a hire with an unfinished record is shown. A client account is only yes or no.
 */
export const previewFactsSchema = z
  .object({
    officeLocation: z.enum(OFFICE_LOCATIONS).default('KARACHI'),
    remoteCountry: z.string().regex(COUNTRY_CODE, 'Use a two-letter country code, like ID.').nullable().default(null),
    workMode: z.enum(WORK_MODES).default('OFFICE'),
    contractType: z.enum(CONTRACT_TYPES).default('PK_EMPLOYMENT'),
    employmentStatus: z.enum(EMPLOYMENT_STATUSES).default('PERMANENT'),
    companyWing: z.enum(COMPANY_WINGS).default('PARTNERS'),
    clientAccount: z.boolean().default(false),
  })
  .strict()

export type PreviewFacts = z.infer<typeof previewFactsSchema>

export const previewRequestSchema = z
  .object({ source: z.enum(PREVIEW_SOURCES), facts: previewFactsSchema.prefault({}) })
  .strict()

export type PreviewRequest = z.infer<typeof previewRequestSchema>

export const DEFAULT_PREVIEW_FACTS: PreviewFacts = previewFactsSchema.parse({})

/** Stands in for an account name when the preview says the hire has one. */
const SAMPLE_CLIENT_ACCOUNT = '[client account]'

export function previewAttributes(facts: PreviewFacts): PersonAttributes {
  return {
    officeLocation: facts.officeLocation,
    remoteCountry: facts.officeLocation === 'REMOTE' ? facts.remoteCountry : null,
    workMode: facts.workMode,
    contractType: facts.contractType,
    employmentStatus: facts.employmentStatus,
  }
}

export function previewConditions(facts: PreviewFacts): ConditionFacts {
  return {
    attributes: previewAttributes(facts),
    clientAccount: facts.clientAccount ? SAMPLE_CLIENT_ACCOUNT : null,
    companyWing: facts.companyWing,
  }
}

const samplePerson = (id: string, name: string): PersonView => ({
  id: `sample-${id}`, name, title: null, discordUsername: null, photoUrl: null, email: null,
})

/** Labelled samples in place of anything set per hire. Nothing here is a real person or a real hire's data. */
export const PREVIEW_SAMPLES = {
  name: 'New hire',
  preferredName: '[preferred name]',
  title: '[title]',
  department: '[department]',
  lead: samplePerson('lead', 'Your team lead'),
  buddy: samplePerson('buddy', 'Your buddy'),
  team: [samplePerson('teammate-1', 'A teammate'), samplePerson('teammate-2', 'Another teammate')],
  roleExpectations: '[Role expectations, from the team lead]',
  goals: {
    day1Goal: '[Day 1 goal, from the team lead]',
    week1Goal: '[Week 1 goal, from the team lead]',
    month1Goal: '[Month 1 goal, from the team lead]',
    month3Goal: '[Month 3 goal, from the team lead]',
  },
  tutorials: [
    { key: 'sample-tutorial-1', title: '[A tutorial from the team lead]', url: '' },
    { key: 'sample-tutorial-2', title: '[Another tutorial from the team lead]', url: '' },
  ] satisfies TutorialLink[],
  teamTools: [{ name: '[A tool the team uses]', purpose: '[What the team uses it for]', url: null }] satisfies TeamToolView[],
  /** Placeholders a sample can't fill from the fields above. */
  placeholders: { 'lead first name': '[lead first name]', 'core hours': '[core hours]' } satisfies Partial<Record<PlaceholderKey, string>>,
} as const

export interface PreviewView {
  /** What was shown: a draft preview with no saved draft shows the live version. */
  showing: PreviewSource
  /** The live version's number. */
  version: number
  /** Rendered as a new hire with these facts would see it, from samples and shared lists only. */
  module: ModuleView
  /** {Names} in this version, in any branch, that aren't placeholders: they render as nothing. */
  unknownPlaceholders: string[]
}
