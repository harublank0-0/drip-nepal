import vine from '@vinejs/vine'
import { SHIPPING_LIMITS } from '#shared/constants/limits'

/*
 * `replaceShopShipping` (docs/06 §13.5; 01 FR-SHOP-004, AC-FR-SHOP-004-1;
 * docs/04a §9.6, §9.7; R1-S part 1c). Two members, each optional and each
 * replaced whole when sent, so a form sends only the set it changed; an
 * absent one keeps the saved set. Anything else (`shop_id`, `version`,
 * `configured`, a `currency`, ...) is refused with `unknown_field` before
 * this runs (`assertKnownMembers`), and so is an unknown member of a rate
 * (`assertKnownItemMembers`; T-SEC-003). Neither may be null: VineJS's
 * `optional()` reads null as missing (vine 4.4), so the controller refuses
 * it first with `assertNotNull`, 422 `required`.
 *
 * - `coverage`: district codes of the shape of docs/04a §9.2, each once
 *   (`distinct`). An empty list is refused by the action, on the result
 *   (`required`, AC-FR-SHOP-004-1), as is a code that is not an active
 *   district (`not_offered`).
 * - `rates`: one object per zone, each zone once (`distinct`): `zone_code`
 *   (the shape of `delivery_zones_code_check`), `fee_minor` in paisa, a
 *   JSON integer from 0 (free delivery) up to a safe integer (ADR-0007,
 *   06 §3.3: never a float or a string), and `est_min_days` and
 *   `est_max_days`, JSON integers from 0 to 30. That the fastest is no
 *   longer than the slowest, that the zone is active, and that every
 *   covered zone has a rate are the action's checks.
 */
export const SHIPPING_MEMBERS = ['coverage', 'rates'] as const
export const RATE_MEMBERS = ['zone_code', 'fee_minor', 'est_min_days', 'est_max_days'] as const

const days = () =>
  vine
    .number({ strict: true })
    .withoutDecimals()
    .range([SHIPPING_LIMITS.estimateDays.min, SHIPPING_LIMITS.estimateDays.max])

export const replaceShopShippingValidator = vine.create({
  coverage: vine
    .array(vine.string().regex(/^[1-7]\d{2}$/))
    .maxLength(SHIPPING_LIMITS.coverage.max)
    .distinct()
    .optional(),
  rates: vine
    .array(
      vine.object({
        zone_code: vine.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
        fee_minor: vine
          .number({ strict: true })
          .withoutDecimals()
          .range([0, Number.MAX_SAFE_INTEGER]),
        est_min_days: days(),
        est_max_days: days(),
      })
    )
    .maxLength(SHIPPING_LIMITS.zones.max)
    .distinct('zone_code')
    .optional(),
})
