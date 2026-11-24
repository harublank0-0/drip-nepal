/*
 * A variant's option signature (docs/04 §3.5, docs/04a §7.9; R1-S part 2b):
 * the canonical text of its combination, `attribute_code:value_code` pairs
 * sorted by attribute code and joined with `|`, such as
 * `apparel_size:m|color:black`; `''` for the option-less default variant.
 * Sorted by code, not by axis position, so reordering the axes never
 * changes a signature. The partial unique index
 * `product_variants_product_signature_key` turns "no two active variants of
 * a product share a combination" into string equality (T-CAT-102).
 */
export function optionSignature(codes: Readonly<Record<string, string>>): string {
  return Object.entries(codes)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([attribute, value]) => `${attribute}:${value}`)
    .join('|')
}
