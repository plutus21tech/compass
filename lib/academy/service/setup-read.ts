import type { Prisma } from '@prisma/client'
import { isLeadInputSubmitted, type SetupSnapshot } from '../setup'
import { ATTRIBUTE_SELECT } from './attributes'

/** What a setup snapshot is built from, so one hire and a whole list are read the same way. */
export const SETUP_INCLUDE = {
  teamMembers: { select: { userId: true } },
  teamLeadForm: {
    select: {
      submittedAt: true,
      leadInputDueAt: true,
      roleExpectations: true,
      day1Goal: true,
      week1Goal: true,
      month1Goal: true,
      month3Goal: true,
      tutorials: true,
      teamTools: true,
    },
  },
  user: { select: ATTRIBUTE_SELECT },
} satisfies Prisma.NewHireInclude

type SetupHireRow = Prisma.NewHireGetPayload<{ include: typeof SETUP_INCLUDE }>

export function toSetupSnapshot(hire: SetupHireRow): SetupSnapshot {
  const source = hire.user ?? hire
  return {
    preferredName: hire.preferredName,
    title: hire.title,
    department: hire.department,
    companyWing: hire.companyWing,
    clientAccount: hire.clientAccount,
    attributes: {
      officeLocation: source.officeLocation,
      remoteCountry: source.remoteCountry,
      workMode: source.workMode,
      contractType: source.contractType,
      employmentStatus: source.employmentStatus,
    },
    onboardingDate: hire.onboardingDate,
    hrCallAt: hire.hrCallAt,
    teamCallAt: hire.teamCallAt,
    securityCallAt: hire.securityCallAt,
    teamLeadId: hire.teamLeadId,
    teamMemberIds: hire.teamMembers.map((m) => m.userId),
    buddyId: hire.buddyId,
    coreHoursStart: hire.coreHoursStart,
    coreHoursEnd: hire.coreHoursEnd,
    userLinked: hire.userId !== null,
    leadInputSubmitted: isLeadInputSubmitted(hire.teamLeadForm),
  }
}
