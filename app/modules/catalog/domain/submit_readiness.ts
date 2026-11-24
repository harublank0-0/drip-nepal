/*
 * What still blocks `submitProductForReview` and publishing (docs/09 §12.9;
 * 01 AC-FR-CAT-005-2; docs/04a §7.6 `products_disclosures_check`), one pure
 * function for the editor's `missing_for_submit` and the submit refusal, so
 * the two cannot disagree (T-CAT-002). In this order:
 *
 * 1. `variants`: no active variant, or an active variant priced at 0 (the
 *    default variant `createProduct` makes);
 * 2. `media`: no `ready` image;
 * 3. each disclosure still null, by column: `description`,
 *    `manufacturer_name`, `warranty_text`, `care_and_precautions`, and
 *    `country_of_origin` when the product is imported.
 *
 * The shop's own conditions (an active shop with an accepted agreement,
 * shipping configured) are not product fields and never appear here.
 */
export type ReadinessProduct = {
  description: string | null
  manufacturerName: string | null
  warrantyText: string | null
  careAndPrecautions: string | null
  isImported: boolean
  countryOfOrigin: string | null
}

export type ReadinessVariant = { status: string; priceMinor: number }

export function missingForSubmit(
  product: ReadinessProduct,
  variants: readonly ReadinessVariant[],
  readyMediaCount: number
): string[] {
  const missing: string[] = []
  const active = variants.filter((variant) => variant.status === 'active')
  if (active.length === 0 || active.some((variant) => variant.priceMinor <= 0)) {
    missing.push('variants')
  }
  if (readyMediaCount < 1) missing.push('media')
  if (product.description === null) missing.push('description')
  if (product.manufacturerName === null) missing.push('manufacturer_name')
  if (product.warrantyText === null) missing.push('warranty_text')
  if (product.careAndPrecautions === null) missing.push('care_and_precautions')
  if (product.isImported && product.countryOfOrigin === null) missing.push('country_of_origin')
  return missing
}
