import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { readTranscript } from '@/lib/academy/service/transcript'
import { TRANSCRIPT_ERROR_HEADERS, TRANSCRIPT_HEADERS } from '@/lib/academy/video'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ key: string }>
}

/** `?lang=en|fr|es`. For someone who can open the module with this video, and HR. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    const { key } = await context.params
    const language = request.nextUrl.searchParams.get('lang') ?? ''
    const text = await readTranscript(prisma, user, key, language)
    return new NextResponse(text, { headers: TRANSCRIPT_HEADERS })
  } catch (error) {
    const response = academyErrorResponse(error)
    for (const [name, value] of Object.entries(TRANSCRIPT_ERROR_HEADERS)) response.headers.set(name, value)
    return response
  }
}
