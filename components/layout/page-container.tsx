export type PageWidth = 'default' | 'wide' | 'reading'

export interface PageContainerProps {
  children: React.ReactNode
  width?: PageWidth
  className?: string
}

const BASE = 'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8'

export function PageContainer({ children, width = 'default', className }: PageContainerProps) {
  const max = width === 'wide' ? 'max-w-[1600px]' : 'max-w-7xl'
  const classes = [BASE, max, className].filter(Boolean).join(' ')
  return <div className={classes}>{width === 'reading' ? <div className="max-w-4xl">{children}</div> : children}</div>
}
