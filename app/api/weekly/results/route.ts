import { NextResponse } from 'next/server'
import { requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { myResults } from '@/lib/weekly/service/my-results'

export const dynamic = 'force-dynamic'

/** The signed-in person's own released results. There is no way to ask for anyone else's. */
export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await myResults(user.id), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}
