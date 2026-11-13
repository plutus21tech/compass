import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { saveDiscordUsername } from '@/lib/academy/service/fields'

const bodySchema = z.object({ discordUsername: z.string() }).strict()

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { discordUsername } = bodySchema.parse(await request.json())
    await saveDiscordUsername(prisma, user.id, discordUsername)
    return NextResponse.json({ success: true })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
