// A person's own evaluation results, for the My results tab. Read-only.
// Only quarters that were released to them, and only scores: evaluator names and written feedback are never selected.
import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isReleased, quarterResult, type MyResultsResponse } from '../my-results'

export async function myResults(userId: string, db: PrismaClient = prisma): Promise<MyResultsResponse> {
  const reports = await db.report.findMany({
    where: { employeeId: userId },
    select: {
      periodId: true,
      overallScore: true,
      breakdownJson: true,
      period: { select: { name: true, startDate: true } },
      emailQueue: { where: { emailStatus: 'SENT' }, orderBy: { sentAt: 'desc' }, take: 1, select: { sentAt: true } },
    },
  })
  if (reports.length === 0) return { quarters: [], preparing: null }

  const cycles = await db.weeklyCycle.findMany({
    where: { periodId: { in: reports.map((r) => r.periodId) } },
    select: { periodId: true, resultsPublishedAt: true },
  })
  const publishedAt = new Map(cycles.map((c) => [c.periodId, c.resultsPublishedAt]))

  const newestFirst = [...reports].sort((a, b) => b.period.startDate.getTime() - a.period.startDate.getTime())
  const released = newestFirst.filter((r) =>
    isReleased({ emailSent: r.emailQueue.length > 0, resultsPublishedAt: publishedAt.get(r.periodId) ?? null })
  )
  // Only a quarter newer than anything released counts as "being prepared".
  const newest = newestFirst[0]
  const preparing = released.includes(newest) ? null : newest.period.name

  return {
    quarters: released.map((r) =>
      quarterResult({
        periodId: r.periodId,
        periodName: r.period.name,
        overallScore: r.overallScore,
        breakdownJson: r.breakdownJson,
        emailedAt: r.emailQueue[0]?.sentAt ?? null,
      })
    ),
    preparing,
  }
}
