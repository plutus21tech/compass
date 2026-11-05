// Pure wording and mapping for the module page. No server-only imports: safe for client components.
import type { KeyContactGroup, OnboardingPaymentMethod, TransportMode } from '@prisma/client'
import { applyEvent, type ProgressEvent, type ProgressState } from './progress'
import type { CommuteRow, HomeView, KeyContactsView, ModuleCardView, ModuleProgressView, PersonView, ReleasedHomeView } from './view'

const SAVING_REASON = 'Saving your progress...'
const DATE_LOCALE = 'en-GB'
const DEFAULT_TIME_ZONE = 'UTC'

export function moduleNumberLabel(number: number, total: number): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `MODULE ${pad(number)} OF ${pad(total)}`
}

export type FooterState = { kind: 'done' } | { kind: 'ready' } | { kind: 'blocked'; reason: string }

/** The server's reason, unchanged. While a tick is still saving, `completion` may be out of date. */
export function footerState(progress: ModuleProgressView, unsavedEvents: number): FooterState {
  if (progress.status === 'COMPLETED') return { kind: 'done' }
  if (!progress.completion.met) return { kind: 'blocked', reason: progress.completion.reason }
  return unsavedEvents > 0 ? { kind: 'blocked', reason: SAVING_REASON } : { kind: 'ready' }
}

/** What the hire sees: the server's state with the events still on their way laid on top, in order. */
export function displayedState(confirmed: ProgressState, pending: readonly ProgressEvent[], now: Date): ProgressState {
  return pending.reduce((state, event) => applyEvent(state, event, now), confirmed)
}

function formatDate(iso: string, timeZone: string | null, month: 'short' | 'long'): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month,
    year: 'numeric',
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
  }).format(new Date(iso))
}

/** A time zone is always passed, so the server and the browser print the same date. */
export function formatAcademyDate(iso: string, timeZone: string | null): string {
  return formatDate(iso, timeZone, 'short')
}

/** "4 December 2026", on the day it was for the hire. */
export function formatCertificateDate(iso: string, timeZone: string | null): string {
  return formatDate(iso, timeZone, 'long')
}

export function formatAcademyDateTime(iso: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat(DATE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone ?? DEFAULT_TIME_ZONE,
  }).format(new Date(iso))
}

export function moduleStatusLabel(card: ModuleCardView, timeZone: string | null): string {
  switch (card.status) {
    case 'LOCKED':
      return `Complete Module ${card.number - 1} first`
    case 'AVAILABLE':
      return 'Start'
    case 'IN_PROGRESS':
      return 'Continue'
    case 'COMPLETED':
      return card.completedAt ? `Completed ${formatAcademyDate(card.completedAt, timeZone)}` : 'Completed'
  }
}

const TO_BE_CONFIRMED = 'Time to be confirmed'

/** A call time in the hire's own zone. With no known zone the time is in UTC, and it says so. */
export function callTimeLabel(iso: string | null, timeZone: string | null): string {
  if (!iso) return TO_BE_CONFIRMED
  return `${formatAcademyDateTime(iso, timeZone)}${timeZone ? '' : ' UTC'}`
}

export type HomeNextStep = 'next' | 'all-done' | 'waiting-next'

/** What the top of Home shows: the next module, the finished message, or a note that nothing is open yet. */
export function homeNextStep(view: ReleasedHomeView): HomeNextStep {
  if (view.total > 0 && view.doneCount === view.total) return 'all-done'
  return view.nextModule ? 'next' : 'waiting-next'
}

export type HomePanel = 'home' | 'waiting' | 'nothing-to-do'

/** A hire with no released course waits; anyone else with no course has nothing to do here. */
export function homePanel(view: HomeView, hireWaiting: boolean): HomePanel {
  if (view.released) return 'home'
  return hireWaiting ? 'waiting' : 'nothing-to-do'
}

const OVERDUE_CHIP = 'Overdue'

/** The Home card's status words, and a red chip for any unfinished card that is late. */
export function moduleCardCopy(card: ModuleCardView, timeZone: string | null = null): { label: string; chip: string | null } {
  return {
    label: moduleStatusLabel(card, timeZone),
    chip: card.overdue && card.status !== 'COMPLETED' ? OVERDUE_CHIP : null,
  }
}

export function completionToast(number: number, nextTitle: string | null): string {
  const done = `Nice, Module ${number} done`
  // "How We Work: Tools and Rhythm" reads better in a toast as "How We Work".
  return nextTitle ? `${done} — next up: ${nextTitle.split(':')[0]}` : done
}

export function neighbourSlugs(
  rail: readonly ModuleCardView[], slug: string,
): { previous: string | null; nextTitle: string | null } {
  const index = rail.findIndex((card) => card.slug === slug)
  return { previous: rail[index - 1]?.slug ?? null, nextTitle: rail[index + 1]?.title ?? null }
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const ends = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return ends.map((word) => word[0].toUpperCase()).join('')
}

