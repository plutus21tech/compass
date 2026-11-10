import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { signAcknowledgement } from '@/lib/academy/service/fields'

// Only the typed name and where it was signed: the statement is read on the server.
const bodySchema = z
  .object({ kind: z.literal('SECURITY_SOPS'), typedName: z.string().max(200), moduleSlug: z.string().min(1).max(100) })
  .strict()

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { signedAt } = await signAcknowledgement(prisma, user.id, bodySchema.parse(await request.json()))
    return NextResponse.json({ success: true, data: { signedAt: signedAt.toISOString() } })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
