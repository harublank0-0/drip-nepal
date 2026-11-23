/*
 * The rules of the shipping form of `/seller/{shopSlug}/shipping` (docs/08
 * §2.5; 01 FR-SHOP-004; R1-S part 1c) that need no browser, so they are
 * tested on their own (T-UI-041): which districts a choice covers, which
 * zones then need a rate, what differs from the saved shipping (only the
 * changed set is sent, docs/06 §13.5), and where a server error on a
 * nested member lands in the form. Money stays integer paisa throughout
 * (ADR-0007): the form turns typed rupees into paisa with
 * `parseRupeesToMinor` before these run.
 */
export type DeliveryZone = { code: string; name: string }
export type DeliveryDistrict = { code: string; name: string; zone_code: string }
export type DeliveryProvince = { code: string; name: string; districts: DeliveryDistrict[] }
export type DeliveryAreas = { zones: DeliveryZone[]; provinces: DeliveryProvince[] }

export type SavedRate = {
  zone_code: string
  fee: { amount_minor: number; currency: string }
  est_min_days: number
  est_max_days: number
}
export type ShopShipping = {
  coverage: string[]
  rates: SavedRate[]
  configured: boolean
  version: number
}

// A rate as `replaceShopShipping` takes it.
export type RateInput = {
  zone_code: string
  fee_minor: number
  est_min_days: number
  est_max_days: number
}

/** Every district the editor offers, by code. */
export function offeredDistricts(areas: DeliveryAreas): string[] {
  return areas.provinces.flatMap((province) => province.districts.map((d) => d.code)).sort()
}

/*
 * The saved coverage the form can show: the codes the editor offers. A
 * district the reference data has since made inactive is not offered, so a
 * coverage save drops it (docs/04a §9 "Changes"); until then it stays saved.
 */
export function savedCoverage(shipping: ShopShipping, areas: DeliveryAreas): string[] {
  const offered = new Set(offeredDistricts(areas))
  return shipping.coverage.filter((code) => offered.has(code)).sort()
}

/** Whether the saved coverage is every offered district ("Deliver to every district"). */
export function coversEveryDistrict(shipping: ShopShipping, areas: DeliveryAreas) {
  const offered = offeredDistricts(areas)
  return offered.length > 0 && sameCodes(savedCoverage(shipping, areas), offered)
}

/** The coverage a choice gives: every offered district, or the chosen ones that are offered. */
export function coverageFor(all: boolean, chosen: readonly string[], areas: DeliveryAreas) {
  const offered = offeredDistricts(areas)
  if (all) return offered
  const picked = new Set(chosen)
  return offered.filter((code) => picked.has(code))
}

/** How many covered districts each zone holds; a zone with none is absent. */
export function coveredByZone(coverage: readonly string[], areas: DeliveryAreas) {
  const covered = new Set(coverage)
  const counts = new Map<string, number>()
  for (const province of areas.provinces) {
    for (const district of province.districts) {
      if (covered.has(district.code)) {
        counts.set(district.zone_code, (counts.get(district.zone_code) ?? 0) + 1)
      }
    }
  }
  return counts
}

export function sameCodes(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((code, index) => code === b[index])
}

const byZone = (rates: readonly RateInput[]) =>
  [...rates].sort((a, b) => (a.zone_code < b.zone_code ? -1 : a.zone_code > b.zone_code ? 1 : 0))

export function sameRates(a: readonly RateInput[], b: readonly RateInput[]) {
  const left = byZone(a)
  const right = byZone(b)
  return (
    left.length === right.length &&
    left.every((rate, index) => {
      const other = right[index]
      return (
        rate.zone_code === other.zone_code &&
        rate.fee_minor === other.fee_minor &&
        rate.est_min_days === other.est_min_days &&
        rate.est_max_days === other.est_max_days
      )
    })
  )
}

/** The saved rates of the zones the editor offers, as `replaceShopShipping` takes them. */
export function savedRates(shipping: ShopShipping, zones: readonly DeliveryZone[]): RateInput[] {
  const offered = new Set(zones.map((zone) => zone.code))
  return shipping.rates
    .filter((rate) => offered.has(rate.zone_code))
    .map((rate) => ({
      zone_code: rate.zone_code,
      fee_minor: rate.fee.amount_minor,
      est_min_days: rate.est_min_days,
      est_max_days: rate.est_max_days,
    }))
}

/*
 * What a 412's `current` changed against the shipping the form started
 * from, for the conflict panel: whether the coverage differs, and the zones
 * whose rate differs, in the editor's order.
 */
export function changedSince(before: ShopShipping, after: ShopShipping, areas: DeliveryAreas) {
  const coverage = !sameCodes(savedCoverage(before, areas), savedCoverage(after, areas))
  const was = savedRates(before, areas.zones)
  const now = savedRates(after, areas.zones)
  const zones = areas.zones.filter((zone) => {
    const left = was.filter((rate) => rate.zone_code === zone.code)
    const right = now.filter((rate) => rate.zone_code === zone.code)
    return !sameRates(left, right)
  })
  return { coverage, zones: zones.map((zone) => zone.code) }
}

// The form's name for each member of a rate.
const RATE_FIELD: Record<string, string> = {
  zone_code: 'fee',
  fee_minor: 'fee',
  est_min_days: 'min_days',
  est_max_days: 'max_days',
}

/*
 * The form field a server error item belongs to (docs/08 §7.1): anything on
 * `coverage` to the district choice, `districts`; a member of the rate the
 * request sent at index `i` to that zone's field in the form, whose rates
 * follow `zones` (`rates[<zone index>].fee`, `.min_days`, `.max_days`);
 * anything else, `rates` itself included, to the error summary (null).
 * `sentZones` are the zone codes of the request's `rates`, in its order.
 */
export function formFieldOf(
  field: string | null,
  sentZones: readonly string[],
  zones: readonly DeliveryZone[]
): string | null {
  if (field === null) return null
  if (field === 'coverage' || field.startsWith('coverage.')) return 'districts'
  const match = /^rates\.(\d+)\.([a-z_]+)$/.exec(field)
  if (!match) return null
  const zone = sentZones[Number(match[1])]
  const index = zones.findIndex((candidate) => candidate.code === zone)
  const member = RATE_FIELD[match[2]]
  return index === -1 || !member ? null : `rates[${index}].${member}`
}

// A day count as typed: a whole number from 0 to 30, else null.
export function parseDays(typed: string, max = 30): number | null {
  const value = typed.trim()
  if (!/^\d{1,2}$/.test(value)) return null
  const days = Number(value)
  return days <= max ? days : null
}
