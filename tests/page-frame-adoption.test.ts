import test from 'node:test'
import { assertAdoptsFrame } from './helpers/page-frame'

const WITH_HEADER = ['components/weekly/WeeklyEvaluationsPage.tsx', 'components/my-tasks/MyTasksWorkspace.tsx', 'components/projects/ProjectsWorkspace.tsx', 'app/(evaluator)/clientele/page.tsx']
const CONTAINER_ONLY = ['app/(evaluator)/projects/[id]/page.tsx', 'app/(evaluator)/projects/analytics/page.tsx', 'app/(evaluator)/projects/[id]/analytics/page.tsx']

for (const file of WITH_HEADER) test(`${file} uses the page container and header`, () => assertAdoptsFrame(file, { header: true }))
for (const file of CONTAINER_ONLY) test(`${file} uses the page container`, () => assertAdoptsFrame(file, { header: false }))

const COMPANY_PAGES = ['app/(evaluator)/handbook/page.tsx', 'app/(evaluator)/handbook/[slug]/page.tsx', 'components/device-support/DeviceSupportWorkspace.tsx', 'app/(evaluator)/device-support/assets/[tag]/page.tsx', 'app/(evaluator)/profile/page.tsx', 'app/(evaluator)/team-lead-form/[newHireId]/page.tsx']
for (const file of COMPANY_PAGES) test(`${file} uses the page container and header`, () => assertAdoptsFrame(file, { header: true }))
