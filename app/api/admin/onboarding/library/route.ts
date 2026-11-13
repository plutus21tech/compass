import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AcademyError } from '@/lib/academy/errors'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { createLibraryCard, listLibraryCards } from '@/lib/academy/service/library'

export async function GET(request: NextRequest) {
  try {
    await requireAcademyHr()
    const kind = request.nextUrl.searchParams.get('kind')
    if (kind !== 'BENEFIT' && kind !== 'REIMBURSEMENT') throw new AcademyError('kind must be BENEFIT or REIMBURSEMENT', 400)
    return NextResponse.json({ success: true, data: await listLibraryCards(prisma, kind, { includeInactive: true }) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await createLibraryCard(prisma, body) }, { status: 201 })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
