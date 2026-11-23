import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DomainError } from '#exceptions/domain_error'
import { deliveryAreas, shippingConfigured } from '#modules/logistics/queries'
import { SHIPPING_LIMITS } from '#shared/constants/limits'
import { replaceShopShipping } from '#modules/shops/actions/replace_shop_shipping'
import { shopShippingJson } from '#transformers/seller/shipping_transformer'
import type { Browser } from '#tests/support/browser'
import { send, signIn, statusOf } from '#tests/support/courier_http'
import { forgetKeys } from '#tests/support/identity'
import { addMember, createOwnerShop, setShopStatus } from '#tests/support/shops'

/*
 * `getShopShipping` and `replaceShopShipping` ⟳ (docs/06 §13.5, §8; 01
 * FR-SHOP-004; docs/04a §9.6, §9.7; R1-S part 1c):
 * - T-SHOP-010 (new): a new shop answers no coverage, no rates, not
 *   configured, and its version as the ETag; the owner saves coverage and a
 *   rate per zone and gets 200 with the shipping as `getShopShipping` shows
 *   it and the next ETag, the fee as money in paisa; each set is replaced
 *   whole and an absent one is kept; a rate for a zone the shop does not
 *   cover is kept; a request that changes nothing writes nothing and keeps
 *   the version; a member out of rule answers 422 on it, a fee above the
 *   most the rupee field reads included; an inactive district, a district
 *   of an inactive province and an inactive zone answer `not_offered`, and
 *   `delivery_areas` leaves them out; a covered district whose zone is made
 *   inactive stays saved, needs no rate (a rates-only save passes) and is
 *   dropped by the next coverage save, which may not keep it; one
 *   `shop.shipping_replace` audit row holds the from and to values of the
 *   sets written; `configured` and `shippingConfigured` follow the publish
 *   gate's condition (AC-FR-CAT-005-2).
 * - T-SHOP-109: a covered district whose zone has no rate is refused with
 *   422 `rate_required` on `rates`, naming the zone, whichever set the
 *   request changes; nothing is written.
 * - T-API-004: no `If-Match`, `*` or a list answers 428; a stale version, a
 *   weak tag or another value 412 `VERSION_CONFLICT` with `current`, the
 *   shipping as `getShopShipping` shows it; `updateShopProfile` moves the
 *   same version, so a shipping save after a profile save is stale too.
 * - T-SEC-003: server-owned members (`shop_id`, `version`, `configured`,
 *   ...) and unknown members of a rate (`currency`, `shop_id`) answer 422
 *   `unknown_field`; a query parameter 400; nothing is written.
 * - T-SEC-001: another shop's slug answers the 404 of an unknown one.
 * - T-SEC-030: any member reads; a role without `shop.shipping.manage` gets
 *   403 on the write; a manager writes.
 * - T-SEC-031: the `shop.member` gate on the read and the "profile,
 *   shipping" gate on the write (the owner alone while `pending_review` or
 *   `rejected`, OD-47), over HTTP and against a suspension that commits
 *   after `seller_context` read the shop.
 * Both operations are charged to `api_user`, whose keys are per user and
 * far from their limit here.
 */

const shippingPath = (slug: string) => `/api/v1/seller/shops/${slug}/shipping`
const shopRow = (shopId: string) => db.from('shops').where('id', shopId).firstOrFail()
const coverageRows = (shopId: string) =>
  db.from('shop_delivery_coverage').where('shop_id', shopId).orderBy('district_code')
const rateRows = (shopId: string) =>
  db
    .from('shop_shipping_rates')
    .where('shop_id', shopId)
    .orderBy('zone_code')
    .select('zone_code', 'fee_minor', 'currency', 'est_min_days', 'est_max_days')
const shippingAudits = (shopId: string) =>
  db.from('audit_logs').where({ action: 'shop.shipping_replace', shop_id: shopId }).orderBy('id')

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// A problem body without the members that differ on every request.
function stable(body: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'request_id' && key !== 'instance')
  )
}

