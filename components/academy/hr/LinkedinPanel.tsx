'use client'

import { Button } from '@/components/ui/button'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import type { DrawerLinkedin } from '@/lib/academy/tracker'
import { Chip } from './Chip'
import { DATE_ZONE } from './tracker-api'

function LinkRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="text-sm">
      <span className="block text-xs text-muted-foreground">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-4">{url}</a>
      ) : (
        <span className="text-muted-foreground">None</span>
      )}
    </div>
  )
}

interface Props {
  linkedin: DrawerLinkedin
  busy: boolean
  onVerify: () => void
}

/** Both links stay on screen until Verify, so a newer one is never replaced unseen. */
export function LinkedinPanel({ linkedin, busy, onVerify }: Props) {
  const differs = linkedin.profileUrl !== null && linkedin.url !== null && linkedin.profileUrl !== linkedin.url
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <LinkRow label="Submitted by the hire" url={linkedin.url} />
      <LinkRow label="On their profile" url={linkedin.profileUrl} />
      <div className="flex flex-wrap items-center gap-3">
        {linkedin.verified ? (
          <Chip chip={{ label: linkedin.verifiedAt ? `Verified ${formatAcademyDate(linkedin.verifiedAt, DATE_ZONE)}` : 'Verified', tone: 'success' }} />
        ) : (
          <Button type="button" size="sm" disabled={busy || linkedin.url === null} onClick={onVerify}>
            Verify
          </Button>
        )}
        {differs && !linkedin.verified && (
          <span className="text-xs text-muted-foreground">Verify puts the submitted link on their profile in place of the one shown.</span>
        )}
      </div>
    </div>
  )
}
