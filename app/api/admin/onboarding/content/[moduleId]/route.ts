import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { discardDraft, loadContent, saveDraft } from '@/lib/academy/service/content'

const MAX_TOP_LEVEL_BLOCKS = 200

interface RouteContext {
  params: Promise<{ moduleId: string }>
}

const expectedUpdatedAt = z.string().datetime()

// `blocks` and `details` are parsed in saveDraft: parseBlocks, and a strict schema that refuses slug, order, phase, rule and icon.
const saveSchema = z
  .object({ blocks: z.array(z.unknown()).max(MAX_TOP_LEVEL_BLOCKS), details: z.record(z.string(), z.unknown()), expectedUpdatedAt })
  .strict()

const discardSchema = z.object({ expectedUpdatedAt }).strict()

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireAcademyHr()
    const { moduleId } = await context.params
    return NextResponse.json({ success: true, data: await loadContent(prisma, moduleId) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { moduleId } = await context.params
    const { blocks, ...options } = saveSchema.parse(await request.json())
    return NextResponse.json({ success: true, data: await saveDraft(prisma, moduleId, blocks, options) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { moduleId } = await context.params
    await discardDraft(prisma, moduleId, discardSchema.parse(await request.json()))
    return NextResponse.json({ success: true, data: null })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
