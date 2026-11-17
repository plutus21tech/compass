import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { employee360Json } from '@/app/api/admin/analytics/employee-360/_http'
import { loadPersonProfile } from '@/lib/people/profile'
import { loadProfileCompensation } from '@/lib/people/profile-compensation'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/people/[id]/compensation — basic-salary history for HR and OA only.
 * Read-only, never cached, and separate from the profile itself so that pay is
 * only ever loaded behind this check.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await getSession()
    if (!user) {
      return employee360Json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (!canManagePayroll(user.role)) {
      return employee360Json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const person = await loadPersonProfile({ id: user.id, role: user.role, department: user.department }, id)
    if (!person) {
      return employee360Json({ success: false, error: 'Not found' }, { status: 404 })
    }
    return employee360Json({ success: true, data: await loadProfileCompensation(person.id) })
  } catch (error) {
    console.error('[people/profile] Failed to load compensation:', error)
    return employee360Json({ success: false, error: 'Could not load pay history. Try again.' }, { status: 500 })
  }
}
