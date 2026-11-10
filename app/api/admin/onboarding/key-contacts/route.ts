import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { listKeyContacts, saveKeyContacts } from '@/lib/academy/service/library'

export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await listKeyContacts(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

/** Replaces the whole ordered list. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    await saveKeyContacts(prisma, body)
    return NextResponse.json({ success: true, data: await listKeyContacts(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
