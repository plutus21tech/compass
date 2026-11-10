'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface InvoiceRow {
  department: string
  url: string
}

interface InvoiceTemplatesEditorProps {
  rows: InvoiceRow[]
  onChange: (rows: InvoiceRow[]) => void
}

/** One https invoice template URL per department. */
export function InvoiceTemplatesEditor({ rows, onChange }: InvoiceTemplatesEditorProps) {
  const patch = (index: number, change: Partial<InvoiceRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-[12rem_1fr_auto]">
          <Input aria-label="Department" placeholder="Department" value={row.department} onChange={(e) => patch(index, { department: e.target.value })} />
          <Input aria-label="Invoice template URL" placeholder="https://" value={row.url} onChange={(e) => patch(index, { url: e.target.value })} />
          <Button type="button" variant="ghost" size="sm" aria-label="Remove template" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rows, { department: '', url: 'https://' }])}>
        <Plus className="h-4 w-4" /> Add department
      </Button>
    </div>
  )
}