// Kathmandu (valley) and Kaski (outside), and a rate for each zone.
const VALLEY = '306'
const OUTSIDE = '405'
const RATES = [
  { zone_code: 'ktm_valley', fee_minor: 10000, est_min_days: 0, est_max_days: 1 },
  { zone_code: 'outside_valley', fee_minor: 15050, est_min_days: 2, est_max_days: 5 },
]
const FULL = { coverage: [OUTSIDE, VALLEY], rates: RATES }

/*
 * Reference rows no longer offered, rolled back with the test: district 398
 * (inactive) and 797 (active, in province 7, made inactive here: every
 * province code is seeded, `^[1-7]$`), each in an active zone, and the
 * inactive zone `test_retired`. None of the codes is seeded.
 */
async function insertRetiredAreas() {
  await db.table('districts').insert([
    {
      code: '398',
      province_code: '3',
      name_en: 'Test Retired District',
      name_ne: 'परीक्षण जिल्ला',
      is_active: false,
    },
    {
      code: '797',
      province_code: '7',
      name_en: 'Test Far District',
      name_ne: 'परीक्षण जिल्ला',
      is_active: true,
    },
  ])
  await db.table('delivery_zone_districts').insert([
    { zone_code: 'outside_valley', district_code: '398' },
    { zone_code: 'outside_valley', district_code: '797' },
  ])
  await db.from('provinces').where('code', '7').update({ is_active: false })
  await db
    .table('delivery_zones')
    .insert({ code: 'test_retired', name_en: 'Test Retired Zone', position: 9, is_active: false })
}

// The users this file signed in; updateShopProfile's limiter keys go with them.
const made: string[] = []

async function forgetMade() {
  for (const id of made.splice(0)) await forgetKeys('shop_profile_update', id)
}

// The owner's shop and a signed-in browser for `actor`: the owner, or a new member with that role.
async function shopFor(actor = 'owner') {
  const shop = await createOwnerShop()
  const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
  made.push(userId)
  return { shop, userId, browser: await signIn(userId) }
}

const put = (browser: Browser, slug: string, body: unknown, ifMatch: string | null = '"1"') =>
  send(browser, 'PUT', shippingPath(slug), body, ifMatch === null ? {} : { 'If-Match': ifMatch })

