// Academy brand tokens (design sections 7 and 13). No React here: tailwind.config.ts imports this file.
import type { CSSProperties } from 'react'

export const ACADEMY_COLOURS = {
  blue: '#3463EC',
  'blue-dark': '#2A50C4',
  'blue-tint': '#EDF1FE',
  navy: '#2A2F40',
  paper: '#FCFCFC',
  slate: '#565C70',
  line: '#DFE3EE',
  'muted-fill': '#E6E9F1',
  danger: '#B3261E',
  'danger-tint': '#FDEEED',
  success: '#17693F',
  'success-on-navy': '#8FE3B4',
  // Plutus Blue lifted for marks on navy, where #3463EC is under 3:1.
  'blue-on-navy': '#93ADFF',
  'navy-deep': '#1E2230',
} as const

/** Used only as fills and strips, with navy text. Stage 2 has no value cards yet. */
export const VALUE_COLOURS = {
  innovation: '#FFBD59',
  integrity: '#CB6CE6',
  excellence: '#FF5757',
  clientCentric: '#38B6FF',
  collaboration: '#7ED957',
  accountability: '#FF66C4',
  speed: '#FF914D',
} as const

/** A question with no value, or one HR typed differently, gets a neutral strip. */
export function valueStripColour(valueKey: string | null): string {
  const known = valueKey !== null && Object.prototype.hasOwnProperty.call(VALUE_COLOURS, valueKey)
  return known ? VALUE_COLOURS[valueKey as keyof typeof VALUE_COLOURS] : ACADEMY_COLOURS.line
}

/**
 * Points the shared components/ui parts at the Academy palette, whatever theme the app is in: the
 * course is always on Paper. Portalled parts such as a dropdown need this on their own root too.
 */
export const ACADEMY_THEME_VARS = {
  '--background': '0 0% 98.8%',
  '--foreground': '226 21% 21%',
  '--card': '0 0% 100%',
  '--card-foreground': '226 21% 21%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '226 21% 21%',
  '--primary': '225 83% 57%',
  '--primary-foreground': '0 0% 100%',
  '--muted': '224 26% 92%',
  '--muted-foreground': '226 14% 39%',
  '--accent': '226 85% 96%',
  '--accent-foreground': '226 21% 21%',
  '--border': '225 29% 91%',
  '--input': '225 15% 62%',
  '--ring': '225 83% 57%',
} as CSSProperties
