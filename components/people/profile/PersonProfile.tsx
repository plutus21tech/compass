'use client'

import Link from 'next/link'
import { ArrowLeft, FolderKanban, Mail, MessageCircle, Palmtree, UserRound } from 'lucide-react'
import { PageContainer } from '@/components/layout/page-container'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { resolveAvatarLook } from '@/lib/avatar-pixels'
import { formatDateRange } from '@/lib/format-date'
import { LEAVE_TYPE_LABEL } from '@/lib/leave-type-style'
import type { PersonProfile, ProfileDetails, ProfileLeave, ProfileProject } from '@/lib/people/profile-rules'
import { ProfileAbout } from './ProfileAbout'
import { ProfileAvatarFigure } from './ProfileAvatarFigure'
import { ProfilePay } from './ProfilePay'
import { useProfile } from './use-profile'

const CARD = 'rounded-xl border border-border bg-card p-5'
const HEADING = 'flex items-center gap-2 text-base font-semibold text-foreground'
const PROJECT_ROLE: Record<string, string> = { OWNER: 'Owner', LEAD: 'Lead', MEMBER: 'Member' }

const leaveTypeLabel = (type: string): string => (LEAVE_TYPE_LABEL as Record<string, string>)[type] ?? type
const isWebUrl = (value: string): boolean => /^https?:\/\//i.test(value)

function BackLink() {
  return (
    <Link href="/people" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      People
    </Link>
  )
}

function ProfileHeader({ profile }: { profile: PersonProfile }) {
  const where = [profile.department, profile.teamLabel].filter(Boolean).join(' · ')
  return (
    <header className={`${CARD} flex flex-col items-center gap-5 sm:flex-row sm:items-center`}>
      <div className="flex h-36 w-28 shrink-0 items-end justify-center rounded-xl bg-muted/60 px-3 pb-2 text-foreground">
        <ProfileAvatarFigure look={resolveAvatarLook(profile.id, profile.avatar)} name={profile.name} className="h-32 w-auto" />
      </div>
      <div className="min-w-0 text-center sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">{profile.name}</h1>
          {profile.isSelf ? <Badge variant="secondary">You</Badge> : null}
        </div>
        {profile.position ? <p className="mt-1 text-sm text-foreground">{profile.position}</p> : null}
        {where ? <p className="mt-0.5 text-sm text-muted-foreground">{where}</p> : null}
        {profile.isSelf ? (
          <Link href="/profile" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Edit your avatar and account settings
          </Link>
        ) : null}
      </div>
    </header>
  )
}

function ContactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all text-sm text-foreground">{children}</dd>
    </div>
  )
}

function ContactCard({ profile }: { profile: PersonProfile }) {
  const notSet = <span className="text-muted-foreground">Not set</span>
  return (
    <section aria-labelledby="profile-contact-heading" className={CARD}>
      <h2 id="profile-contact-heading" className={HEADING}>
        <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Contact
      </h2>
      <dl className="mt-2 divide-y divide-border">
        <ContactRow label="Department">{profile.department ?? notSet}</ContactRow>
        <ContactRow label="Email">
          {profile.email ? (
            <a href={`mailto:${profile.email}`} className="text-primary hover:underline">{profile.email}</a>
          ) : notSet}
        </ContactRow>
        <ContactRow label="Discord">
          {profile.discordUsername || profile.discordId ? (
            <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {profile.discordUsername ? <span>{profile.discordUsername}</span> : null}
              {profile.discordId ? <span className="font-mono text-xs text-muted-foreground">ID {profile.discordId}</span> : null}
            </span>
          ) : notSet}
        </ContactRow>
        {profile.linkedinUrl && isWebUrl(profile.linkedinUrl) ? (
          <ContactRow label="LinkedIn">
            <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              View profile
            </a>
          </ContactRow>
        ) : null}
      </dl>
    </section>
  )
}

function LeaveCard({ leave, firstName }: { leave: ProfileLeave[]; firstName: string }) {
  return (
    <section aria-labelledby="profile-leave-heading" className={CARD}>
      <h2 id="profile-leave-heading" className={HEADING}>
        <Palmtree className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Time off
      </h2>
      {leave.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{firstName} has no leave coming up.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {leave.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <span className="text-foreground">{formatDateRange(item.startDate, item.endDate)}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {leaveTypeLabel(item.leaveType)}
                {item.isHalfDay ? ' · Half day' : ''}
                {item.ongoing ? <Badge variant="secondary">Out now</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ProjectsCard({ projects, firstName }: { projects: ProfileProject[]; firstName: string }) {
  return (
    <section aria-labelledby="profile-projects-heading" className={CARD}>
      <h2 id="profile-projects-heading" className={HEADING}>
        <FolderKanban className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Working on
      </h2>
      {projects.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{firstName} is not on any active projects.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {projects.map((project) => (
            <li key={project.id} className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{project.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{PROJECT_ROLE[project.role] ?? 'Member'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export interface PersonProfileViewProps {
  profile: PersonProfile
  onDetailsSaved: (details: ProfileDetails) => void
}

export function PersonProfileView({ profile, onDetailsSaved }: PersonProfileViewProps) {
  const firstName = profile.name.split(' ')[0] || profile.name
  return (
    <div className="space-y-6">
      <ProfileHeader profile={profile} />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <ContactCard profile={profile} />
          <ProfileAbout firstName={firstName} details={profile.details} isSelf={profile.isSelf} onSaved={onDetailsSaved} />
        </div>
        <div className="space-y-6">
          <LeaveCard leave={profile.leave} firstName={firstName} />
          <ProjectsCard projects={profile.projects} firstName={firstName} />
        </div>
      </div>
      {profile.canSeeCompensation ? <ProfilePay personId={profile.id} /> : null}
    </div>
  )
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div role="status" className={`${CARD} flex flex-col items-center gap-2 py-12 text-center`}>
      <UserRound className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

/** /people/[id]: one person's profile. */
export function PersonProfileWorkspace({ personId }: { personId: string }) {
  const { state, setDetails } = useProfile(personId)
  return (
    <PageContainer>
      <BackLink />
      {state.status === 'loading' ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-44 w-full rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </div>
      ) : null}
      {state.status === 'missing' ? (
        <Message title="Profile not found" body="This person may have left, or their profile is not available to you." />
      ) : null}
      {state.status === 'error' ? (
        <Message title="Could not load this profile" body="Refresh the page to try again." />
      ) : null}
      {state.status === 'ready' ? <PersonProfileView profile={state.profile} onDetailsSaved={setDetails} /> : null}
    </PageContainer>
  )
}