test.group('T-SHOP-010 getShopShipping and replaceShopShipping', (group) => {
  group.each.teardown(forgetMade)

  test('T-SHOP-010 a new shop has no coverage, no rates and is not configured', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const response = await send(browser, 'GET', shippingPath(shop.slug))
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"1"')
    assert.deepEqual(response.body.data, { coverage: [], rates: [], configured: false, version: 1 })
    assert.isFalse(await shippingConfigured(shop.shopId))
  })

  test('T-SHOP-010 the owner saves coverage and rates: 200 with the shipping and the next ETag [AC-FR-SHOP-004-1]', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const response = await put(browser, shop.slug, FULL)
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"2"')
    const expected = {
      coverage: [VALLEY, OUTSIDE],
      rates: [
        {
          zone_code: 'ktm_valley',
          fee: { amount_minor: 10000, currency: 'NPR' },
          est_min_days: 0,
          est_max_days: 1,
        },
        {
          zone_code: 'outside_valley',
          fee: { amount_minor: 15050, currency: 'NPR' },
          est_min_days: 2,
          est_max_days: 5,
        },
      ],
      configured: true,
      version: 2,
    }
    assert.deepEqual(response.body.data, expected)
    const read = await send(browser, 'GET', shippingPath(shop.slug))
    assert.deepEqual(read.body.data, expected)
    assert.equal(read.headers.get('etag'), '"2"')

    const covered = await coverageRows(shop.shopId)
    assert.deepEqual(
      covered.map((row) => row.district_code),
      [VALLEY, OUTSIDE]
    )
    assert.deepEqual(await rateRows(shop.shopId), [
      {
        zone_code: 'ktm_valley',
        fee_minor: 10000,
        currency: 'NPR',
        est_min_days: 0,
        est_max_days: 1,
      },
      {
        zone_code: 'outside_valley',
        fee_minor: 15050,
        currency: 'NPR',
        est_min_days: 2,
        est_max_days: 5,
      },
    ])
    const row = await shopRow(shop.shopId)
    assert.equal(row.version, 2)
    assert.isTrue(await shippingConfigured(shop.shopId))
  })

  test('T-SHOP-010 each set is replaced whole, and an absent one is kept', async ({ assert }) => {
    const { shop, browser } = await shopFor()
    assert.equal(await statusOf(put(browser, shop.slug, FULL)), 200)

    // Only the coverage: the rates stay.
    const coverage = await put(browser, shop.slug, { coverage: ['307', VALLEY] }, '"2"')
    assert.equal(coverage.status, 200, coverage.text)
    assert.deepEqual(coverage.body.data.coverage, [VALLEY, '307'])
    assert.lengthOf(coverage.body.data.rates, 2)

    // Only the rates: the coverage stays; the outside zone, no longer covered, may go.
    const rates = await put(browser, shop.slug, { rates: [RATES[0]] }, '"3"')
    assert.equal(rates.status, 200, rates.text)
    assert.deepEqual(rates.body.data.coverage, [VALLEY, '307'])
    assert.deepEqual(
      rates.body.data.rates.map((rate: { zone_code: string }) => rate.zone_code),
      ['ktm_valley']
    )
    assert.isTrue(rates.body.data.configured)
    assert.equal(rates.body.data.version, 4)
  })

  test('T-SHOP-010 a rate for a zone the shop does not cover is kept', async ({ assert }) => {
    const { shop, browser } = await shopFor()
    const response = await put(browser, shop.slug, { coverage: [VALLEY], rates: RATES })
    assert.equal(response.status, 200, response.text)
    assert.lengthOf(response.body.data.rates, 2)
    assert.isTrue(response.body.data.configured)
  })

  test('T-SHOP-010 a request that changes nothing writes nothing and keeps the version', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    assert.equal(await statusOf(put(browser, shop.slug, FULL)), 200)
    const before = await shopRow(shop.shopId)
    for (const body of [
      {},
      FULL,
      { coverage: [VALLEY, OUTSIDE] },
      { rates: [...RATES].reverse() },
    ]) {
      const response = await put(browser, shop.slug, body, '"2"')
      assert.equal(response.status, 200, response.text)
      assert.equal(response.headers.get('etag'), '"2"')
      assert.equal(response.body.data.version, 2)
    }
    assert.deepEqual(await shopRow(shop.shopId), before)
    assert.lengthOf(await shippingAudits(shop.shopId), 1)
  })

  test('T-SHOP-010 {label} answers 422 on {field} and writes nothing')
    .with([
      {
        label: 'coverage that is not a list',
        body: { coverage: VALLEY },
        field: 'coverage',
        code: 'array',
      },
      {
        label: 'a malformed district code',
        body: { coverage: ['3060'] },
        field: 'coverage.0',
        code: 'regex',
      },
      {
        label: 'a district twice',
        body: { coverage: [VALLEY, VALLEY], rates: RATES },
        field: 'coverage',
        code: 'distinct',
      },
      {
        label: 'a district that does not exist',
        body: { coverage: [VALLEY, '799'], rates: RATES },
        field: 'coverage.1',
        code: 'not_offered',
      },
      {
        label: 'no district',
        body: { coverage: [], rates: RATES },
        field: 'coverage',
        code: 'required',
      },
      { label: 'a null coverage', body: { coverage: null }, field: 'coverage', code: 'required' },
      {
        label: 'a fee as text',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], fee_minor: '10000' }] },
        field: 'rates.0.fee_minor',
        code: 'number',
      },
      {
        label: 'a fee in fractions of a paisa',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], fee_minor: 100.5 }] },
        field: 'rates.0.fee_minor',
        code: 'without_decimals',
      },
      {
        label: 'a fee above the most the rupee field reads',
        body: {
          coverage: [VALLEY],
          rates: [{ ...RATES[0], fee_minor: SHIPPING_LIMITS.feeMinor.max + 1 }],
        },
        field: 'rates.0.fee_minor',
        code: 'range',
      },
      {
        label: 'a negative fee',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], fee_minor: -1 }] },
        field: 'rates.0.fee_minor',
        code: 'range',
      },
      {
        label: 'an estimate over 30 days',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], est_max_days: 31 }] },
        field: 'rates.0.est_max_days',
        code: 'range',
      },
      {
        label: 'the slowest shorter than the fastest',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], est_min_days: 3, est_max_days: 2 }] },
        field: 'rates.0.est_max_days',
        code: 'less_than_min',
      },
      {
        label: 'a zone that does not exist',
        body: { coverage: [VALLEY], rates: [RATES[0], { ...RATES[1], zone_code: 'mountains' }] },
        field: 'rates.1.zone_code',
        code: 'not_offered',
      },
      {
        label: 'a zone twice',
        body: { coverage: [VALLEY], rates: [RATES[0], RATES[0]] },
        field: 'rates',
        code: 'distinct',
      },
    ])
    .run(async ({ assert }, { body, field, code }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await put(browser, shop.slug, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[field, code]])
      assert.deepEqual(await shopRow(shop.shopId), before)
      assert.lengthOf(await coverageRows(shop.shopId), 0)
      assert.lengthOf(await rateRows(shop.shopId), 0)
    })

  test(
    'T-SHOP-010 a district or zone that is no longer active is refused with not_offered: {label}'
  )
    .with([
      {
        label: 'an inactive district',
        body: { coverage: [VALLEY, '398'], rates: RATES },
        field: 'coverage.1',
      },
      {
        label: 'a district of an inactive province',
        body: { coverage: [VALLEY, '797'], rates: RATES },
        field: 'coverage.1',
      },
      {
        label: 'an inactive zone',
        body: { coverage: [VALLEY], rates: [RATES[0], { ...RATES[1], zone_code: 'test_retired' }] },
        field: 'rates.1.zone_code',
      },
    ])
    .run(async ({ assert }, { body, field }) => {
      await insertRetiredAreas()
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await put(browser, shop.slug, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[field, 'not_offered']])
      assert.deepEqual(await shopRow(shop.shopId), before)
      assert.lengthOf(await coverageRows(shop.shopId), 0)
      assert.lengthOf(await rateRows(shop.shopId), 0)

      // The editor offers none of them either.
      const areas = await deliveryAreas()
      const codes = areas.provinces.flatMap((province) => province.districts.map((d) => d.code))
      for (const code of ['398', '797']) assert.notInclude(codes, code)
      assert.notInclude(
        areas.zones.map((zone) => zone.code),
        'test_retired'
      )
      assert.notInclude(
        areas.provinces.map((province) => province.code),
        '7'
      )
    })

  test('T-SHOP-010 a covered district whose zone is made inactive stays saved, needs no rate and is dropped by the next coverage save', async ({
    assert,
  }) => {
    // Test rows with codes the seed does not have, rolled back with the test.
    await db
      .table('delivery_zones')
      .insert({ code: 'test_zone', name_en: 'Test Zone', position: 9, is_active: true })
    await db.table('districts').insert({
      code: '397',
      province_code: '3',
      name_en: 'Test District',
      name_ne: 'परीक्षण जिल्ला',
      is_active: true,
    })
    await db
      .table('delivery_zone_districts')
      .insert({ zone_code: 'test_zone', district_code: '397' })
    const testRate = { zone_code: 'test_zone', fee_minor: 500, est_min_days: 1, est_max_days: 2 }
    const { shop, browser } = await shopFor()
    const first = await put(browser, shop.slug, {
      coverage: [VALLEY, '397'],
      rates: [RATES[0], testRate],
    })
    assert.equal(first.status, 200, first.text)

    await db.from('delivery_zones').where('code', 'test_zone').update({ is_active: false })
    // Kept, and out of the rule: the valley alone is covered and rated.
    const read = await send(browser, 'GET', shippingPath(shop.slug))
    assert.deepEqual(read.body.data.coverage, [VALLEY, '397'])
    assert.isTrue(read.body.data.configured)
    assert.isTrue(await shippingConfigured(shop.shopId))

    // A rates-only save, as the form sends it: no rate for the retired zone is asked for.
    const rates = await put(
      browser,
      shop.slug,
      { rates: [{ ...RATES[0], fee_minor: 12000 }] },
      '"2"'
    )
    assert.equal(rates.status, 200, rates.text)
    assert.deepEqual(rates.body.data.coverage, [VALLEY, '397'])
    assert.deepEqual(
      rates.body.data.rates.map((rate: { zone_code: string }) => rate.zone_code),
      ['ktm_valley']
    )

    // A coverage save may not keep it; the form's next one leaves it out.
    const kept = await put(browser, shop.slug, { coverage: [VALLEY, '397'] }, '"3"')
    assert.equal(kept.status, 422, kept.text)
    assert.deepEqual(problemFields(kept.body), [['coverage.1', 'not_offered']])
    const dropped = await put(browser, shop.slug, { coverage: [VALLEY] }, '"3"')
    assert.equal(dropped.status, 200, dropped.text)
    assert.deepEqual(dropped.body.data.coverage, [VALLEY])
  })

  test('T-SHOP-010 one shop.shipping_replace row holds the sets written, by the owner', async ({
    assert,
  }) => {
    const { shop, userId, browser } = await shopFor()
    assert.equal(await statusOf(put(browser, shop.slug, FULL)), 200)
    const coverage = await put(browser, shop.slug, { coverage: [VALLEY], rates: RATES }, '"2"')
    assert.equal(coverage.status, 200, coverage.text)
    const audits = await shippingAudits(shop.shopId)
    assert.lengthOf(audits, 2)
    assert.equal(audits[0].actor_type, 'shop_member')
    assert.equal(audits[0].actor_user_id, userId)
    assert.equal(audits[0].actor_role, `shop:${shop.shopId}:owner`)
    assert.equal(audits[0].subject_type, 'shop')
    assert.equal(audits[0].subject_id, shop.shopId)
    assert.isNotNull(audits[0].ip_hash)
    assert.deepEqual(audits[0].changes, {
      coverage: { from: [], to: [VALLEY, OUTSIDE] },
      rates: { from: [], to: RATES },
    })
    // The second request sent the same rates: only the coverage was written.
    assert.deepEqual(audits[1].changes, { coverage: { from: [VALLEY, OUTSIDE], to: [VALLEY] } })
  })

  test('T-SHOP-010 configured follows the publish gate: coverage, and a rate for every covered zone [AC-FR-CAT-005-2]', async ({
    assert,
  }) => {
    const { shop } = await shopFor()
    // Rows as a seeder or an older release might have left them, not through the operation.
    await db.table('shop_delivery_coverage').insert({ shop_id: shop.shopId, district_code: VALLEY })
    assert.isFalse(await shippingConfigured(shop.shopId))
    await db.table('shop_shipping_rates').insert({
      shop_id: shop.shopId,
      zone_code: 'outside_valley',
      fee_minor: 0,
      est_min_days: 1,
      est_max_days: 2,
    })
    assert.isFalse(await shippingConfigured(shop.shopId))
    await db.table('shop_shipping_rates').insert({
      shop_id: shop.shopId,
      zone_code: 'ktm_valley',
      fee_minor: 0,
      est_min_days: 0,
      est_max_days: 0,
    })
    assert.isTrue(await shippingConfigured(shop.shopId))
    await db
      .table('shop_delivery_coverage')
      .insert({ shop_id: shop.shopId, district_code: OUTSIDE })
    assert.isTrue(await shippingConfigured(shop.shopId))
  })
})

