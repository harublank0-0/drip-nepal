import type { RuleProblem } from '#modules/catalog/domain/attribute_rules'
import { missingForSubmit, type ReadinessProduct } from '#modules/catalog/domain/submit_readiness'

/*
 * The listing disclosures of E-Commerce Act 2081 s6 on a product (docs/04a
 * §7.6, FR-CAT-012; R1-S part 2a), checked by the actions before the
 * database's CHECKs, so a client gets a 422 on the field and never a 500:
 *
 * - `originProblems`: `products_country_check`. A country, when given,
 *   agrees with `is_imported`: an imported product names a country other
 *   than `NP`, a domestic one names `NP`. A null country is allowed on a
 *   draft; an imported product needs one at submit (`missingForSubmit`).
 * - `liveDisclosureProblems`: `products_disclosures_check`. A product in
 *   `published` or `unpublished` keeps every disclosure, so an edit that
 *   clears one is refused with an item per missing field.
 */
export const LIVE_STATUSES: readonly string[] = ['published', 'unpublished']

export function originProblems(product: {
  isImported: boolean
  countryOfOrigin: string | null
}): RuleProblem[] {
  const { isImported, countryOfOrigin } = product
  if (countryOfOrigin === null) return []
  if (isImported && countryOfOrigin === 'NP') {
    return [
      {
        field: 'country_of_origin',
        code: 'invalid',
        message: 'An imported product is made outside Nepal. Choose that country.',
      },
    ]
  }
  if (!isImported && countryOfOrigin !== 'NP') {
    return [
      {
        field: 'country_of_origin',
        code: 'invalid',
        message: 'A product made outside Nepal is imported. Mark it imported, or choose Nepal.',
      },
    ]
  }
  return []
}

export function liveDisclosureProblems(product: ReadinessProduct): RuleProblem[] {
  return missingForSubmit(product, [{ status: 'active', priceMinor: 1 }], 1).map((field) => ({
    field,
    code: 'required',
    message: 'A live product must keep this filled in.',
  }))
}
