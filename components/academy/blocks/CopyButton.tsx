'use client'

import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCopy } from '../useCopy'

interface CopyButtonProps {
  text: string
  /** Says what is copied, for screen readers: "Copy Headline". */
  label: string
}

export function CopyButton({ text, label }: CopyButtonProps) {
  const { copied, copy } = useCopy()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 shrink-0 rounded-lg bg-white"
      onClick={() => copy(text)}
      aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}
