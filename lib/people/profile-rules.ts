import { z } from 'zod'
import { leaveDateKey } from '../leave-utils'
import type { CompensationDomain } from '../analytics/employee-360-contracts'

/**
 * A person's profile: the shapes the page and API share, and the pure rules behind them.
 * No database access here, so the client can import it.
 */

export const PROFILE_LEAVE_SHOWN = 5
export const PROFILE_PROJECTS_SHOWN = 8
export const PROFILE_DETAIL_MAX = 600

export interface ProfileAvatar {
  skinTone: string | null
  bodyFrame: string | null
  outfitType: string | null
  outfitColor: string | null
  outfitAccentColor: string | null
  hairCategory: string | null
  hairColor: string | null
  headCoveringType: string | null
  headCoveringColor: string | null
  accessories: string[]
}

export interface ProfileLeave {
  id: string
  leaveType: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  isHalfDay: boolean
  ongoing: boolean
}

export interface ProfileProject {
  id: string
  name: string
  role: string
}

export interface ProfileDetails {
  bio: string | null
  hobbies: string | null
  funFact: string | null
  askMeAbout: string | null
}

export const EMPTY_PROFILE_DETAILS: ProfileDetails = { bio: null, hobbies: null, funFact: null, askMeAbout: null }

/** The "about me" fields, in display order. Each person fills in their own. */
export const PROFILE_DETAIL_FIELDS: readonly { key: keyof ProfileDetails; label: string; hint: string }[] = [
  { key: 'bio', label: 'About me', hint: 'A few lines about you and what you do.' },
  { key: 'hobbies', label: 'Outside work', hint: 'Hobbies, sports, shows, games.' },
  { key: 'funFact', label: 'Fun fact', hint: 'Something most people here do not know.' },
  { key: 'askMeAbout', label: 'Ask me about', hint: 'Topics you are happy to help with.' },
]

export interface PersonProfile {
  id: string
  name: string
  position: string | null
  department: string | null
  teamLabel: string | null
  email: string | null
  discordId: string | null
  discordUsername: string | null
  linkedinUrl: string | null
  avatar: ProfileAvatar
  leave: ProfileLeave[]
  projects: ProfileProject[]
  details: ProfileDetails
  isSelf: boolean
  /** HR and OA only. The pay itself comes from a separate, separately checked request. */
  canSeeCompensation: boolean
}

export type ProfileCompensation = CompensationDomain

export const profilePath = (personId: string): string => `/people/${encodeURIComponent(personId)}`

export interface ProfileLeaveRow {
  id: string
  leaveType: string
  status: string
  startDate: Date
  endDate: Date
  isHalfDay: boolean
}

/** Approved leave that is running today or still to come, soonest first. */
export function pickProfileLeave(rows: readonly ProfileLeaveRow[], todayKey: string): ProfileLeave[] {
  return rows
    .filter((row) => row.status === 'APPROVED')
    .map((row) => {
      const startDate = leaveDateKey(row.startDate)
      const endDate = leaveDateKey(row.endDate)
      return {
        id: row.id,
        leaveType: row.leaveType,
        startDate,
        endDate,
        isHalfDay: row.isHalfDay,
        ongoing: startDate <= todayKey && todayKey <= endDate,
      }
    })
    .filter((leave) => leave.endDate >= todayKey)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id))
    .slice(0, PROFILE_LEAVE_SHOWN)
}

const detailField = z
  .string()
  .trim()
  .max(PROFILE_DETAIL_MAX, `Keep each answer under ${PROFILE_DETAIL_MAX} characters.`)
  .nullish()
  .transform((value) => (value ? value : null))

export const profileDetailsSchema = z.object({
  bio: detailField,
  hobbies: detailField,
  funFact: detailField,
  askMeAbout: detailField,
})

export function hasProfileDetails(details: ProfileDetails): boolean {
  return PROFILE_DETAIL_FIELDS.some((field) => Boolean(details[field.key]))
}
