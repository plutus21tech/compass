import type { ComponentProps } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { isExternalHref } from '@/lib/academy/view-labels'

type AnchorProps = ComponentProps<'a'>

function MarkdownLink({ href = '', children }: AnchorProps) {
  const external = isExternalHref(href)
  return (
    <a
      href={href}
      className="font-medium text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

// Every heading in copy sits under the page title, so it is an h2 whatever level HR typed.
const heading: Components['h3'] = ({ children }) => <h2 className="pt-4 text-xl font-semibold text-academy-navy">{children}</h2>

const COMPONENTS: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  p: ({ children }) => <p className="leading-7">{children}</p>,
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-5 leading-7 marker:text-academy-blue">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-3 pl-5 leading-7 marker:font-semibold marker:text-academy-blue">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold text-academy-navy">{children}</strong>,
  a: MarkdownLink,
}

interface MarkdownProps {
  children: string
  className?: string
}

/** Copy is treated as markdown only: raw HTML in it is dropped, never rendered. */
export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn('space-y-4 [overflow-wrap:anywhere]', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
