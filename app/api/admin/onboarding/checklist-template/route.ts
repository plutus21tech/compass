import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { createTemplateItem, listTemplateItems } from '@/lib/academy/service/checklist-template'

export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await listTemplateItems(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await createTemplateItem(prisma, body) }, { status: 201 })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
