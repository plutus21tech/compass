import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { acknowledgementPdf, acknowledgementsCsv } from '@/lib/academy/acknowledgement-export'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { AcademyError, academyErrorResponse } from '@/lib/academy/http'
import { loadAcknowledgementRows } from '@/lib/academy/service/tracker'

export const runtime = 'nodejs'

const NO_STORE = 'no-store'
const CSV_FILE_NAME = 'academy-acknowledgements.csv'
const PDF_FILE_NAME = 'academy-acknowledgement.pdf'
/** Lets Excel read the file as UTF-8, so a name like Café stays whole. */
const UTF8_BOM = '\uFEFF'

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

function download(body: BodyInit, type: string, fileName: string): NextResponse {
  return new NextResponse(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': NO_STORE,
    },
  })
}

/** With ?id=, one signature as a PDF. Without it, all of this hire's as a CSV. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireAcademyHr()
    const { newHireId } = await context.params
    const rows = await loadAcknowledgementRows(prisma, newHireId)
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return download(UTF8_BOM + acknowledgementsCsv(rows), 'text/csv; charset=utf-8', CSV_FILE_NAME)

    const row = rows.find((candidate) => candidate.id === id)
    if (!row) throw new AcademyError('Acknowledgement not found', 404)
    return download(new Uint8Array(await acknowledgementPdf(row)), 'application/pdf', PDF_FILE_NAME)
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
