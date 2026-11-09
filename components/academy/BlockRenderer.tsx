import type { Block } from '@/lib/academy/blocks'
import type { ModuleBlockView } from '@/lib/academy/view'
import type { BlockContext } from './types'
import { AcknowledgementBlock } from './blocks/AcknowledgementBlock'
import { CallTimesBlock } from './blocks/CallTimesBlock'
import { ChecklistBlock } from './blocks/ChecklistBlock'
import { CopyTextBlock } from './blocks/CopyTextBlock'
import { DashboardLinkBlock } from './blocks/DashboardLinkBlock'
import { DataTableBlock } from './blocks/DataTableBlock'
import { InputFieldBlock } from './blocks/InputFieldBlock'
import { LibraryCardsBlock } from './blocks/LibraryCardsBlock'
import { LinkCardsBlock } from './blocks/LinkCardsBlock'
import { PeopleCardsBlock } from './blocks/PeopleCardsBlock'
import { RichTextBlock } from './blocks/RichTextBlock'
import { RoleExpectationsBlock } from './blocks/RoleExpectationsBlock'
import { TimelineBlock } from './blocks/TimelineBlock'
import { ToolTilesBlock } from './blocks/ToolTilesBlock'
import { TutorialCardsBlock } from './blocks/TutorialCardsBlock'
import { VideoBlock } from './blocks/VideoBlock'
import { WarningBoxBlock } from './blocks/WarningBoxBlock'

interface BlockRendererProps {
  /** A top-level block carries its video details; a conditional's children are plain blocks. */
  block: Block | ModuleBlockView
  context: BlockContext
}

/** The switch is exhaustive: a new block type with no renderer here is a TypeScript error. */
export function BlockRenderer({ block, context }: BlockRendererProps) {
  switch (block.type) {
    case 'video':
      return <VideoBlock block={block} context={context} />
    case 'richText':
      return <RichTextBlock block={block} />
    case 'peopleCards':
      return <PeopleCardsBlock block={block} view={context.view} />
    case 'linkCards':
      return <LinkCardsBlock block={block} view={context.view} />
    case 'tutorialCards':
      return <TutorialCardsBlock block={block} context={context} />
    case 'checklist':
      return <ChecklistBlock block={block} context={context} />
    case 'dataTable':
      return <DataTableBlock headers={block.headers} rows={block.rows} />
    case 'warningBox':
      return <WarningBoxBlock block={block} />
    case 'inputField':
      return <InputFieldBlock block={block} context={context} />
    case 'acknowledgement':
      return <AcknowledgementBlock block={block} context={context} />
    case 'copyText':
      return <CopyTextBlock block={block} />
    case 'timeline':
      return <TimelineBlock block={block} />
    case 'toolTiles':
      return <ToolTilesBlock block={block} view={context.view} />
    case 'libraryCards':
      return <LibraryCardsBlock block={block} view={context.view} />
    case 'callTimes':
      return <CallTimesBlock view={context.view} />
    case 'roleExpectations':
      return <RoleExpectationsBlock view={context.view} />
    case 'dashboardLink':
      return <DashboardLinkBlock block={block} context={context} />
    case 'conditional':
      // filterBlocks has already flattened these on the server.
      return (
        <>
          {block.children.map((child, index) => (
            <BlockRenderer key={index} block={child} context={context} />
          ))}
        </>
      )
    default:
      return assertNever(block)
  }
}

function assertNever(block: never): never {
  throw new Error(`No renderer for block ${JSON.stringify(block)}`)
}
