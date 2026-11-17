import type { PayrollPeriodStatus, PayrollReceiptStatus, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  FINALIZED_PAYROLL_PERIOD_STATUSES,
  USABLE_PAYROLL_RECEIPT_STATUSES,
  buildCompensationTrajectory,
  extractBasicSalary,
} from '@/lib/analytics/employee-360'
import type { CompensationDomain } from '@/lib/analytics/employee-360-contracts'

/**
 * One person's basic-salary history, for HR and OA on the profile page.
 *
 * Read-only, and the same reading Employee 360 gives: finalized payroll receipts only,
 * collapsed into step changes. Nothing is written to payroll and nothing is copied out
 * of it. The caller must have checked canManagePayroll first.
 */
export async function loadProfileCompensation(
  personId: string,
  db: PrismaClient = prisma
): Promise<CompensationDomain> {
  const receipts = await db.payrollReceipt.findMany({
    where: {
      userId: personId,
      status: { in: [...USABLE_PAYROLL_RECEIPT_STATUSES] as PayrollReceiptStatus[] },
      period: { status: { in: [...FINALIZED_PAYROLL_PERIOD_STATUSES] as PayrollPeriodStatus[] } },
    },
    select: {
      status: true,
      receiptJson: true,
      period: { select: { id: true, label: true, currency: true, periodStart: true, status: true } },
    },
    orderBy: { period: { periodStart: 'asc' } },
  })

  return buildCompensationTrajectory(
    receipts.flatMap((receipt) => {
      const amount = extractBasicSalary(receipt.receiptJson)
      if (amount === null) return []
      return [
        {
          effectiveFrom: receipt.period.periodStart.toISOString(),
          amount,
          currency: receipt.period.currency,
          periodId: receipt.period.id,
          periodName: receipt.period.label,
          periodStatus: receipt.period.status,
          receiptStatus: receipt.status,
        },
      ]
    })
  )
}
