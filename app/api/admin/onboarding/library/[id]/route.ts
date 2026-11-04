import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { deactivateLibraryCard, updateLibraryCard } from '@/lib/academy/service/library'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await updateLibraryCard(prisma, id, body) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

/** Soft delete: sets isActive to false. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    await deactivateLibraryCard(prisma, id)
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
