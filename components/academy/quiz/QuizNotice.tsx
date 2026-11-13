import { Info } from 'lucide-react'

/** The server's own words, on whichever screen the hire lands on. */
export function QuizNotice({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-academy-blue-tint px-4 py-3 text-[15px] text-academy-navy">
      <Info aria-hidden className="mt-0.5 size-5 shrink-0 text-academy-blue-dark" />
      <span>{message}</span>
    </p>
  )
}
