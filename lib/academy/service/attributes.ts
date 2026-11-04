import type { Prisma, PrismaClient } from '@prisma/client'
import { personAttributesSchema, type PersonAttributes } from '../attributes'

type Db = PrismaClient | Prisma.TransactionClient

export const ATTRIBUTE_SELECT = {
  officeLocation: true,
  remoteCountry: true,
  workMode: true,
  contractType: true,
  employmentStatus: true,
} as const

export async function getPersonAttributes(db: Db, userId: string): Promise<PersonAttributes> {
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: ATTRIBUTE_SELECT })
}

/** Validates the whole set (a ZodError on bad input) and saves it. HR-only is enforced by the caller. */
export async function setPersonAttributes(db: Db, userId: string, input: unknown): Promise<PersonAttributes> {
  const attributes = personAttributesSchema.parse(input)
  return db.user.update({ where: { id: userId }, data: attributes, select: ATTRIBUTE_SELECT })
}

/** Links a new hire's setup to the freshly created account by copying the attributes. */
export async function copySetupToUser(tx: Prisma.TransactionClient, newHireId: string, userId: string): Promise<void> {
  const attributes = await tx.newHire.findUniqueOrThrow({ where: { id: newHireId }, select: ATTRIBUTE_SELECT })
  await tx.user.update({ where: { id: userId }, data: attributes })
}

/**
 * The payroll step of creating a new hire's account, run after copySetupToUser. Contractors never get
 * a payroll profile, so their write is skipped. A Pakistan employee's profile, once written, gets the
 * joining date from setup if it has none. This function itself never creates a profile.
 */
export async function finishNewHireLink(
  db: PrismaClient,
  args: { newHireId: string; userId: string; writePayrollProfile: (() => Promise<void>) | null },
): Promise<void> {
  const { contractType } = await db.user.findUniqueOrThrow({ where: { id: args.userId }, select: { contractType: true } })
  if (contractType === 'INDEPENDENT_CONTRACTOR') return
  await args.writePayrollProfile?.()
  if (contractType !== 'PK_EMPLOYMENT') return
  const { onboardingDate } = await db.newHire.findUniqueOrThrow({ where: { id: args.newHireId }, select: { onboardingDate: true } })
  await db.payrollEmployeeProfile.updateMany({
    where: { userId: args.userId, joiningDate: null },
    data: { joiningDate: onboardingDate },
  })
}
