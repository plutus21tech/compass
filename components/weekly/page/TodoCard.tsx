import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TodoTag = 'Required' | 'Monthly' | 'Optional'

const TAG: Record<TodoTag, string> = {
  Required: 'bg-primary/10 text-primary',
  Monthly: 'bg-muted text-muted-foreground',
  Optional: 'bg-muted text-muted-foreground',
}

/** A section title above its card, with a short muted note on the right. */
export function SectionTitle({ id, title, note }: { id?: string; title: string; note?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-base font-semibold text-foreground">{title}</h2>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/** A card with a grey footer row: a short status on the left, at most one action on the right. */
export function FooterCard({ children, status, action, className }: { children: ReactNode; status?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex flex-1 flex-col">{children}</div>
      <div className="flex min-h-[3.25rem] items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2.5">
        <p className="min-w-0 text-sm text-muted-foreground">{status}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  )
}

interface TodoCardProps {
  /** What it is: "Weekly questions". */
  label: string
  tag: TodoTag
  icon: ReactNode
  title: string
  line?: ReactNode
  /** One supporting line or a progress bar. */
  children?: ReactNode
  status: ReactNode
  /** The one button; only the required task uses the primary style. */
  action?: ReactNode
}

/**
 * One to-do: the same anatomy for every card, so the three sit at one height with their footers in a line.
 * Label and tag, then icon with a bold title and one muted line, one supporting line, then the footer.
 */
export function TodoCard({ label, tag, icon, title, line, children, status, action }: TodoCardProps) {
  return (
    <FooterCard status={status} action={action}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', TAG[tag])}>{tag}</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{title}</p>
            {line ? <p className="mt-0.5 text-sm text-muted-foreground">{line}</p> : null}
          </div>
        </div>
        {children ? <div className="mt-auto">{children}</div> : null}
      </div>
    </FooterCard>
  )
}
