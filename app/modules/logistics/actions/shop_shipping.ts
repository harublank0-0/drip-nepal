import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, type ProblemErrorItem } from '#exceptions/domain_error'
import { shopShipping, type ShopRate } from '#modules/logistics/queries'

/*
 * The step action behind `replaceShopShipping` (docs/06 §13.5; 04a §9.6,
 * §9.7; 01 FR-SHOP-004; R1-S part 1c). It runs inside the shops entry
 * action's transaction, after that action has locked the shop row (docs/05
 * §4.4 level 0), the gate and the version: every writer of these two tables
 * locks the shop first, so the rows read here cannot change under it.
 *
 * Each change replaces its set whole; an absent one keeps the saved set:
 * - `coverage`, the districts the shop delivers to: each an active district
 *   of an active province with an active zone (else 422 `not_offered` on
 *   `coverage.<i>`); duplicates are the validator's (`distinct`).
 * - `rates`, one per zone: each zone active (else `not_offered` on
 *   `rates.<i>.zone_code`), the fastest estimate no longer than the slowest
 *   (`less_than_min` on `rates.<i>.est_max_days`; the CHECK
 *   `shop_shipping_rates_estimate_check` is the backstop). A rate for a zone
 *   the shop does not cover is kept: it prices nothing until the shop
 *   covers a district there.
 * Then the rules of 04a §9.6 on the result, the saved sets with the changes
 * laid over them: at least one covered district (AC-FR-SHOP-004-1; 422
 * `required` on `coverage`), and every covered district's zone with a rate
 * (05 §3.3 item 3, T-SHOP-109; 422 `rate_required` on `rates`, naming the
 * zone). A set that equals the saved one is not written.
 *
 * Writes delete and re-insert the changed set (04a §9.6: hard delete is
 * allowed; placed orders keep their fee and zone snapshot,
 * AC-FR-SHOP-004-2). Returns the from and to values of each set written,
 * for the caller's audit row, or an empty object when nothing changed.
 */
export type ShippingChanges = { coverage?: string[]; rates?: ShopRate[] }

type RateRow = { zone_code: string; fee_minor: number; est_min_days: number; est_max_days: number }

export type ShippingWritten = {
  coverage?: { from: string[]; to: string[] }
  rates?: { from: RateRow[]; to: RateRow[] }
}

function invalid(errors: ProblemErrorItem[]) {
  return new DomainError('VALIDATION_FAILED', { detail: 'Some fields need attention.', errors })
}

const byZone = (rates: readonly ShopRate[]) =>
  [...rates].sort((a, b) => (a.zoneCode < b.zoneCode ? -1 : a.zoneCode > b.zoneCode ? 1 : 0))

const rateRow = (rate: ShopRate): RateRow => ({
  zone_code: rate.zoneCode,
  fee_minor: rate.feeMinor,
  est_min_days: rate.estMinDays,
  est_max_days: rate.estMaxDays,
})

function sameRates(a: readonly ShopRate[], b: readonly ShopRate[]) {
  const left = byZone(a)
  const right = byZone(b)
  return (
    left.length === right.length &&
    left.every((rate, index) => {
      const other = right[index]
      return (
        rate.zoneCode === other.zoneCode &&
        rate.feeMinor === other.feeMinor &&
        rate.estMinDays === other.estMinDays &&
        rate.estMaxDays === other.estMaxDays
      )
    })
  )
}

const sameCodes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((code, index) => code === b[index])

export async function replaceShippingRows(
  trx: TransactionClientContract,
  shopId: string,
  changes: ShippingChanges
): Promise<ShippingWritten> {
  const saved = await shopShipping(shopId, { client: trx })
  const zoneRows: { code: string; name_en: string }[] = await trx
    .from('delivery_zones')
    .where('is_active', true)
    .select('code', 'name_en')
  const zoneNames = new Map(zoneRows.map((zone) => [zone.code, zone.name_en]))

  const errors: ProblemErrorItem[] = []
  if (changes.coverage && changes.coverage.length > 0) {
    const offered: { code: string }[] = await trx
      .from('districts as d')
      .join('provinces as p', 'p.code', 'd.province_code')
      .join('delivery_zone_districts as dz', 'dz.district_code', 'd.code')
      .join('delivery_zones as z', 'z.code', 'dz.zone_code')
      .whereIn('d.code', changes.coverage)
      .where('d.is_active', true)
      .where('p.is_active', true)
      .where('z.is_active', true)
      .select('d.code')
    const offeredCodes = new Set(offered.map((row) => row.code))
    for (const [index, code] of changes.coverage.entries()) {
      if (!offeredCodes.has(code)) {
        errors.push({
          field: `coverage.${index}`,
          code: 'not_offered',
          message: 'This is not a district a shop can deliver to.',
        })
      }
    }
  }
  for (const [index, rate] of (changes.rates ?? []).entries()) {
    if (!zoneNames.has(rate.zoneCode)) {
      errors.push({
        field: `rates.${index}.zone_code`,
        code: 'not_offered',
        message: 'This is not a delivery zone.',
      })
    }
    if (rate.estMaxDays < rate.estMinDays) {
      errors.push({
        field: `rates.${index}.est_max_days`,
        code: 'less_than_min',
        message: 'The slowest delivery time cannot be shorter than the fastest.',
      })
    }
  }
  if (errors.length > 0) throw invalid(errors)

  const coverage = changes.coverage ? [...new Set(changes.coverage)].sort() : saved.coverage
  const rates = changes.rates ?? saved.rates
  if (coverage.length === 0) {
    throw invalid([
      {
        field: 'coverage',
        code: 'required',
        message: 'Choose at least one district you deliver to.',
      },
    ])
  }
  const zoned: { zone_code: string }[] = await trx
    .from('delivery_zone_districts')
    .whereIn('district_code', coverage)
    .distinct('zone_code')
  const rated = new Set(rates.map((rate) => rate.zoneCode))
  const unrated = zoned.map((row) => row.zone_code).filter((zone) => !rated.has(zone))
  if (unrated.length > 0) {
    throw invalid(
      unrated.sort().map((zone) => ({
        field: 'rates',
        code: 'rate_required',
        message: `${zoneNames.get(zone) ?? zone} needs a fee and a delivery time, because you deliver to districts in it.`,
      }))
    )
  }

  const written: ShippingWritten = {}
  if (changes.coverage && !sameCodes(coverage, saved.coverage)) {
    await trx.from('shop_delivery_coverage').where('shop_id', shopId).delete()
    await trx
      .table('shop_delivery_coverage')
      .multiInsert(coverage.map((code) => ({ shop_id: shopId, district_code: code })))
    written.coverage = { from: saved.coverage, to: coverage }
  }
  if (changes.rates && !sameRates(rates, saved.rates)) {
    await trx.from('shop_shipping_rates').where('shop_id', shopId).delete()
    if (rates.length > 0) {
      await trx.table('shop_shipping_rates').multiInsert(
        rates.map((rate) => ({
          shop_id: shopId,
          zone_code: rate.zoneCode,
          fee_minor: rate.feeMinor,
          est_min_days: rate.estMinDays,
          est_max_days: rate.estMaxDays,
        }))
      )
    }
    written.rates = { from: byZone(saved.rates).map(rateRow), to: byZone(rates).map(rateRow) }
  }
  return written
}
