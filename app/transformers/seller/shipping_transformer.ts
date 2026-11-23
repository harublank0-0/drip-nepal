import type { DeliveryAreas } from '#modules/logistics/queries'
import type { ShopShippingState } from '#modules/shops/queries'

/*
 * A shop's delivery configuration for its members, as `getShopShipping`
 * answers it (docs/06 §13.5; R1-S part 1c), and with it
 * `replaceShopShipping`'s answer and 412 `current` and the
 * `/seller/{shopSlug}/shipping` page's `shipping` prop: the covered
 * districts by code, one rate per zone with the fee as money (06 §3.3:
 * `{amount_minor, currency}`, integer paisa, ADR-0007) and the delivery
 * estimate in days, `configured` (the publish gate's "shipping is
 * configured" condition, AC-FR-CAT-005-2), and `version`, which the ETag
 * repeats. No personal data: the same for every member.
 */
export function shopShippingJson(state: ShopShippingState) {
  return {
    coverage: state.coverage,
    rates: state.rates.map((rate) => ({
      zone_code: rate.zoneCode,
      fee: { amount_minor: rate.feeMinor, currency: 'NPR' as const },
      est_min_days: rate.estMinDays,
      est_max_days: rate.estMaxDays,
    })),
    configured: state.configured,
    version: state.version,
  }
}

/*
 * The shipping editor's reference data, the page's `delivery_areas` prop
 * (docs/08 §2.5 `/shipping`): the active zones in their editor order, and
 * the active provinces with their active districts, each with its zone.
 * Public data, the same for every shop (docs/04a §9.1–§9.5; VX-10).
 */
export function deliveryAreasJson(areas: DeliveryAreas) {
  return {
    zones: areas.zones.map((zone) => ({ code: zone.code, name: zone.name })),
    provinces: areas.provinces.map((province) => ({
      code: province.code,
      name: province.name,
      districts: province.districts.map((district) => ({
        code: district.code,
        name: district.name,
        zone_code: district.zoneCode,
      })),
    })),
  }
}