export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//i.test(href)
}

export interface UnavailableAction { label: string; note: string }

const UNAVAILABLE_LINE = /(?:^|\n)[ \t]*\*\*([^*\n]+)\*\*[ \t]*\((Available after onboarding)\)\s*$/

/** A closing "**Action** (Available after onboarding)" line is shown as a disabled button. */
export function splitUnavailableAction(markdown: string): { markdown: string; action: UnavailableAction | null } {
  const match = UNAVAILABLE_LINE.exec(markdown)
  if (!match) return { markdown, action: null }
  return { markdown: markdown.slice(0, match.index).trimEnd(), action: { label: match[1], note: match[2] } }
}

export interface PeopleSources {
  lead: PersonView | null
  team: PersonView[]
  buddy: PersonView | null
  keyContacts: KeyContactsView
}

function onePerPerson(people: readonly PersonView[]): PersonView[] {
  return people.filter((person, index) => people.findIndex((p) => p.id === person.id) === index)
}

export function peopleForBlock(
  source: 'lead' | 'team' | 'buddy' | 'keyContacts', group: string | undefined, people: PeopleSources,
): PersonView[] {
  switch (source) {
    case 'lead':
      return people.lead ? [people.lead] : []
    case 'buddy':
      return people.buddy ? [people.buddy] : []
    case 'team':
      return people.team
    case 'keyContacts':
      if (group === undefined) return onePerPerson(Object.values(people.keyContacts).flat())
      return Object.prototype.hasOwnProperty.call(people.keyContacts, group)
        ? people.keyContacts[group as KeyContactGroup]
        : []
  }
}

/** The methods the payout form offers. PK_BANK has its own form. */
export type PayoutMethod = Exclude<OnboardingPaymentMethod, 'PK_BANK'>

export interface PayoutField {
  name: string
  label: string
  hint?: string
  type?: 'email'
  multiline?: boolean
  optional?: boolean
  /** Codes such as a currency: the schema wants capitals, the hire should not have to care. */
  upperCase?: boolean
}

const HOLDER: PayoutField = { name: 'accountHolderName', label: 'Account holder name' }
const CURRENCY: PayoutField = { name: 'currency', label: 'Currency', hint: 'Three letters, like USD', upperCase: true }
const WALLET: PayoutField[] = [HOLDER, { name: 'payoutEmail', label: 'Payout email', type: 'email' }, CURRENCY]

const PAYOUT_FIELDS: Record<PayoutMethod, PayoutField[]> = {
  WISE: WALLET,
  PAYONEER: WALLET,
  BANK_TRANSFER: [
    HOLDER,
    { name: 'bankName', label: 'Bank name' },
    { name: 'accountNumberOrIban', label: 'Account number or IBAN' },
    { name: 'swiftBic', label: 'SWIFT/BIC', hint: '8 or 11 characters', upperCase: true },
    { name: 'bankCountry', label: 'Bank country', hint: 'Two letters, like GB', upperCase: true },
    { name: 'bankAddress', label: 'Bank address', optional: true },
    CURRENCY,
  ],
  OTHER: [
    HOLDER,
    { name: 'instructions', label: 'How should we pay you?', multiline: true },
    CURRENCY,
  ],
}

export const PAYOUT_METHODS: ReadonlyArray<{ value: PayoutMethod; label: string }> = [
  { value: 'WISE', label: 'Wise' },
  { value: 'PAYONEER', label: 'Payoneer' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'OTHER', label: 'Something else' },
]

export function payoutFieldsFor(method: PayoutMethod): readonly PayoutField[] {
  return PAYOUT_FIELDS[method]
}

/** Only the chosen method's fields reach the server, whatever the form held. */
export function payoutBody(method: PayoutMethod, values: Record<string, string>): Record<string, string> {
  const entries = payoutFieldsFor(method).flatMap((field): Array<[string, string]> => {
    const trimmed = (values[field.name] ?? '').trim()
    if (field.optional && !trimmed) return []
    return [[field.name, field.upperCase ? trimmed.toUpperCase() : trimmed]]
  })
  return { method, ...Object.fromEntries(entries) }
}

const TRANSPORT_LABELS: Record<TransportMode, string> = { CAR: 'Car', BIKE: 'Bike', PUBLIC_TRANSPORT: 'Public transport' }
const COMMUTE_CURRENCY = 'PKR'

export interface TableView { headers: string[]; rows: string[][] }

export function commuteTable(rows: readonly CommuteRow[]): TableView {
  return {
    headers: ['Transport', 'Distance', 'Monthly rate'],
    rows: rows.map((row) => [
      TRANSPORT_LABELS[row.transportMode],
      row.maxKm === null ? `Over ${row.minKm} km` : `${row.minKm} to ${row.maxKm} km`,
      `${COMMUTE_CURRENCY} ${row.monthlyRate.toLocaleString('en-US')}`,
    ]),
  }
}