test.group('T-SHOP-109 a covered district needs its zone’s rate', (group) => {
  group.each.teardown(forgetMade)

  test('T-SHOP-109 {label} answers 422 rate_required and writes nothing')
    .with([
      {
        label: 'coverage without any rate',
        saved: null,
        body: { coverage: [VALLEY] },
        zone: 'Kathmandu Valley',
      },
      {
        label: 'coverage reaching a zone without a rate',
        saved: { coverage: [VALLEY], rates: [RATES[0]] },
        body: { coverage: [VALLEY, OUTSIDE] },
        zone: 'Outside Kathmandu Valley',
      },
      {
        label: 'dropping the rate of a covered zone',
        saved: FULL,
        body: { rates: [RATES[0]] },
        zone: 'Outside Kathmandu Valley',
      },
    ])
    .run(async ({ assert }, { saved, body, zone }) => {
      const { shop, browser } = await shopFor()
      let version = 1
      if (saved) {
        assert.equal(await statusOf(put(browser, shop.slug, saved)), 200)
        version = 2
      }
      const before = {
        shop: await shopRow(shop.shopId),
        coverage: await coverageRows(shop.shopId),
        rates: await rateRows(shop.shopId),
      }
      const response = await put(browser, shop.slug, body, `"${version}"`)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [['rates', 'rate_required']])
      // The message names the zone (`delivery_zones.name_en`, 04 §21.5).
      assert.isTrue(response.body.errors[0].message.startsWith(`${zone} needs`))
      assert.deepEqual(
        {
          shop: await shopRow(shop.shopId),
          coverage: await coverageRows(shop.shopId),
          rates: await rateRows(shop.shopId),
        },
        before
      )
    })
})

