'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isThreeEDepartment } from '@/lib/company-branding'
import { CompanyMap } from './CompanyMap'
import { MyTeamList } from './MyTeamList'

type PeopleTab = 'team' | 'map'

function pickTab(requested: string | null, focusId: string | null, mapAllowed: boolean): PeopleTab {
  if (!mapAllowed) return 'team'
  if (requested === 'team') return 'team'
  return requested === 'map' || focusId ? 'map' : 'team'
}

/** People: My team for everyone, the company map for Plutus21 viewers only (never 3E). */
export function PeopleWorkspace() {
  const user = useLayoutUser()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const focusId = searchParams.get('focus')
  const mapAllowed = Boolean(user) && !isThreeEDepartment(user?.department)
  const tab = pickTab(searchParams.get('tab'), focusId, mapAllowed)

  const changeTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    params.delete('focus')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <PageContainer width={tab === 'map' ? 'wide' : 'default'}>
      <PageHeader title="People" subtitle="Your team and how the company fits together." />
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="team">My team</TabsTrigger>
          {mapAllowed ? <TabsTrigger value="map">Company map</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="team" className="mt-4">
          <MyTeamList highlightId={tab === 'team' ? focusId : null} />
        </TabsContent>
        {mapAllowed ? (
          <TabsContent value="map" className="mt-4">
            {tab === 'map' ? <CompanyMap focusId={focusId} /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </PageContainer>
  )
}
