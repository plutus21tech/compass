import type { CallTimesView, PersonView } from '@/lib/academy/view'
import { callTimeLabel, initialsOf } from '@/lib/academy/view-labels'
import { CopyButton } from './blocks/CopyButton'

const CARD = 'rounded-2xl border border-academy-line bg-white p-5'
const CARD_HEADING = 'text-lg font-semibold text-academy-navy'

export function CallsCard({ calls }: { calls: CallTimesView }) {
  const rows = [
    { label: 'Your HR call', value: callTimeLabel(calls.hrCallAt, calls.timeZone) },
    { label: 'Your team call', value: callTimeLabel(calls.teamCallAt, calls.timeZone) },
  ]
  return (
    <section aria-labelledby="home-calls" className={CARD}>
      <h2 id="home-calls" className={CARD_HEADING}>Your calls</h2>
      <dl className="mt-3 divide-y divide-academy-line">
        {rows.map((row) => (
          <div key={row.label} className="py-2.5 first:pt-0 last:pb-0">
            <dt className="text-sm text-academy-slate">{row.label}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-academy-navy">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function BuddyCard({ buddy }: { buddy: PersonView | null }) {
  return (
    <section aria-labelledby="home-buddy" className={CARD}>
      <h2 id="home-buddy" className={CARD_HEADING}>Your buddy</h2>
      {buddy ? (
        <div className="mt-3 flex gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-academy-blue-tint text-base font-semibold text-academy-blue-dark"
          >
            {initialsOf(buddy.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-academy-navy [overflow-wrap:anywhere]">{buddy.name}</p>
            {buddy.title ? <p className="text-sm text-academy-slate">{buddy.title}</p> : null}
            {buddy.discordUsername ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-sm text-academy-navy [overflow-wrap:anywhere]">{buddy.discordUsername}</span>
                <CopyButton text={buddy.discordUsername} label={`${buddy.name}'s Discord username`} />
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-academy-slate">Your buddy will appear here.</p>
      )}
    </section>
  )
}
