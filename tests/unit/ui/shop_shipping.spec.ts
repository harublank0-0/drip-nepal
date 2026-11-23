import { test } from '@japa/runner'
import {
  changedSince,
  coverageFor,
  coveredByZone,
  coversEveryDistrict,
  formFieldOf,
  offeredDistricts,
  parseDays,
  sameRates,
  savedCoverage,
  savedRates,
  type DeliveryAreas,
  type ShopShipping,
} from '#shared/ui/shop_shipping'

/*
 * T-UI-041, the rules part of the shipping form (docs/08 §2.5; R1-S part
 * 1c; shared/ui/shop_shipping.ts): which districts a choice covers and
 * which zones then need a rate, what differs from the saved shipping (only
 * the changed set is sent), what a 412 changed, where a server error on a
 * nested member lands in the form, and the day counts the form accepts.
 * A small dataset stands in for the 77 districts: the rules read only its
 * shape.
 */
const AREAS: DeliveryAreas = {
  zones: [
    { code: 'ktm_valley', name: 'Kathmandu Valley' },
    { code: 'outside_valley', name: 'Outside Kathmandu Valley' },
  ],
  provinces: [
    {
      code: '3',
      name: 'Bagmati',
      districts: [
        { code: '307', name: 'Bhaktapur', zone_code: 'ktm_valley' },
        { code: '301', name: 'Dolakha', zone_code: 'outside_valley' },
        { code: '306', name: 'Kathmandu', zone_code: 'ktm_valley' },
      ],
    },
    {
      code: '4',
      name: 'Gandaki',
      districts: [{ code: '405', name: 'Kaski', zone_code: 'outside_valley' }],
    },
  ],
}

const rate = (zone: string, fee: number, min = 0, max = 1) => ({
  zone_code: zone,
  fee: { amount_minor: fee, currency: 'NPR' },
  est_min_days: min,
  est_max_days: max,
})

const shipping = (coverage: string[], rates = [rate('ktm_valley', 10000)]): ShopShipping => ({
  coverage,
  rates,
  configured: true,
  version: 1,
})

test.group('T-UI-041 the shipping form rules', () => {
  test('T-UI-041 the offered districts are every district of every province, by code', ({
    assert,
  }) => {
    assert.deepEqual(offeredDistricts(AREAS), ['301', '306', '307', '405'])
  })

  test('T-UI-041 "every district" covers all of them; a choice covers the chosen offered ones', ({
    assert,
  }) => {
    assert.deepEqual(coverageFor(true, [], AREAS), ['301', '306', '307', '405'])
    assert.deepEqual(coverageFor(false, ['405', '306', '999'], AREAS), ['306', '405'])
    assert.deepEqual(coverageFor(false, [], AREAS), [])
  })

  test('T-UI-041 the saved coverage drops a district the editor no longer offers', ({ assert }) => {
    const saved = shipping(['306', '799', '307'])
    assert.deepEqual(savedCoverage(saved, AREAS), ['306', '307'])
    assert.isFalse(coversEveryDistrict(saved, AREAS))
    assert.isTrue(coversEveryDistrict(shipping(['301', '306', '307', '405', '799']), AREAS))
    assert.isFalse(coversEveryDistrict(shipping([]), { zones: AREAS.zones, provinces: [] }))
  })

  test('T-UI-041 each zone counts its covered districts; a zone with none needs no rate', ({
    assert,
  }) => {
    const counts = coveredByZone(['306', '307'], AREAS)
    assert.equal(counts.get('ktm_valley'), 2)
    assert.isFalse(counts.has('outside_valley'))
    assert.equal(coveredByZone(['301', '306', '405'], AREAS).get('outside_valley'), 2)
  })

  test('T-UI-041 rates compare by zone, whatever their order', ({ assert }) => {
    const a = [
      { zone_code: 'ktm_valley', fee_minor: 100, est_min_days: 0, est_max_days: 1 },
      { zone_code: 'outside_valley', fee_minor: 200, est_min_days: 2, est_max_days: 3 },
    ]
    assert.isTrue(sameRates(a, [...a].reverse()))
    assert.isFalse(sameRates(a, [a[0]]))
    assert.isFalse(sameRates(a, [a[0], { ...a[1], fee_minor: 201 }]))
    assert.isFalse(sameRates(a, [a[0], { ...a[1], est_max_days: 4 }]))
  })

  test('T-UI-041 the saved rates are those of the offered zones, in paisa', ({ assert }) => {
    const saved = shipping(['306'], [rate('ktm_valley', 15050, 1, 2), rate('mountains', 1)])
    assert.deepEqual(savedRates(saved, AREAS.zones), [
      { zone_code: 'ktm_valley', fee_minor: 15050, est_min_days: 1, est_max_days: 2 },
    ])
  })

  test('T-UI-041 a 412 names the coverage and the zones whose rate changed', ({ assert }) => {
    const before = shipping(['306'], [rate('ktm_valley', 100)])
    assert.deepEqual(changedSince(before, before, AREAS), { coverage: false, zones: [] })
    const after = shipping(['306', '405'], [rate('ktm_valley', 100), rate('outside_valley', 300)])
    assert.deepEqual(changedSince(before, after, AREAS), {
      coverage: true,
      zones: ['outside_valley'],
    })
    const cheaper = shipping(['306'], [rate('ktm_valley', 50)])
    assert.deepEqual(changedSince(before, cheaper, AREAS), {
      coverage: false,
      zones: ['ktm_valley'],
    })
  })

  test('T-UI-041 a server error lands on {expected}')
    .with([
      { field: 'coverage', expected: 'districts' },
      { field: 'coverage.3', expected: 'districts' },
      { field: 'rates.0.fee_minor', expected: 'rates[1].fee' },
      { field: 'rates.0.zone_code', expected: 'rates[1].fee' },
      { field: 'rates.1.est_min_days', expected: 'rates[0].min_days' },
      { field: 'rates.1.est_max_days', expected: 'rates[0].max_days' },
      { field: 'rates', expected: null },
      { field: 'rates.2.fee_minor', expected: null },
      { field: 'unknown', expected: null },
      { field: null, expected: null },
    ])
    .run(({ assert }, { field, expected }) => {
      // The request sent the outside zone's rate first, then the valley's.
      assert.equal(formFieldOf(field, ['outside_valley', 'ktm_valley'], AREAS.zones), expected)
    })

  test('T-UI-041 a day count is a whole number from 0 to 30: {typed}')
    .with([
      { typed: '0', expected: 0 },
      { typed: ' 7 ', expected: 7 },
      { typed: '30', expected: 30 },
      { typed: '31', expected: null },
      { typed: '1.5', expected: null },
      { typed: '-1', expected: null },
      { typed: '', expected: null },
      { typed: '100', expected: null },
    ])
    .run(({ assert }, { typed, expected }) => {
      assert.equal(parseDays(typed), expected)
    })
})
