import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendLeadInputRequest } from '@/lib/email'
import { AcademyError } from '@/lib/academy/errors'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { loadSetup, saveSetup } from '@/lib/academy/service/setup'
import { setupAccessGate } from '@/lib/academy/setup'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function requireHr() {
  const user = await requireAcademySession()
  if (setupAccessGate(user.role) !== 'allow') throw new AcademyError('Forbidden', 403)
  return user
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireHr()
    const { id } = await context.params
    return NextResponse.json({ success: true, data: await loadSetup(prisma, id) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    const body: unknown = await request.json()
    const { leadRequestNeeded } = await saveSetup(prisma, id, body, user.id)
    if (leadRequestNeeded) {
      try {
        await sendLeadInputRequest(id)
      } catch (emailError) {
        console.error('[academy] failed to send lead input request', emailError)
      }
    }
    return NextResponse.json({ success: true, data: await loadSetup(prisma, id) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
