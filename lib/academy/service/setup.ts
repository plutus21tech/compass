import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { ATTRIBUTE_SELECT, setPersonAttributes } from './attributes'
import { describeSetupIssues } from '../labels'
import { recomputeDueDates } from './progress'
import { createChecklist } from './checklist'
import { isAccountInactive } from './shared-reads'
import {
  getSetupReadiness,
  isLeadInputSubmitted,
  leadInputDueAt,
  setupSchema,
  type SetupInput,
  type SetupSnapshot,
} from '../setup'

type Db = PrismaClient | Prisma.TransactionClient

async function requireUsers(db: Db, ids: Array<string | null>, message: string): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))]
  const found = await db.user.count({ where: { id: { in: unique } } })
  if (found !== unique.length) throw new AcademyError(message, 400)
}

function parseSetup(input: unknown, hireUserId: string | null): SetupInput {
  const body = typeof input === 'object' && input !== null ? input : {}
  const parsed = setupSchema.safeParse({ ...body, hireUserId })
  if (!parsed.success) throw new AcademyError(describeSetupIssues(parsed.error), 400)
  return parsed.data
}

/** Same rule as the older new-hire update: the person must exist, have finished onboarding and be active. */
async function requireEligible(db: Db, userId: string, role: string): Promise<void> {
  const candidate = await db.user.findUnique({
    where: { id: userId },
    select: { onboardingCompleted: true },
  })
  if (!candidate) throw new AcademyError(`Invalid ${role}`, 400)
  if (candidate.onboardingCompleted === false) {
    throw new AcademyError(`Selected ${role} must complete onboarding first`, 400)
  }
  if (await isAccountInactive(db, userId)) {
    throw new AcademyError(`Selected ${role} is inactive`, 400)
  }
}

/**
 * Reads, validates and writes in one transaction, so nothing is half-written and the lead-change check
 * cannot race. Attributes go to User once the hire is linked, to NewHire before. Fields may be blank:
 * readiness reports them. Returns whether the team lead should be sent a request for their input:
 * a lead is set, and either no request has gone out yet or the lead changed. The NewHire row lock
 * pairs with releaseCourse, so a moved joining date can never miss a release happening at the same time.
 */
export async function saveSetup(
  db: PrismaClient,
  newHireId: string,
  input: unknown,
  _actorId: string,
): Promise<{ leadRequestNeeded: boolean }> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "NewHire" WHERE id = ${newHireId} FOR UPDATE`
    const hire = await tx.newHire.findUnique({
      where: { id: newHireId },
      select: {
        userId: true,
        teamLeadId: true,
        buddyId: true,
        onboardingDate: true,
        academyReleasedAt: true,
        teamLeadForm: { select: { leadInputDueAt: true } },
      },
    })
    if (!hire) throw new AcademyError('New hire not found', 404)
    const data = parseSetup(input, hire.userId)

    // Eligibility applies only to a person newly chosen, so an already-saved choice never blocks a save.
    const leadChanged = data.teamLeadId !== hire.teamLeadId
    if (data.teamLeadId && leadChanged) await requireEligible(tx, data.teamLeadId, 'team lead')
    if (data.buddyId && data.buddyId !== hire.buddyId) await requireEligible(tx, data.buddyId, 'buddy')
    await requireUsers(tx, [data.teamLeadId], 'Invalid team lead')
    await requireUsers(tx, [data.buddyId], 'Invalid buddy')
    await requireUsers(tx, data.teamMemberIds, 'Invalid team member')

    const dueAt = leadInputDueAt(data.onboardingDate)
    const { attributes, teamMemberIds, ...columns } = data
    await tx.newHire.update({
      where: { id: newHireId },
      data: { ...columns, ...(hire.userId ? {} : attributes) },
    })
    if (hire.userId) await setPersonAttributes(tx, hire.userId, attributes)
    await tx.newHireTeamMember.deleteMany({ where: { newHireId } })
    await tx.newHireTeamMember.createMany({ data: teamMemberIds.map((userId) => ({ newHireId, userId })) })
    await tx.teamLeadForm.upsert({
      where: { newHireId },
      create: { newHireId, leadInputDueAt: dueAt },
      update: { leadInputDueAt: dueAt },
    })
    await createChecklist(tx, newHireId)
    const dateMoved = data.onboardingDate.getTime() !== hire.onboardingDate.getTime()
    if (hire.userId && hire.academyReleasedAt && dateMoved) await recomputeDueDates(tx, hire.userId)
    const noRequestYet = !hire.teamLeadForm?.leadInputDueAt
    return { leadRequestNeeded: data.teamLeadId !== null && (noRequestYet || leadChanged) }
  })
}

export async function loadSetup(db: Db, newHireId: string) {
  const hire = await db.newHire.findUnique({
    where: { id: newHireId },
    include: {
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
    },
  })
  if (!hire) throw new AcademyError('New hire not found', 404)
  const source = hire.user ?? hire
  const setup: SetupSnapshot = {
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
    teamLeadId: hire.teamLeadId,
    teamMemberIds: hire.teamMembers.map((m) => m.userId),
    buddyId: hire.buddyId,
    coreHoursStart: hire.coreHoursStart,
    coreHoursEnd: hire.coreHoursEnd,
    userLinked: hire.userId !== null,
    leadInputSubmitted: isLeadInputSubmitted(hire.teamLeadForm),
  }
  return {
    setup,
    readiness: getSetupReadiness(setup),
    leadInputDueAt: hire.teamLeadForm?.leadInputDueAt ?? null,
    releasedAt: hire.academyReleasedAt,
  }
}
