'use client'

import { SidebarLayout } from '@/components/layout/SidebarLayout'
import { EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR } from '@/components/layout/sidebar-config'

export default function EvaluatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout sidebarConfig={EMPLOYEE_SIDEBAR} onboardingSidebarConfig={ONBOARDING_SIDEBAR}>
      {children}
    </SidebarLayout>
  )
}
