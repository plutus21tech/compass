import { prisma } from '@/lib/db'

export function isPlutusEmail(email: string): boolean {
  return /@plutus21\.com$/i.test(email.trim())
}

export async function validateTeamLeadEligibility(userId: string): Promise<{ valid: true } | { valid: false; error: string }> {
  const candidate = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      onboardingCompleted: true,
      payrollProfile: {
        select: {
          isPayrollActive: true,
        },
      },
    },
  })

  if (!candidate) {
    return { valid: false, error: 'Invalid team lead' }
  }

  if (candidate.onboardingCompleted === false) {
    return { valid: false, error: 'Selected team lead must complete onboarding first' }
  }

  if (candidate.payrollProfile?.isPayrollActive === false) {
    return { valid: false, error: 'Selected team lead is inactive' }
  }

  return { valid: true }
}
