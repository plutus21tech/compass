import type { ReactNode } from 'react'

interface BlockHeadingProps {
  children?: ReactNode
  aside?: ReactNode
}

export function BlockHeading({ children, aside }: BlockHeadingProps) {
  if (!children) return null
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold text-academy-navy">{children}</h2>
      {aside ? <span className="shrink-0 text-sm tabular-nums text-academy-slate">{aside}</span> : null}
    </div>
  )
}
