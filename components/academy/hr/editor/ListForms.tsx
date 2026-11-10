'use client'

import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { newItemKey } from '@/lib/academy/content-rules'
import { ACADEMY_LINK_KEYS, academyLinkLabel, type AcademyLinkKey } from '@/lib/academy/links'
import { AddRowButton, AreaField, HeadingField, RemoveRowButton, SelectField, TextField, type BlockFormProps } from './fields'
import { removeAt, replaceAt } from './list-ops'

const ROW_CLASS = 'flex items-start gap-2'

const LINK_OPTIONS = ACADEMY_LINK_KEYS.map((value) => ({ value, label: academyLinkLabel(value) }))
const NO_LINK = 'NONE'
const OPTIONAL_LINK_OPTIONS = [{ value: NO_LINK, label: 'No link' }, ...LINK_OPTIONS]

export function ChecklistForm({ block, onChange, isSafe, takenKeys }: BlockFormProps<'checklist'>) {
  const withItems = (items: typeof block.items) => ({ ...block, items })
  return (
    <>
      <HeadingField value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
      {block.items.map((item, index) => (
        <div key={item.key} className={ROW_CLASS}>
          <TextField
            label={`Item ${index + 1}`}
            value={item.label}
            onChange={(label) => onChange(withItems(replaceAt(block.items, index, { ...item, label })))}
          />
          <RemoveRowButton
            label={`Remove item ${index + 1}`}
            allowed={isSafe(withItems(removeAt(block.items, index)))}
            onClick={() => onChange(withItems(removeAt(block.items, index)))}
          />
        </div>
      ))}
      <AddRowButton label="Add an item" onClick={() => onChange(withItems([...block.items, { key: newItemKey(takenKeys()), label: '' }]))} />
    </>
  )
}

export function TimelineForm({ block, onChange, isSafe }: BlockFormProps<'timeline'>) {
  const withItems = (items: typeof block.items) => ({ ...block, items })
  return (
    <>
      {block.items.map((item, index) => (
        <div key={index} className={ROW_CLASS}>
          <div className="min-w-0 flex-1 space-y-3">
            <TextField
              label={`Step ${index + 1} title`}
              value={item.label}
              onChange={(label) => onChange(withItems(replaceAt(block.items, index, { ...item, label })))}
            />
            <AreaField
              label={`Step ${index + 1} text`}
              formatted
              value={item.markdown}
              onChange={(markdown) => onChange(withItems(replaceAt(block.items, index, { ...item, markdown })))}
            />
          </div>
          <RemoveRowButton
            label={`Remove step ${index + 1}`}
            allowed={isSafe(withItems(removeAt(block.items, index)))}
            onClick={() => onChange(withItems(removeAt(block.items, index)))}
          />
        </div>
      ))}
      <AddRowButton label="Add a step" onClick={() => onChange(withItems([...block.items, { label: '', markdown: '' }]))} />
    </>
  )
}

export function LinkCardsForm({ block, onChange, isSafe }: BlockFormProps<'linkCards'>) {
  const withLinks = (links: typeof block.links) => ({ ...block, links })
  return (
    <>
      <HeadingField value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
      {block.links.map((link, index) => (
        <div key={index} className={ROW_CLASS}>
          <TextField
            label={`Link ${index + 1} text`}
            value={link.label}
            onChange={(label) => onChange(withLinks(replaceAt(block.links, index, { ...link, label })))}
          />
          <SelectField
            label={`Link ${index + 1} goes to`}
            value={link.linkKey}
            options={LINK_OPTIONS}
            onChange={(linkKey) => onChange(withLinks(replaceAt(block.links, index, { ...link, linkKey })))}
          />
          <RemoveRowButton
            label={`Remove link ${index + 1}`}
            allowed={isSafe(withLinks(removeAt(block.links, index)))}
            onClick={() => onChange(withLinks(removeAt(block.links, index)))}
          />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Where each link points is set under Links &amp; settings.</p>
      <AddRowButton label="Add a link" onClick={() => onChange(withLinks([...block.links, { label: '', linkKey: 'COMPANY_DASHBOARD' }]))} />
    </>
  )
}

export function ToolTilesForm({ block, onChange, isSafe }: BlockFormProps<'toolTiles'>) {
  const withTools = (tools: typeof block.tools) => ({ ...block, tools })
  const checkboxId = useId()
  const toolWithLink = (tool: (typeof block.tools)[number], value: string) => {
    const { linkKey: _old, ...rest } = tool
    return value === NO_LINK ? rest : { ...rest, linkKey: value as AcademyLinkKey }
  }
  return (
    <>
      <HeadingField value={block.heading} onChange={(heading) => onChange({ ...block, heading })} />
      {block.tools.map((tool, index) => (
        <div key={index} className={ROW_CLASS}>
          <TextField
            label={`Tool ${index + 1} name`}
            value={tool.name}
            onChange={(name) => onChange(withTools(replaceAt(block.tools, index, { ...tool, name })))}
          />
          <TextField
            label="What it is for"
            value={tool.purpose}
            onChange={(purpose) => onChange(withTools(replaceAt(block.tools, index, { ...tool, purpose })))}
          />
          <SelectField
            label="Link"
            value={tool.linkKey ?? NO_LINK}
            options={OPTIONAL_LINK_OPTIONS}
            onChange={(value) => onChange(withTools(replaceAt(block.tools, index, toolWithLink(tool, value))))}
          />
          <RemoveRowButton
            label={`Remove tool ${index + 1}`}
            allowed={isSafe(withTools(removeAt(block.tools, index)))}
            onClick={() => onChange(withTools(removeAt(block.tools, index)))}
          />
        </div>
      ))}
      <AddRowButton label="Add a tool" onClick={() => onChange(withTools([...block.tools, { name: '', purpose: '' }]))} />
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={block.includeTeamTools}
          onCheckedChange={(checked) => onChange({ ...block, includeTeamTools: checked === true })}
        />
        <Label htmlFor={checkboxId}>Also show the tools each hire&apos;s lead listed</Label>
      </div>
    </>
  )
}
