import type { PrismaClient, UserRole } from '@prisma/client'
import { isWeeklyTestDatabase, WEEKLY_DB_READY } from './weekly-test-db'

/** Same guard as the weekly suite: only the local compass_weekly_test database. */
export const ACADEMY_DB_TEST: { skip: string | false } = {
  skip: WEEKLY_DB_READY ? false : 'Set WEEKLY_DB_TEST=true and DATABASE_URL to the local compass_weekly_test database',
}

export interface AcademyTestPerson { id: string; name: string; role: UserRole; email: string }

/** Fictional people only: the repository is public. */
export const P: Record<'hr' | 'oa' | 'lead' | 'buddy' | 'staff' | 'hire', AcademyTestPerson> = {
  hr: { id: 'act-hr', name: 'Hana Reyes', role: 'HR', email: 'act-hr@example.test' },
  oa: { id: 'act-oa', name: 'Omar Aldana', role: 'OA', email: 'act-oa@example.test' },
  lead: { id: 'act-lead', name: 'Layla Mercer', role: 'EMPLOYEE', email: 'act-lead@example.test' },
  buddy: { id: 'act-buddy', name: 'Ben Okafor', role: 'EMPLOYEE', email: 'act-buddy@example.test' },
  staff: { id: 'act-staff', name: 'Ana Torvik', role: 'EMPLOYEE', email: 'act-staff@example.test' },
  hire: { id: 'act-hire', name: 'Cara Lindqvist', role: 'EMPLOYEE', email: 'act-hire@example.test' },
}

/** Deletes only rows with ids prefixed 'act-'. */
export async function resetAcademyFixtures(db: PrismaClient): Promise<void> {
  if (!isWeeklyTestDatabase(process.env.DATABASE_URL)) throw new Error('Refusing to reset a database that is not compass_weekly_test')
  await db.newHire.deleteMany({ where: { id: { startsWith: 'act-' } } })
  await db.onboardingKeyContact.deleteMany({ where: { id: { startsWith: 'act-' } } })
  await db.payrollPublicHoliday.deleteMany({ where: { id: { startsWith: 'act-' } } })
  await db.payrollTravelAllowanceTier.deleteMany({ where: { id: { startsWith: 'act-' } } })
  await db.position.deleteMany({ where: { id: { startsWith: 'act-' } } })
  await db.payrollEmployeeProfile.deleteMany({ where: { userId: { startsWith: 'act-' } } })
  await db.onboardingPaymentRevealLog.deleteMany({ where: { paymentUserId: { startsWith: 'act-' } } })
  await db.user.deleteMany({ where: { id: { startsWith: 'act-' } } })
}
