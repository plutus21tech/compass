import type { Prisma, PrismaClient, TeamTag } from '@prisma/client'
import type { CommuteRow } from '../view'

// The only reads onboarding makes of tables that belong to payroll: read-only lookups of shared data,
// selecting only the columns needed. Nothing here reads any person's pay or bank data, and onboarding
// never writes to these tables.

type Db = PrismaClient | Prisma.TransactionClient

/** The company holiday calendar for a team, from a date onward. */
export async function companyHolidayDates(db: Db, team: TeamTag, from: Date): Promise<Date[]> {
  const holidays = await db.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: from }, OR: [{ teamTags: { isEmpty: true } }, { teamTags: { has: team } }] },
    select: { holidayDate: true },
  })
  return holidays.map((holiday) => holiday.holidayDate)
}

/** Company travel allowance tiers in force today. A tier stays in force through the whole of its last day. */
export async function commuteRatesInForce(db: Db, now: Date): Promise<CommuteRow[]> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return db.payrollTravelAllowanceTier.findMany({
    where: { isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
    orderBy: [{ transportMode: 'asc' }, { minKm: 'asc' }],
    select: { transportMode: true, minKm: true, maxKm: true, monthlyRate: true },
  })
}

/** Whether an account is marked inactive: the column is where Compass stores that. No profile means not. */
export async function isAccountInactive(db: Db, userId: string): Promise<boolean> {
  const profile = await db.payrollEmployeeProfile.findUnique({ where: { userId }, select: { isPayrollActive: true } })
  return profile?.isPayrollActive === false
}
