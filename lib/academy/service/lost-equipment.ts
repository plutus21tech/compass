import type { PrismaClient } from '@prisma/client'
import { parseBlocks, type Block } from '../blocks'
import { renderPlaceholders } from '../placeholders'
import { contactList } from '../view'
import { listKeyContacts } from './library'

/** Module 7, where HR keeps the steps for lost, stolen or damaged equipment. */
export const SECURITY_MODULE_SLUG = 'security'
const SECURITY_FALLBACK = 'Security and IT'

export interface LostEquipmentView {
  heading: string
  markdown: string
}

type WarningBox = Extract<Block, { type: 'warningBox' }>

/** The first warning box, looking inside conditional groups too. */
function firstWarningBox(blocks: readonly Block[]): WarningBox | null {
  for (const block of blocks) {
    if (block.type === 'warningBox') return block
    if (block.type === 'conditional') {
      const inner = firstWarningBox(block.children)
      if (inner) return inner
    }
  }
  return null
}

/**
 * The warning box from Module 7's published version, ready to show. Null when the module is not
 * seeded, has no published version or no such block, so the dashboard simply shows nothing.
 */
export async function loadLostEquipment(db: PrismaClient): Promise<LostEquipmentView | null> {
  const module = await db.onboardingModule.findUnique({
    where: { slug: SECURITY_MODULE_SLUG },
    select: { currentVersionId: true },
  })
  if (!module?.currentVersionId) return null
  const version = await db.onboardingModuleVersion.findUnique({
    where: { id: module.currentVersionId },
    select: { blocks: true },
  })
  if (!version) return null

  let blocks: Block[]
  try {
    blocks = parseBlocks(version.blocks)
  } catch (error) {
    console.error('[academy] module 7 content is not valid blocks', error)
    return null
  }
  const box = firstWarningBox(blocks)
  if (!box) return null

  const contacts = (await listKeyContacts(db))
    .filter((c) => c.group === 'SECURITY_IT')
    .map((c) => ({ name: c.user?.name ?? c.label ?? '', email: c.email ?? c.user?.email ?? null }))
  const values = { 'security contacts': contactList(contacts, SECURITY_FALLBACK) }
  return {
    heading: renderPlaceholders(box.heading, values),
    markdown: renderPlaceholders(box.markdown, values),
  }
}
