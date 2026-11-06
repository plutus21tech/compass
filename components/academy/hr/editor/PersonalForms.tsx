'use client'

import { HeadingField, Note, SelectField, type BlockFormProps } from './fields'

const PEOPLE_OPTIONS = [
  { value: 'lead', label: 'Their team lead' },
  { value: 'team', label: 'Their team' },
  { value: 'buddy', label: 'Their buddy' },
  { value: 'keyContacts', label: 'Key contacts' },
] as const

const LIBRARY_OPTIONS = [
  { value: 'BENEFIT', label: 'Benefits' },
  { value: 'REIMBURSEMENT', label: 'Reimbursements' },
] as const

export function PeopleCardsForm({ block, onChange }: BlockFormProps<'peopleCards'>) {
  return (
    <>
      <SelectField label="Who to show" value={block.source} options={PEOPLE_OPTIONS} onChange={(source) => onChange({ ...block, source })} />
      <HeadingField value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
    </>
  )
}

export function TutorialCardsForm({ block, onChange }: BlockFormProps<'tutorialCards'>) {
  return (
    <>
      <Note>Each hire&apos;s lead lists their tutorials, so they appear here on their own.</Note>
      <HeadingField value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
    </>
  )
}

export function LibraryCardsForm({ block, onChange }: BlockFormProps<'libraryCards'>) {
  return (
    <>
      <SelectField label="Which cards" value={block.kind} options={LIBRARY_OPTIONS} onChange={(kind) => onChange({ ...block, kind })} />
      <Note>You edit the cards under Academy library.</Note>
    </>
  )
}
