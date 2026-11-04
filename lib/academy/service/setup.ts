import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { ATTRIBUTE_SELECT, setPersonAttributes } from './attributes'
import { formatZodIssues } from '../profile-input'
import { getSetupReadiness, leadInputDueAt, setupSchema, type SetupInput, type SetupSnapshot } from '../setup'

type Db = PrismaClient | Prisma.TransactionClient

async function requireUsers(db: Db, ids: string[], message: string): Promise<void> {
  const unique = [...new Set(ids)]
  const found = await db.user.count({ where: { id: { in: unique } } })
  if (found !== unique.length) throw new AcademyError(message, 400)
}

function parseSetup(input: unknown, hireUserId: string | null): SetupInput {
  const body = typeof input === 'object' && input !== null ? input : {}
  const parsed = setupSchema.safeParse({ ...body, hireUserId })
  if (!parsed.success) throw new AcademyError(formatZodIssues(parsed.error), 400)
  return parsed.data
}

/**
 * Validates everything first, then writes in one transaction. Attributes go to User once the hire is linked,
 * to NewHire before. Returns whether the team lead should be sent a request for their input.
 */
export async function saveSetup(
  db: PrismaClient,
  newHireId: string,
  input: unknown,
  _actorId: string,
): Promise<{ leadRequestNeeded: boolean }> {
  const hire = await db.newHire.findUnique({
    where: { id: newHireId },
    select: { userId: true, teamLeadId: true, teamLeadForm: { select: { leadInputDueAt: true } } },
  })
  if (!hire) throw new AcademyError('New hire not found', 404)
  const data = parseSetup(input, hire.userId)
  await requireUsers(db, [data.teamLeadId], 'Invalid team lead')
  await requireUsers(db, [data.buddyId], 'Invalid buddy')
  await requireUsers(db, data.teamMemberIds, 'Invalid team member')

  const dueAt = leadInputDueAt(data.onboardingDate)
  const { attributes, teamMemberIds, ...columns } = data
  await db.$transaction(async (tx) => {
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
  })
  const firstSave = !hire.teamLeadForm?.leadInputDueAt
  return { leadRequestNeeded: firstSave || hire.teamLeadId !== data.teamLeadId }
}

export async function loadSetup(db: PrismaClient, newHireId: string) {
  const hire = await db.newHire.findUnique({
    where: { id: newHireId },
    include: {
      teamMembers: { select: { userId: true } },
      teamLeadForm: { select: { submittedAt: true, leadInputDueAt: true } },
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
    leadInputSubmitted: hire.teamLeadForm?.submittedAt != null,
  }
  return { setup, readiness: getSetupReadiness(setup), leadInputDueAt: hire.teamLeadForm?.leadInputDueAt ?? null }
}
