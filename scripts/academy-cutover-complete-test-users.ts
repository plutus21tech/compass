// One-off cutover: marks every user still at onboardingCompleted = false as complete.
// Dry run by default. CLI: npx tsx scripts/academy-cutover-complete-test-users.ts [--apply]
import { PrismaClient } from '@prisma/client'

export async function completeTestUsers(db: PrismaClient, opts: { apply: boolean }): Promise<string[]> {
  const users = await db.user.findMany({ where: { onboardingCompleted: false }, select: { id: true, name: true } })
  const names = users.map((u) => u.name).sort()
  if (opts.apply && users.length > 0) {
    await db.user.updateMany({ where: { id: { in: users.map((u) => u.id) } }, data: { onboardingCompleted: true } })
  }
  return names
}

function describeHost(url: string | undefined): string {
  try {
    return new URL(url ?? '').host
  } catch {
    return '(unparseable DATABASE_URL)'
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  console.log(`Database host: ${describeHost(process.env.DATABASE_URL)}`)
  const db = new PrismaClient()
  try {
    const names = await completeTestUsers(db, { apply })
    console.log(`${apply ? 'Marked complete' : 'Dry run, would mark complete'}: ${names.length} user(s)`)
    for (const name of names) console.log(` - ${name}`)
    if (!apply) console.log('Nothing written. Re-run with --apply to write.')
  } finally {
    await db.$disconnect()
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Cutover failed:', error)
    process.exit(1)
  })
}
