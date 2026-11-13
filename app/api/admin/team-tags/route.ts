import { NextRequest, NextResponse } from 'next/server'
import type { ZodType } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import {
  TeamTagConflictError,
  TeamTagNotFoundError,
  createTeamTag,
  listTeamTagsForAdmin,
  reorderTeamTags,
  updateTeamTag,
} from '@/lib/teams/admin'
import {
  createTeamTagSchema,
  firstIssueMessage,
  reorderTeamTagsSchema,
  updateTeamTagSchema,
} from '@/lib/teams/schemas'

/**
 * HR management of team tags. Same permission as the users admin API, because
 * the tags are assigned on that page.
 */

async function requireAdmin() {
  const user = await getSession()
  return user && isAdminRole(user.role) ? user : null
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<Parsed<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 }),
    }
  }
  return { ok: true, data: parsed.data }
}

function errorResponse(error: unknown, action: string) {
  if (error instanceof TeamTagConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 })
  }
  if (error instanceof TeamTagNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }
  if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
    return NextResponse.json({ error: 'A team tag with that code already exists' }, { status: 409 })
  }
  console.error(`Failed to ${action} team tag:`, error)
  return NextResponse.json({ error: `Failed to ${action} team tag` }, { status: 500 })
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ teams: await listTeamTagsForAdmin() })
  } catch (error) {
    return errorResponse(error, 'list')
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await parseBody(request, createTeamTagSchema)
  if (!parsed.ok) return parsed.response
  try {
    return NextResponse.json({ success: true, ...(await createTeamTag(parsed.data)) })
  } catch (error) {
    return errorResponse(error, 'create')
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await parseBody(request, updateTeamTagSchema)
  if (!parsed.ok) return parsed.response
  try {
    return NextResponse.json({ success: true, tag: await updateTeamTag(parsed.data) })
  } catch (error) {
    return errorResponse(error, 'update')
  }
}

/** Reorder: the body is the full list of codes in their new order. */
export async function PUT(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = await parseBody(request, reorderTeamTagsSchema)
  if (!parsed.ok) return parsed.response
  try {
    await reorderTeamTags(parsed.data.order)
    return NextResponse.json({ success: true })
  } catch (error) {
    return errorResponse(error, 'reorder')
  }
}
