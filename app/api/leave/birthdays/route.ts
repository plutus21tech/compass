import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { birthdayInputSchema, firstIssueMessage } from '@/lib/leave-holiday-input'

/**
 * HR enters birthdays (day and month only) for the leave calendar. Everyone can see
 * them there; this API is HR's editing surface.
 */

async function requireHr() {
  const user = await getSession()
  return user && isAdminRole(user.role) ? user : null
}

// GET - every stored birthday
export async function GET() {
  try {
    if (!(await requireHr())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const birthdays = await prisma.employeeBirthday.findMany({ select: { userId: true, month: true, day: true } })
    return NextResponse.json({ birthdays })
  } catch (error) {
    console.error('Failed to fetch birthdays:', error)
    return NextResponse.json({ error: 'Failed to load birthdays' }, { status: 500 })
  }
}

// PUT - set or change someone's birthday
export async function PUT(request: NextRequest) {
  try {
    if (!(await requireHr())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = birthdayInputSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    }

    const { userId, month, day } = parsed.data
    const person = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!person) {
      return NextResponse.json({ error: 'That person was not found' }, { status: 404 })
    }

    const birthday = await prisma.employeeBirthday.upsert({
      where: { userId },
      create: { userId, month, day },
      update: { month, day },
      select: { userId: true, month: true, day: true },
    })
    return NextResponse.json({ success: true, birthday })
  } catch (error) {
    console.error('Failed to save birthday:', error)
    return NextResponse.json({ error: 'Failed to save birthday' }, { status: 500 })
  }
}

// DELETE - clear someone's birthday (?userId=)
export async function DELETE(request: NextRequest) {
  try {
    if (!(await requireHr())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!userId) {
      return NextResponse.json({ error: 'Choose a person' }, { status: 400 })
    }

    // deleteMany: clearing a birthday that is already empty is not an error.
    await prisma.employeeBirthday.deleteMany({ where: { userId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to clear birthday:', error)
    return NextResponse.json({ error: 'Failed to clear birthday' }, { status: 500 })
  }
}
