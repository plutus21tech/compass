import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildCertificatePdf, formatCertificateDate } from '@/lib/academy/certificate'
import { AcademyError, academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { loadCompletion } from '@/lib/academy/service/completion'
import { loadHireFacts } from '@/lib/academy/service/context'
import { timeZoneFor } from '@/lib/academy/time'

export const runtime = 'nodejs'

const NO_STORE = 'no-store'
const FILE_NAME = 'plutus21-academy-certificate.pdf'

/** Only ever the signed-in person's own certificate. */
export async function GET() {
  try {
    const user = await requireAcademySession()
    const completion = await loadCompletion(prisma, user.id)
    if (!completion) throw new AcademyError('Not found', 404)

    const facts = await loadHireFacts(prisma, user.id)
    const timeZone = facts ? timeZoneFor(facts.attributes) : null
    const pdf = await buildCertificatePdf({
      name: completion.name,
      completedOn: formatCertificateDate(completion.completedAt, timeZone),
    })
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${FILE_NAME}"`,
        'Cache-Control': NO_STORE,
      },
    })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
