import { academySerif } from '../fonts'

interface QuizHeaderProps {
  lead: string
  accent: string
  children?: React.ReactNode
}

/** The Academy's blue band and headline pattern. The h1 takes focus when the screen changes. */
export function QuizHeader({ lead, accent, children }: QuizHeaderProps) {
  return (
    <header className="bg-academy-blue text-white">
      <div className="mx-auto w-full max-w-[720px] px-5 pb-7 pt-7 sm:pb-9 sm:pt-9">
        <h1
          tabIndex={-1}
          className="text-balance text-[1.75rem] font-extrabold leading-[1.08] tracking-tight outline-none sm:text-[2.5rem]"
        >
          {lead}{' '}
          <span className={`${academySerif.className} text-[1.15em] font-normal italic tracking-normal`}>{accent}</span>
        </h1>
        {children}
      </div>
    </header>
  )
}
