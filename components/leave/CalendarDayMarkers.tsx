'use client'

/**
 * Holiday and birthday markers on the leave calendar. Styled apart from leave events
 * (outlined, not filled) so nobody reads a holiday as someone's leave.
 */

export interface CalendarHoliday {
  id: string
  date: string // YYYY-MM-DD
  name: string
}

export interface CalendarBirthday {
  userId: string
  name: string
  day: number
}

export const birthdayLabel = (name: string) => `${name}'s birthday`

const HOLIDAY_CLASS =
  'text-[10px] px-1 py-0.5 rounded truncate border border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-300'
const BIRTHDAY_CLASS =
  'text-[10px] px-1 py-0.5 rounded truncate border border-dashed border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-500/40 dark:bg-pink-500/10 dark:text-pink-300'

export function CalendarDayMarkers({
  holidays,
  birthdays,
}: {
  holidays: readonly CalendarHoliday[]
  birthdays: readonly CalendarBirthday[]
}) {
  if (holidays.length === 0 && birthdays.length === 0) return null

  // One birthday chip per day keeps the cell readable; the rest are in its tooltip.
  const [firstBirthday, ...otherBirthdays] = birthdays
  const birthdayTitle = birthdays.map((b) => birthdayLabel(b.name)).join('\n')

  return (
    <div className="mt-1 space-y-0.5 w-full">
      {holidays.map((holiday) => (
        <div key={holiday.id} className={HOLIDAY_CLASS} title={`Holiday: ${holiday.name}`}>
          {holiday.name}
        </div>
      ))}
      {firstBirthday && (
        <div className={BIRTHDAY_CLASS} title={birthdayTitle}>
          {birthdayLabel(firstBirthday.name.split(' ')[0])}
          {otherBirthdays.length > 0 ? ` +${otherBirthdays.length}` : ''}
        </div>
      )}
    </div>
  )
}

export function CalendarMarkerLegend() {
  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded border border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10" />
        <span className="text-muted-foreground">Holiday (not counted as leave)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded border border-dashed border-pink-300 bg-pink-50 dark:border-pink-500/40 dark:bg-pink-500/10" />
        <span className="text-muted-foreground">Birthday</span>
      </div>
    </>
  )
}
