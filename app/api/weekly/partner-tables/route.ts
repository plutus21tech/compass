import { NextResponse, type NextRequest } from 'next/server'
import { DRAFT_LIMIT, guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { formTableRowSchema } from '@/lib/weekly/schemas'
import { actorFromUser } from '@/lib/weekly/service/context'
import { myPartnerTables, saveTableRow } from '@/lib/weekly/service/form-tables'

export const dynamic = 'force-dynamic'

/** A partner's own end-of-quarter tables, the same rows HR sees on "Partner evaluations". 404 for anyone else. */
export async function GET() {
  try {
    const user = await requireWeeklySession()
    return NextResponse.json(await myPartnerTables(actorFromUser(user), new Date()))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}

/** A partner saves or submits one of their own rows. Cells save as they type, so this uses the draft rate limit. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession()
    await guardWeeklyMutation(request, user.id, DRAFT_LIMIT)
    const input = formTableRowSchema.parse(await request.json())
    return NextResponse.json({ success: true, ...(await saveTableRow(actorFromUser(user), input, new Date())) })
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}
