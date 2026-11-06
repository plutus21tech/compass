'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Block } from '@/lib/academy/blocks'
import { ADDABLE_BLOCKS, blockLabel, blockTypeLabel, newBlock, type AddableBlock } from '@/lib/academy/content-rules'
import { BlockForm } from '../BlockForm'
import { insertAt, moveBy, removeAt, replaceAt } from './list-ops'

interface BlockListProps {
  blocks: Block[]
  onChange: (next: Block[]) => void
  /** Whether this list, changed, still lets hires finish the module. */
  isSafe: (next: Block[]) => boolean
  takenKeys: () => string[]
}

type FocusAim = 'first' | 'up' | 'down'

function AddBlockMenu({ onAdd }: { onAdd: (type: AddableBlock) => void }) {
  const picked = useRef<AddableBlock | null>(null)
  // Added once the menu has closed: it hands focus back to its button, and focus should land in the new block.
  const addPicked = (event: Event) => {
    if (!picked.current) return
    event.preventDefault()
    onAdd(picked.current)
    picked.current = null
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-muted-foreground">
          <Plus aria-hidden="true" className="mr-1.5 h-4 w-4" />
          Add a block here
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onCloseAutoFocus={addPicked}>
        {ADDABLE_BLOCKS.map((type) => (
          <DropdownMenuItem key={type} onSelect={() => { picked.current = type }}>{blockTypeLabel(type)}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface BlockCardProps extends Pick<BlockListProps, 'isSafe' | 'takenKeys'> {
  block: Block
  index: number
  list: Block[]
  onReplace: (next: Block) => void
  onMove: (step: -1 | 1) => void
  onRemove: () => void
}

function BlockCard({ block, index, list, onReplace, onMove, onRemove, isSafe, takenKeys }: BlockCardProps) {
  const label = blockLabel(block)
  const nested = block.type === 'conditional'
  const shell = nested ? 'border-l border-border pl-4' : 'rounded-xl border border-border bg-card p-4'
  return (
    <div className={shell}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" data-move="up" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" data-move="down" aria-label={`Move ${label} down`} disabled={index === list.length - 1} onClick={() => onMove(1)}>
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Button>
          {isSafe(removeAt(list, index)) ? (
            <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${label}`} onClick={onRemove}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          ) : (
            <span className="pl-1 text-xs text-muted-foreground">Needed to finish</span>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <BlockForm
          block={block}
          onChange={onReplace}
          isSafe={(next) => isSafe(replaceAt(list, index, next))}
          takenKeys={takenKeys}
        />
      </div>
    </div>
  )
}

/** The blocks of a module, or of one conditional. Conditionals render a BlockList of their own. */
export function BlockList({ blocks, onChange, isSafe, takenKeys }: BlockListProps) {
  const root = useRef<HTMLOListElement>(null)
  const aim = useRef<{ index: number; target: FocusAim } | null>(null)
  const [announcement, setAnnouncement] = useState('')

  // Blocks are keyed by position, so after a move the focus has to be sent after the block.
  useEffect(() => {
    if (!aim.current) return
    const { index, target } = aim.current
    aim.current = null
    const card = root.current?.querySelector<HTMLElement>(`:scope > li[data-index="${index}"]`)
    const wanted = target === 'first' ? 'input, textarea, select' : `[data-move="${target}"]:not(:disabled)`
    const found = card?.querySelector<HTMLElement>(wanted) ?? card?.querySelector<HTMLElement>('[data-move]:not(:disabled)')
    found?.focus()
  }, [blocks])

  const add = (index: number, type: AddableBlock) => {
    aim.current = { index, target: 'first' }
    onChange(insertAt(blocks, index, newBlock(type, takenKeys())))
    setAnnouncement(`${blockTypeLabel(type)} added.`)
  }

  const move = (index: number, step: -1 | 1) => {
    aim.current = { index: index + step, target: step < 0 ? 'up' : 'down' }
    onChange(moveBy(blocks, index, step))
    setAnnouncement(`Moved ${step < 0 ? 'up' : 'down'}.`)
  }

  const remove = (index: number) => {
    aim.current = { index: Math.max(index - 1, 0), target: 'first' }
    onChange(removeAt(blocks, index))
    setAnnouncement('Block deleted.')
  }

  return (
    <div className="space-y-1">
      <p role="status" className="sr-only">{announcement}</p>
      {blocks.length === 0 ? <AddBlockMenu onAdd={(type) => add(0, type)} /> : null}
      <ol ref={root} className="space-y-1">
        {blocks.map((block, index) => (
          <li key={index} data-index={index} className="space-y-1">
            <BlockCard
              block={block}
              index={index}
              list={blocks}
              onReplace={(next) => onChange(replaceAt(blocks, index, next))}
              onMove={(step) => move(index, step)}
              onRemove={() => remove(index)}
              isSafe={isSafe}
              takenKeys={takenKeys}
            />
            <AddBlockMenu onAdd={(type) => add(index + 1, type)} />
          </li>
        ))}
      </ol>
    </div>
  )
}
