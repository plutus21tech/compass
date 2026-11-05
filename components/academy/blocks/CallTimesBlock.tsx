import type { ModuleView } from '@/lib/academy/view'
import { callTimeLabel } from '@/lib/academy/view-labels'
import { BlockHeading } from './BlockHeading'

interface CallTimesBlockProps {
  view: ModuleView
}

export function CallTimesBlock({ view }: CallTimesBlockProps) {
  const { hrCallAt, teamCallAt, blockersCall, timeZone } = view.callTimes
  const when = (iso: string | null) => callTimeLabel(iso, timeZone)
  const rows = [
    { label: 'Your HR call', value: when(hrCallAt) },
    { label: 'Your team call', value: when(teamCallAt) },
    { label: 'Weekly Blockers Call', value: blockersCall },
  ]
  return (
    <section>
      <BlockHeading>Your calls</BlockHeading>
      <dl className="divide-y divide-academy-line rounded-2xl border border-academy-line bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3">
            <dt className="font-medium text-academy-navy">{row.label}</dt>
            <dd className="tabular-nums text-academy-slate">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
