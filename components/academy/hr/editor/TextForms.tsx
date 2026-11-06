'use client'

import { AreaField, Note, TextField, type BlockFormProps } from './fields'

export function VideoForm({ block, onChange }: BlockFormProps<'video'>) {
  return (
    <>
      <Note>The video itself is set up separately. You can change the words beside it.</Note>
      <AreaField label="Summary" value={block.summary} onChange={(summary) => onChange({ ...block, summary })} />
    </>
  )
}

export function RichTextForm({ block, onChange }: BlockFormProps<'richText'>) {
  return <AreaField label="What hires read" formatted value={block.markdown} onChange={(markdown) => onChange({ ...block, markdown })} />
}

export function WarningBoxForm({ block, onChange }: BlockFormProps<'warningBox'>) {
  return (
    <>
      <TextField label="Heading" value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
      <AreaField label="What hires read" formatted value={block.markdown} onChange={(markdown) => onChange({ ...block, markdown })} />
    </>
  )
}

export function AcknowledgementForm({ block, onChange }: BlockFormProps<'acknowledgement'>) {
  return (
    <AreaField
      label="Statement hires sign"
      hint="Publishing new wording makes a new version. Anyone who already signed keeps the wording they signed."
      value={block.statement}
      onChange={(statement) => onChange({ ...block, statement })}
    />
  )
}

export function CopyTextForm({ block, onChange }: BlockFormProps<'copyText'>) {
  return (
    <>
      <TextField label="Label" value={block.label} onChange={(label) => onChange({ ...block, label })} />
      <AreaField label="Text hires copy" value={block.text} onChange={(text) => onChange({ ...block, text })} />
    </>
  )
}

export function InputFieldForm({ block, onChange }: BlockFormProps<'inputField'>) {
  return (
    <TextField
      label="Label above the box"
      hint="Only the label can change. What hires type here is saved in the same place as before."
      value={block.label}
      onChange={(label) => onChange({ ...block, label })}
    />
  )
}

export function DashboardLinkForm({ block, onChange }: BlockFormProps<'dashboardLink'>) {
  return <TextField label="Button text" value={block.label} onChange={(label) => onChange({ ...block, label })} />
}
