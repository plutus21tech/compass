import type { Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import type { NewUserOnboarding } from '../new-user-onboarding'
import { copySetupToUser } from './attributes'
import { releaseCourse } from './course'
import { saveSetup } from './setup'

export interface HireForUserInput {
  userId: string
  name: string
  email: string
  title: string
  department: string | null
  onboarding: NewUserOnboarding
}

/**
 * Creates the hire record behind a user HR created with "requires onboarding" ticked, inside the same
 * transaction as the user. A NewHire always hangs off a Position, so a closed one is created for it.
 * Attributes go on the hire and are copied to the user, as the link path does. Returns the hire's id.
 */
export async function createHireForUser(tx: Prisma.TransactionClient, input: HireForUserInput): Promise<string> {
  const now = new Date()
  const position = await tx.position.create({
    data: { title: input.title, department: input.department, status: 'CLOSED', closedAt: now },
    select: { id: true },
  })
  const hire = await tx.newHire.create({
    data: {
      positionId: position.id,
      name: input.name,
      title: input.title,
      department: input.department,
      email: input.email,
      onboardingDate: input.onboarding.joiningDate,
      userId: input.userId,
      status: 'ONBOARDING',
      ...input.onboarding.attributes,
    },
    select: { id: true },
  })
  await copySetupToUser(tx, hire.id, input.userId)
  return hire.id
}

export type StartOnboardingResult = { released: true; releasedAt: Date } | { released: false; reason: string }

/**
 * Runs after the user exists. For a hire Compass just created, saves the setup (which creates the team lead
 * form and the HR checklist, as a first setup save does). Then releases the course with the tracker's own
 * service. A release that isn't possible yet, such as a linked record still missing a required field, is
 * reported rather than thrown: the user is created either way and HR can release later from the tracker.
 */
export async function startOnboarding(
  db: PrismaClient,
  newHireId: string,
  actorId: string,
  firstSetup: { title: string; department: string | null; onboarding: NewUserOnboarding } | null,
): Promise<StartOnboardingResult> {
  try {
    if (firstSetup) {
      await saveSetup(db, newHireId, {
        title: firstSetup.title,
        department: firstSetup.department,
        attributes: firstSetup.onboarding.attributes,
        onboardingDate: firstSetup.onboarding.joiningDate.toISOString(),
      }, actorId)
    }
    const { releasedAt } = await releaseCourse(db, newHireId, actorId)
    return { released: true, releasedAt }
  } catch (error) {
    if (error instanceof AcademyError && error.status < 500) return { released: false, reason: error.message }
    console.error('[academy] onboarding could not be started for a new user', {
      newHireId,
      error: error instanceof Error ? error.name : 'unknown',
    })
    return { released: false, reason: "The course couldn't be released. Release it from the new-hire page." }
  }
}
