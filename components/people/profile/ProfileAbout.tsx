'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  PROFILE_DETAIL_FIELDS,
  PROFILE_DETAIL_MAX,
  hasProfileDetails,
  type ProfileDetails,
} from '@/lib/people/profile-rules'
import { saveMyDetails } from './use-profile'

export interface ProfileAboutProps {
  firstName: string
  details: ProfileDetails
  isSelf: boolean
  onSaved: (details: ProfileDetails) => void
}

const CARD = 'rounded-xl border border-border bg-card p-5'

function AboutForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: ProfileDetails
  onCancel: () => void
  onSaved: (details: ProfileDetails) => void
}) {
  const [draft, setDraft] = useState<ProfileDetails>(initial)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await saveMyDetails(draft)
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Profile saved')
    onSaved(result.data)
  }

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      {PROFILE_DETAIL_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <Label htmlFor={`about-${field.key}`}>{field.label}</Label>
          <Textarea
            id={`about-${field.key}`}
            rows={3}
            maxLength={PROFILE_DETAIL_MAX}
            placeholder={field.hint}
            value={draft[field.key] ?? ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))}
          />
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

/** The "about me" answers: everyone can read them, only the owner can change them. */
export function ProfileAbout({ firstName, details, isSelf, onSaved }: ProfileAboutProps) {
  const [editing, setEditing] = useState(false)
  const filled = PROFILE_DETAIL_FIELDS.filter((field) => Boolean(details[field.key]))

  return (
    <section aria-labelledby="profile-about-heading" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-about-heading" className="text-base font-semibold text-foreground">
          About {isSelf ? 'you' : firstName}
        </h2>
        {isSelf && !editing ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            {hasProfileDetails(details) ? 'Edit' : 'Add'}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <AboutForm
          initial={details}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            onSaved(saved)
          }}
        />
      ) : filled.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {isSelf
            ? 'Tell people a little about yourself: what you do, what you enjoy, what to ask you about.'
            : `${firstName} has not added anything here yet.`}
        </p>
      ) : (
        <dl className="mt-4 space-y-4">
          {filled.map((field) => (
            <div key={field.key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">{details[field.key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
