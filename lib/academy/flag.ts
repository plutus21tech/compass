export function isAcademyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ONBOARDING_ACADEMY_ENABLED === 'true'
}