test.group('T-API-004 If-Match on replaceShopShipping', (group) => {
  group.each.teardown(forgetMade)

  test('T-API-004 {label} answers 428 PRECONDITION_REQUIRED and writes nothing')
    .with([
      { label: 'no If-Match', ifMatch: null },
      { label: 'If-Match *', ifMatch: '*' },
      { label: 'a list of tags', ifMatch: '"1", "2"' },
    ])
    .run(async ({ assert }, { ifMatch }) => {
      const { shop, browser } = await shopFor()
      const response = await put(browser, shop.slug, FULL, ifMatch)
      assert.equal(response.status, 428, response.text)
      assert.equal(response.body.code, 'PRECONDITION_REQUIRED')
      assert.lengthOf(await coverageRows(shop.shopId), 0)
    })

  test(
    'T-API-004 {label} answers 412 VERSION_CONFLICT with current and writes nothing [AC-FR-SHOP-004-4]'
  )
    .with([
      { label: 'a stale version', ifMatch: '"1"' },
      { label: 'a weak tag of the current version', ifMatch: 'W/"2"' },
      { label: 'a value that is not a version', ifMatch: '"two"' },
    ])
    .run(async ({ assert }, { ifMatch }) => {
      const { shop, browser } = await shopFor()
      const first = await put(browser, shop.slug, FULL)
      assert.equal(first.status, 200, first.text)
      const before = await coverageRows(shop.shopId)

      const response = await put(browser, shop.slug, { coverage: [VALLEY] }, ifMatch)
      assert.equal(response.status, 412, response.text)
      assert.equal(response.body.code, 'VERSION_CONFLICT')
      assert.deepEqual(response.body.current, first.body.data)
      assert.deepEqual(await coverageRows(shop.shopId), before)
    })

  test('T-API-004 a profile save moves the shop’s version, so the shipping save on the old one is stale', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const profile = await send(
      browser,
      'PATCH',
      `/api/v1/seller/shops/${shop.slug}`,
      { description: 'Moved the version.' },
      { 'If-Match': '"1"' }
    )
    assert.equal(profile.status, 200, profile.text)
    const stale = await put(browser, shop.slug, FULL)
    assert.equal(stale.status, 412, stale.text)
    assert.deepEqual(stale.body.current, {
      coverage: [],
      rates: [],
      configured: false,
      version: 2,
    })
    const kept = await put(browser, shop.slug, FULL, '"2"')
    assert.equal(kept.status, 200, kept.text)
    assert.equal(kept.body.data.version, 3)
  })
})

