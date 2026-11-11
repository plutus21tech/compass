import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listBell } from '@/lib/notifications/service'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const data = await listBell(user.id, { now: new Date(), securityChecks: isSecurityChecksEnabled() })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[notifications] list failed', { userId: user.id, error })
    return NextResponse.json({ success: false, error: 'Could not load notifications.' }, { status: 500 })
  }
}
