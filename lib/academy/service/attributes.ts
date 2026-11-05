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
