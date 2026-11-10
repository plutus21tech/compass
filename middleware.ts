import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { bypassesSessionCheck } from '@/lib/middleware-paths'
import { ACADEMY_PATH_HEADER } from '@/lib/academy/lockout'

/** Overwrites the header getSession() reads, so a client can't choose the path it is judged on. */
function nextWithPathname(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers)
  headers.set(ACADEMY_PATH_HEADER, request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public pages, and cron routes that verify their own secret
  if (bypassesSessionCheck(pathname)) {
    return nextWithPathname(request)
  }

  // Check for encrypted session cookie
  const sessionCookie = request.cookies.get('pe_session')

  if (!sessionCookie) {
    // API routes return 401
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Pages redirect to login
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  return nextWithPathname(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
