import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { AssignedCardView } from '@/lib/academy/view'

interface AssignedCardProps {
  items: readonly AssignedCardView[]
}

/** Staff only ever see this when HR has given them something to read. Nothing here limits their access. */
export function AssignedCard({ items }: AssignedCardProps) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="assigned-heading" className="mb-8">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <BookOpen aria-hidden className="size-4 text-primary" />
            <h2 id="assigned-heading" className="text-base font-semibold text-foreground">
              Assigned to you
            </h2>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {items.map((item) => (
              <li key={item.slug}>
                {/* No prefetch: loading a module marks it as started. */}
                <Link
                  href={`/onboarding/${item.slug}`}
                  prefetch={false}
                  className="flex items-center justify-between gap-3 rounded-lg py-3 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="block font-medium [overflow-wrap:anywhere]">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">
                      {item.reread ? 'Please read this again' : 'HR asked you to read this'}
                      {item.estimatedMinutes > 0 ? ` · About ${item.estimatedMinutes} min` : ''}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}
