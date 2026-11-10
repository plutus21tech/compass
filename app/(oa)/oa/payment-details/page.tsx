import { notFound } from 'next/navigation'
import { PaymentDetailsScreen } from '@/components/academy/hr/PaymentDetailsScreen'
import { isAcademyEnabled } from '@/lib/academy/flag'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function OaPaymentDetailsPage() {
  if (!isAcademyEnabled()) notFound()
  return <PaymentDetailsScreen />
}