test.group('T-SEC-003 server-owned members on replaceShopShipping', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-003 replaceShopShipping with {field} is refused with 422 unknown_field')
    .with([
      { field: 'shop_id', body: { ...FULL, shop_id: '01929c10-0000-7000-8000-0000000000a1' } },
      { field: 'version', body: { ...FULL, version: 9 } },
      { field: 'configured', body: { ...FULL, configured: true } },
      { field: 'zones', body: { ...FULL, zones: ['ktm_valley'] } },
      {
        field: 'rates.0.currency',
        body: { coverage: [VALLEY], rates: [{ ...RATES[0], currency: 'NPR' }] },
      },
      {
        field: 'rates.1.shop_id',
        body: {
          coverage: [VALLEY],
          rates: [RATES[0], { ...RATES[1], shop_id: '01929c10-0000-7000-8000-0000000000a1' }],
        },
      },
      {
        field: 'rates.0.fee',
        body: {
          coverage: [VALLEY],
          rates: [{ ...RATES[0], fee: { amount_minor: 1, currency: 'NPR' } }],
        },
      },
    ])
    .run(async ({ assert }, { field, body }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await put(browser, shop.slug, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[field, 'unknown_field']])
      assert.deepEqual(await shopRow(shop.shopId), before)
      assert.lengthOf(await coverageRows(shop.shopId), 0)
    })

  test('T-SEC-003 a member in the query string is refused with 400 on both operations', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const write = await send(
      browser,
      'PUT',
      `${shippingPath(shop.slug)}?coverage=306`,
      { rates: RATES },
      { 'If-Match': '"1"' }
    )
    assert.equal(write.status, 400, write.text)
    assert.equal(write.body.code, 'INVALID_QUERY_PARAMETER')
    const read = await send(browser, 'GET', `${shippingPath(shop.slug)}?version=1`)
    assert.equal(read.status, 400, read.text)
    assert.lengthOf(await coverageRows(shop.shopId), 0)
  })
})

