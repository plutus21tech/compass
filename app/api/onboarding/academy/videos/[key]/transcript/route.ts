import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { readTranscript } from '@/lib/academy/service/transcript'

export const runtime = 'nodejs'

const NO_STORE = 'no-store'

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
    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': NO_STORE,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
