import type { ContractType, EmploymentStatus, WorkMode } from '@prisma/client'
import { countryOf, missingAttributes, type PersonAttributes } from './attributes'

export interface EligibilityRules {
  countries: string[]
  workModes: WorkMode[]
  contractTypes: ContractType[]
  employmentStatuses: EmploymentStatus[]
}

function passes<T>(allowed: readonly T[], value: T | null): boolean {
  if (allowed.length === 0) return true
  return value !== null && allowed.includes(value)
}

/** An empty rule list means "everyone". A restricted card is ineligible while any attribute is missing. */
export function isCardEligible(card: EligibilityRules, person: PersonAttributes): boolean {
  const hasRule =
    card.countries.length + card.workModes.length + card.contractTypes.length + card.employmentStatuses.length > 0
  // Any restricted card stays hidden until HR has completed the person's attributes.
  if (hasRule && missingAttributes(person).length > 0) return false
  return (
    passes(card.countries, countryOf(person)) &&
    passes(card.workModes, person.workMode) &&
    passes(card.contractTypes, person.contractType) &&
    passes(card.employmentStatuses, person.employmentStatus)
  )
}
