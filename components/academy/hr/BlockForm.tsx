'use client'

import type { Block } from '@/lib/academy/blocks'
import { describeCondition } from '@/lib/academy/content-rules'
import { BlockList } from './editor/BlockList'
import { Note, type BlockFormProps } from './editor/fields'
import { ChecklistForm, LinkCardsForm, TimelineForm, ToolTilesForm } from './editor/ListForms'
import { LibraryCardsForm, PeopleCardsForm, TutorialCardsForm } from './editor/PersonalForms'
import { DataTableForm } from './editor/TableForm'
import {
  AcknowledgementForm,
  CopyTextForm,
  DashboardLinkForm,
  InputFieldForm,
  RichTextForm,
  VideoForm,
  WarningBoxForm,
} from './editor/TextForms'

type AnyBlockProps = BlockFormProps<Block['type']>

function ConditionalForm({ block, onChange, isSafe, takenKeys }: BlockFormProps<'conditional'>) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{describeCondition(block.when)}</p>
      <BlockList
        blocks={block.children}
        onChange={(children) => onChange({ ...block, children })}
        isSafe={(children) => isSafe({ ...block, children })}
        takenKeys={takenKeys}
      />
    </div>
  )
}

/** One form per block type. Keys, field targets and conditions are never offered for editing. */
export function BlockForm({ block, ...rest }: AnyBlockProps) {
  switch (block.type) {
    case 'video':
      return <VideoForm block={block} {...rest} />
    case 'richText':
      return <RichTextForm block={block} {...rest} />
    case 'warningBox':
      return <WarningBoxForm block={block} {...rest} />
    case 'acknowledgement':
      return <AcknowledgementForm block={block} {...rest} />
    case 'copyText':
      return <CopyTextForm block={block} {...rest} />
    case 'inputField':
      return <InputFieldForm block={block} {...rest} />
    case 'dashboardLink':
      return <DashboardLinkForm block={block} {...rest} />
    case 'checklist':
      return <ChecklistForm block={block} {...rest} />
    case 'timeline':
      return <TimelineForm block={block} {...rest} />
    case 'linkCards':
      return <LinkCardsForm block={block} {...rest} />
    case 'toolTiles':
      return <ToolTilesForm block={block} {...rest} />
    case 'dataTable':
      return <DataTableForm block={block} {...rest} />
    case 'peopleCards':
      return <PeopleCardsForm block={block} {...rest} />
    case 'tutorialCards':
      return <TutorialCardsForm block={block} {...rest} />
    case 'libraryCards':
      return <LibraryCardsForm block={block} {...rest} />
    case 'callTimes':
      return <Note>Each hire&apos;s call times appear here on their own. Nothing to edit.</Note>
    case 'roleExpectations':
      return <Note>Each hire&apos;s lead writes these, so they appear here on their own. Nothing to edit.</Note>
    case 'conditional':
      return <ConditionalForm block={block} {...rest} />
  }
}
