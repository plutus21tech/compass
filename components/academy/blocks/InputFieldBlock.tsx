import type { Block } from '@/lib/academy/blocks'
import type { BlockContext } from '../types'
import { BankField } from './BankField'
import { DiscordField } from './DiscordField'
import { LinkedinField } from './LinkedinField'
import { PayoutField } from './PayoutField'

interface InputFieldBlockProps {
  block: Extract<Block, { type: 'inputField' }>
  context: BlockContext
}

export function InputFieldBlock({ block, context }: InputFieldBlockProps) {
  switch (block.target) {
    case 'discordUsername':
      return <DiscordField label={block.label} context={context} />
    case 'linkedinUrl':
      return <LinkedinField label={block.label} context={context} />
    case 'bank':
      return <BankField label={block.label} context={context} />
    case 'payout':
      return <PayoutField label={block.label} context={context} />
  }
}
