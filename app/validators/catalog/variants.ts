import vine from '@vinejs/vine'

/*
 * `replaceProductVariants` (docs/06 §13.5; `ReplaceProductVariantsRequest`
 * in openapi.yaml; R1-S part 2b). The members are the whole input: anything
 * else, top-level or in a variant, is refused with `unknown_field` before
 * this runs (`assertKnownMembers`, `assertKnownItemMembers`, T-SEC-003);
 * `is_default` and `status` are server-derived. Rules (docs/04a §7.8,
 * §7.9):
 *
 * - `option_axes`: at most two distinct attribute codes (AC-FR-CAT-004-1).
 * - `variants`: 1 to 100 (AC-FR-CAT-004-4), each with an optional `id`, its
 *   `option_value_codes` (axis code → value code), a `sku` of 1 to 64
 *   characters in the shape of `product_variants_sku_check`, `price_minor`
 *   an integer from 0 to 100,000,000 paisa, `compare_at_price_minor` the
 *   same or null, and `weight_grams` 1 to 50,000 or null.
 *
 * Which axes and values are allowed, duplicates, the compare-at rule and a
 * live product's prices are the action's checks, on the request's paths.
 */
export const VARIANT_SET_MEMBERS = ['option_axes', 'variants'] as const

export const VARIANT_MEMBERS = [
  'id',
  'option_value_codes',
  'sku',
  'price_minor',
  'compare_at_price_minor',
  'weight_grams',
] as const

const paisa = () => vine.number({ strict: true }).withoutDecimals().min(0).max(100_000_000)

export const replaceProductVariantsValidator = vine.create({
  option_axes: vine
    .array(vine.string().regex(/^[a-z][a-z0-9_]{1,39}$/))
    .maxLength(2)
    .distinct(),
  variants: vine
    .array(
      vine.object({
        id: vine.string().uuid().optional(),
        option_value_codes: vine.record(vine.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/)),
        sku: vine
          .string()
          .trim()
          .minLength(1)
          .maxLength(64)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/),
        price_minor: paisa(),
        compare_at_price_minor: paisa().nullable().optional(),
        weight_grams: vine
          .number({ strict: true })
          .withoutDecimals()
          .min(1)
          .max(50_000)
          .nullable()
          .optional(),
      })
    )
    .minLength(1)
    .maxLength(100),
})