test.group('T-SEC-001 the shipping operations outside the caller’s shops', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-001 another shop’s slug answers the 404 of an unknown slug and changes nothing', async ({
    assert,
  }) => {
    const { browser } = await shopFor()
    const theirs = await createOwnerShop()
    for (const method of ['GET', 'PUT'] as const) {
      const body = method === 'PUT' ? FULL : undefined
      const headers: Record<string, string> = method === 'PUT' ? { 'If-Match': '"1"' } : {}
      const unknown = await send(
        browser,
        method,
        shippingPath('no-such-shop-anywhere'),
        body,
        headers
      )
      assert.equal(unknown.status, 404)
      const other = await send(browser, method, shippingPath(theirs.slug), body, headers)
      assert.equal(other.status, 404)
      assert.deepEqual(stable(other.body), stable(unknown.body))
    }
    assert.lengthOf(await coverageRows(theirs.shopId), 0)
    const row = await shopRow(theirs.shopId)
    assert.equal(row.version, 1)
  })
})

test.group('T-SEC-030 who may read and change the shipping', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-030 a {role} reads the shipping and gets 403 FORBIDDEN on the write')
    .with([{ role: 'catalog_editor' }, { role: 'order_fulfiller' }, { role: 'viewer' }])
    .run(async ({ assert }, { role }) => {
      const { shop, browser } = await shopFor(role)
      const read = await send(browser, 'GET', shippingPath(shop.slug))
      assert.equal(read.status, 200, read.text)
      const write = await put(browser, shop.slug, FULL)
      assert.equal(write.status, 403, write.text)
      assert.equal(write.body.code, 'FORBIDDEN')
      assert.lengthOf(await coverageRows(shop.shopId), 0)
    })

  test('T-SEC-030 a manager changes the shipping, audited with the manager’s role', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor('manager')
    const response = await put(browser, shop.slug, FULL)
    assert.equal(response.status, 200, response.text)
    const [audit] = await shippingAudits(shop.shopId)
    assert.equal(audit.actor_role, `shop:${shop.shopId}:manager`)
  })
})

