import { prisma } from '../../lib/db'
import { saveSetup } from '../../lib/academy/service/setup'
import { recordEvent, completeModule } from '../../lib/academy/service/progress'
import { releaseCourse } from '../../lib/academy/service/course'
import { ACADEMY_CARDS, ACADEMY_CHECKLIST, ACADEMY_MODULES } from '../../prisma/seed-academy-data'
import { seedAcademy } from '../../prisma/seed-academy'
import { P, resetAcademyFixtures } from './academy-test-db'

export const NEW_HIRE_ID = 'act-newhire'
export const HIRE_ID = P.hire.id
export const SLUGS = ACADEMY_MODULES.map((m) => m.slug)

const PK_ATTRIBUTES = {
  officeLocation: 'KARACHI', remoteCountry: null, workMode: 'HYBRID',
  contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT',
}

export const CONTRACTOR_ATTRIBUTES = {
  officeLocation: 'REMOTE', remoteCountry: 'ID', workMode: 'REMOTE',
  contractType: 'INDEPENDENT_CONTRACTOR', employmentStatus: 'FIXED_TERM',
}

export const setupBody = (over: Record<string, unknown> = {}) => ({
  preferredName: 'Cara', title: 'Analyst', department: 'Research', companyWing: 'CAPITAL', attributes: PK_ATTRIBUTES,
  onboardingDate: '2026-12-01', hrCallAt: '2026-11-25T09:00:00.000Z', teamCallAt: '2026-11-26T09:00:00.000Z',
  teamLeadId: P.lead.id, teamMemberIds: [P.staff.id], buddyId: P.buddy.id, coreHoursStart: '10:00', coreHoursEnd: '18:00',
  ...over,
})

export const TUTORIALS = [
  { title: 'Read the handbook', url: 'https://example.test/handbook' },
  { title: 'Watch the intro', url: 'https://example.test/intro' },
]

export const LEAD_INPUT = {
  roleExpectations: 'Own the weekly research note.',
  day1Goal: 'Say hello.', week1Goal: 'Shadow', month1Goal: 'Draft', month3Goal: 'Lead',
  tutorials: TUTORIALS,
  teamTools: [{ name: 'Tableau', purpose: 'Charts', url: 'https://example.test/tableau' }],
}

export async function cleanCourse(): Promise<void> {
  await resetAcademyFixtures(prisma)
  await prisma.onboardingModule.deleteMany({ where: { slug: { in: SLUGS } } })
  for (const c of ACADEMY_CARDS) await prisma.onboardingLibraryCard.deleteMany({ where: { kind: c.kind, title: c.title } })
  await prisma.onboardingChecklistTemplateItem.deleteMany({ where: { key: { in: ACADEMY_CHECKLIST.map((i) => i.key) } } })
  await prisma.onboardingConfig.deleteMany({ where: { id: 'singleton' } })
}

/** Fresh content, people and a linked hire, with everything release needs unless overridden. */
export async function createReadyHire(
  setupOver: Record<string, unknown> = {},
  leadOver: Record<string, unknown> = {},
): Promise<void> {
  await cleanCourse()
  await seedAcademy(prisma)
  for (const person of [P.hr, P.lead, P.buddy, P.staff]) {
    await prisma.user.create({ data: { ...person, onboardingCompleted: true } })
  }
  await prisma.user.create({ data: { ...P.hire, onboardingCompleted: false } })
  await prisma.position.create({ data: { id: 'act-position', title: 'Analyst' } })
  await prisma.newHire.create({
    data: {
      id: NEW_HIRE_ID, positionId: 'act-position', name: P.hire.name, title: 'Analyst', email: P.hire.email,
      onboardingDate: new Date('2026-12-01T00:00:00.000Z'), userId: P.hire.id,
    },
  })
  await saveSetup(prisma, NEW_HIRE_ID, setupBody(setupOver), P.hr.id)
  await prisma.teamLeadForm.update({
    where: { newHireId: NEW_HIRE_ID },
    data: { ...LEAD_INPUT, ...leadOver, submittedAt: new Date() },
  })
}

export async function createReleasedHire(
  setupOver: Record<string, unknown> = {},
  leadOver: Record<string, unknown> = {},
): Promise<void> {
  await createReadyHire(setupOver, leadOver)
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
}

export async function progressRow(slug: string) {
  return prisma.onboardingProgress.findFirstOrThrow({ where: { userId: HIRE_ID, module: { slug } } })
}

/** Completes one module that a page scroll is enough for (modules 1 and 2). */
export async function scrollAndComplete(slug: string) {
  await recordEvent(prisma, HIRE_ID, slug, { type: 'SCROLLED_END' })
  return completeModule(prisma, HIRE_ID, slug)
}
