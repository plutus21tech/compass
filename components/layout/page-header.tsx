import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  dateLine?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, dateLine, actions, className }: PageHeaderProps) {
  const classes = cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)
  return (
    <header className={classes}>
      <div>
        {dateLine ? (
          <p data-slot="date-line" className="text-sm text-muted-foreground">
            {dateLine}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-light tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {subtitle ? (
          <p data-slot="subtitle" className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div data-slot="actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