test.group('T-SEC-031 the shipping status gates', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-031 getShopShipping and replaceShopShipping: {status} for the {actor}')
    .with([
      { status: 'pending_review' as const, mode: null, actor: 'owner', read: 200, write: 200 },
      { status: 'rejected' as const, mode: null, actor: 'owner', read: 200, write: 200 },
      { status: 'pending_review' as const, mode: null, actor: 'manager', read: 403, write: 403 },
      {
        status: 'suspended' as const,
        mode: 'fulfill_existing' as const,
        actor: 'owner',
        read: 200,
        write: 403,
      },
      {
        status: 'suspended' as const,
        mode: 'frozen' as const,
        actor: 'manager',
        read: 200,
        write: 403,
      },
      { status: 'closed' as const, mode: null, actor: 'owner', read: 403, write: 403 },
    ])
    .run(async ({ assert }, { status, mode, actor, read, write }) => {
      const { shop, browser } = await shopFor(actor)
      await setShopStatus(shop.shopId, status, mode)
      const readResponse = await send(browser, 'GET', shippingPath(shop.slug))
      assert.equal(readResponse.status, read, readResponse.text)
      const writeResponse = await put(browser, shop.slug, FULL)
      assert.equal(writeResponse.status, write, writeResponse.text)
      for (const response of [readResponse, writeResponse]) {
        if (response.status === 403) {
          assert.equal(response.body.code, 'SHOP_NOT_ACTIVE')
          assert.equal(response.body.shop_status, status)
        }
      }
      if (write === 403) assert.lengthOf(await coverageRows(shop.shopId), 0)
      else assert.isTrue(writeResponse.body.data.configured)
    })

  test('T-SEC-031 a suspension that commits after seller_context read the shop wins', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    await setShopStatus(shop.shopId, 'suspended', 'frozen')
    const before = await shopRow(shop.shopId)
    // The context as `seller_context` read it, before the suspension.
    const context = {
      id: shop.shopId,
      slug: shop.slug,
      name: shop.name,
      status: 'active',
      suspensionMode: null,
      actor: 'owner' as const,
      viaRedirect: false,
    }
    const refused = await replaceShopShipping(
      {
        shop: context,
        expectedVersion: before.version,
        changes: {
          coverage: [VALLEY],
          rates: [{ zoneCode: 'ktm_valley', feeMinor: 100, estMinDays: 0, estMaxDays: 1 }],
        },
      },
      {
        actor: {
          type: 'shop_member',
          userId: shop.ownerId,
          role: `shop:${shop.shopId}:owner`,
          requestId: null,
        },
        present: shopShippingJson,
      }
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(refused, DomainError)
    assert.equal((refused as DomainError).problemCode, 'SHOP_NOT_ACTIVE')
    assert.deepEqual(await shopRow(shop.shopId), before)
    assert.lengthOf(await coverageRows(shop.shopId), 0)
    assert.lengthOf(await shippingAudits(shop.shopId), 0)
  })
})
