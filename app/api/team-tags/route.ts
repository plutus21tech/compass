import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { loadTeamCatalog } from '@/lib/teams/load'

/**
 * The team-tag catalog for any signed-in screen that shows or picks teams
 * (handbook, payroll, users). Names and order only -- nothing about who is on
 * which team -- so it needs no role beyond being signed in.
 */
export async function GET() {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const catalog = await loadTeamCatalog()
    return NextResponse.json({ teams: catalog.definitions })
  } catch (error) {
    console.error('Failed to load team tags:', error)
    return NextResponse.json({ error: 'Failed to load team tags' }, { status: 500 })
  }
}
