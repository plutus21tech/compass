import { EB_Garamond, Inter } from 'next/font/google'

export const academySans = Inter({ subsets: ['latin'], display: 'swap' })

export const academySerif = EB_Garamond({
  subsets: ['latin'],
  style: 'italic',
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-academy-serif',
})
