import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import {
  CIPHERTEXT,
  insertLocation,
  insertOrderItem,
  insertShop,
  insertShopOrder,
  refused,
  type Row,
  type ShopOrderRef,
} from '#tests/support/schema_rows'

/*
 * Constraint tests of `shipments`, `shipment_events` and `shipment_items`
 * (docs/04a §11.5, §11.6, §11.9; OD-56, ADR-0019): T-FUL-101 to T-FUL-106,
 * which run with the E4 baseline (docs/10 §6.4 and note 35).
 *
 * Rows are inserted directly, as the runtime would, and each test is rolled
 * back. Every expected refusal runs in its own savepoint and asserts the
 * SQLSTATE and, where PostgreSQL reports one, the constraint name. Valid rows
 * are accepted first, so each refusal is about the one thing it breaks.
 */

// A courier account of `shopId` that the shop may book through (§9.9, §9.10).
async function insertAccount(shopId: string) {
  // Test-only code: `ncm` itself comes from the reference seeder (04a §9.8).
  await db
    .table('logistics_providers')
    .insert({ code: 'test_courier', name: 'Test Courier' })
    .onConflict('code')
    .ignore()
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'test_courier',
      name: 'Test Courier Kathmandu',
      environment: 'sandbox',
      owner_type: 'shop',
      shop_id: shopId,
    })
    .returning('id')
  await db.table('logistics_account_shops').insert({
    account_id: row.id,
    shop_id: shopId,
    account_owner_type: 'shop',
    owner_shop_id: shopId,
  })
  return row.id as string
}

// A pickup address of `shopId` (§6.6) in Kathmandu.
async function insertPickupAddress(shopId: string) {
  const [row] = await db
    .table('shop_addresses')
    .insert({
      shop_id: shopId,
      purpose: 'pickup',
      contact_name: 'Ram Thapa',
      contact_phone_enc: CIPHERTEXT,
      province_code: '3',
      district_code: '306',
      local_level_code: '30608',
      ward_no: 10,
      area_tole_enc: CIPHERTEXT,
    })
    .returning('id')
  return row.id as string
}

type Courier = { shopId: string; accountId: string; addressId: string }

async function courierShop(): Promise<Courier> {
  const shopId = await insertShop()
  await insertLocation()
  return {
    shopId,
    accountId: await insertAccount(shopId),
    addressId: await insertPickupAddress(shopId),
  }
}

let bookings = 0

// The columns of a courier booking of `shopOrder`; `n` numbers its reference.
function booking(courier: Courier, shopOrder: ShopOrderRef, n = 1): Row {
  return {
    logistics_account_id: courier.accountId,
    pickup_address_id: courier.addressId,
    merchant_reference: `${shopOrder.number}-S${n}`,
    cod_amount_minor: 110000,
    service_code: 'standard',
  }
}

// The courier confirmed the booking (`booked`).
function booked(courier: Courier, shopOrder: ShopOrderRef, n = 1): Row {
  bookings += 1
  return {
    ...booking(courier, shopOrder, n),
    status: 'booked',
    external_shipment_id: `TC-${bookings}`,
    booked_at: db.raw(`now() - interval '2 days'`),
  }
}

// Handed over: the courier's pickup, or the vendor's `shipped`.
const HANDED_OVER: Row = {
  shipped_at: db.raw(`now() - interval '1 day'`),
  courier_name: 'Test Courier',
  attempt_count: 1,
}

const DELIVERED: Row = {
  ...HANDED_OVER,
  status: 'delivered',
  delivered_at: db.raw('now()'),
  return_window_ends_at: db.raw(`now() + interval '7 days'`),
}

async function insertShipment(shopOrder: ShopOrderRef, values: Row = {}) {
  const [row] = await db
    .table('shipments')
    .insert({ shop_order_id: shopOrder.id, shop_id: shopOrder.shopId, ...values })
    .returning('id')
  return row.id as string
}

function insertInto(shopOrder: ShopOrderRef, values: Row) {
  return (trx: TransactionClientContract) =>
    trx
      .table('shipments')
      .insert({ shop_order_id: shopOrder.id, shop_id: shopOrder.shopId, ...values })
}

test.group('T-FUL-101 shipped statuses', () => {
  test('T-FUL-101 a shipped status without its required fields gives 23514', async ({ assert }) => {
    const courier = await courierShop()
    const manual = await insertShopOrder(courier.shopId)
    const courierOrder = await insertShopOrder(courier.shopId)

    // Valid rows of both paths, each on its own shop order.
    await insertShipment(await insertShopOrder(courier.shopId), {
      status: 'shipped',
      ...HANDED_OVER,
    })
    await insertShipment(await insertShopOrder(courier.shopId), DELIVERED)
    const live = await insertShopOrder(courier.shopId)
    await insertShipment(live, {
      ...booked(courier, live),
      ...HANDED_OVER,
      status: 'out_for_delivery',
    })

    const cases: [string, ShopOrderRef, Row, string][] = [
      [
        'manual shipped without shipped_at',
        manual,
        { status: 'shipped', courier_name: 'Own rider', attempt_count: 1 },
        'shipments_shipped_check',
      ],
      [
        'manual shipped without a courier name',
        manual,
        { ...HANDED_OVER, status: 'shipped', courier_name: null },
        'shipments_shipped_check',
      ],
      [
        'manual shipped with no attempt',
        manual,
        { ...HANDED_OVER, status: 'shipped', attempt_count: 0 },
        'shipments_shipped_check',
      ],
      [
        'delivery_failed without shipped_at',
        manual,
        { ...HANDED_OVER, status: 'delivery_failed', shipped_at: null },
        'shipments_shipped_check',
      ],
      [
        'returning without a courier name',
        manual,
        { ...HANDED_OVER, status: 'returning', courier_name: null },
        'shipments_shipped_check',
      ],
      [
        'returned_to_origin with no attempt',
        manual,
        { ...HANDED_OVER, status: 'returned_to_origin', attempt_count: 0 },
        'shipments_shipped_check',
      ],
      [
        'delivered without delivered_at',
        manual,
        { ...DELIVERED, delivered_at: null, return_window_ends_at: null },
        'shipments_delivered_check',
      ],
      [
        'delivered before it was shipped',
        manual,
        {
          ...DELIVERED,
          delivered_at: db.raw(`now() - interval '3 days'`),
          return_window_ends_at: db.raw(`now() + interval '7 days'`),
        },
        'shipments_delivered_check',
      ],
      [
        'delivered without a return window',
        manual,
        { ...DELIVERED, return_window_ends_at: null },
        'shipments_return_window_check',
      ],
      [
        'a return window under 7 days',
        manual,
        { ...DELIVERED, return_window_ends_at: db.raw(`now() + interval '6 days'`) },
        'shipments_return_window_check',
      ],
      [
        'courier out_for_delivery without shipped_at',
        courierOrder,
        {
          ...booked(courier, courierOrder),
          status: 'out_for_delivery',
          courier_name: 'Test Courier',
          attempt_count: 1,
        },
        'shipments_shipped_check',
      ],
      [
        'courier shipped without a courier name',
        courierOrder,
        { ...booked(courier, courierOrder), ...HANDED_OVER, status: 'shipped', courier_name: null },
        'shipments_shipped_check',
      ],
      [
        'courier delivered without delivered_at',
        courierOrder,
        {
          ...booked(courier, courierOrder),
          ...DELIVERED,
          delivered_at: null,
          return_window_ends_at: null,
        },
        'shipments_delivered_check',
      ],
    ]
    for (const [label, shopOrder, values, constraint] of cases) {
      await refused(assert, insertInto(shopOrder, values), { code: '23514', constraint }, label)
    }
  })
})

test.group('T-FUL-102 shipments courier-path CHECKs and keys', () => {
  test('T-FUL-102 path, booked and cancelled CHECKs give 23514', async ({ assert }) => {
    const courier = await courierShop()
    const so = await insertShopOrder(courier.shopId)

    // One valid row per courier status family, each on its own shop order.
    for (const status of ['booking_requested', 'booking_failed', 'needs_reconciliation']) {
      const other = await insertShopOrder(courier.shopId)
      await insertShipment(other, { ...booking(courier, other), status })
    }
    const other = await insertShopOrder(courier.shopId)
    await insertShipment(other, booked(courier, other))
    await insertShipment(so, {
      ...booking(courier, so, 1),
      status: 'cancelled',
      cancelled_at: db.raw('now()'),
    })
    await insertShipment(await insertShopOrder(courier.shopId), {
      status: 'packed',
      pickup_address_id: courier.addressId,
    })

    const requested = { ...booking(courier, so, 2), status: 'booking_requested' }
    const cases: [string, Row, string][] = [
      // shipments_path_check: courier statuses and fields only with an account
      [
        'a courier status without an account',
        { status: 'booking_requested' },
        'shipments_path_check',
      ],
      [
        'cancelled without an account',
        { status: 'cancelled', cancelled_at: db.raw('now()') },
        'shipments_path_check',
      ],
      ['a manual reference', { merchant_reference: `${so.number}-S3` }, 'shipments_path_check'],
      ['a manual courier ID', { external_shipment_id: 'TC-X' }, 'shipments_path_check'],
      ['a manual service', { service_code: 'standard' }, 'shipments_path_check'],
      ['a manual COD amount', { cod_amount_minor: 110000 }, 'shipments_path_check'],
      ['a manual provider cost', { provider_cost_minor: 15000 }, 'shipments_path_check'],
      ['a manual booked_at', { booked_at: db.raw('now()') }, 'shipments_path_check'],
      ['an account while pending', { ...requested, status: 'pending' }, 'shipments_path_check'],
      ['an account while packed', { ...requested, status: 'packed' }, 'shipments_path_check'],
      [
        'an account without a pickup address',
        { ...requested, pickup_address_id: null },
        'shipments_path_check',
      ],
      [
        'an account without a reference',
        { ...requested, merchant_reference: null },
        'shipments_path_check',
      ],
      [
        'an account without a COD amount',
        { ...requested, cod_amount_minor: null },
        'shipments_path_check',
      ],
      // shipments_booked_check: the courier's ID once confirmed, and none before
      [
        'booked without a courier ID',
        { ...requested, status: 'booked', booked_at: db.raw('now()') },
        'shipments_booked_check',
      ],
      [
        'booked without booked_at',
        { ...requested, status: 'booked', external_shipment_id: 'TC-Y' },
        'shipments_booked_check',
      ],
      [
        'a courier ID while booking_requested',
        { ...requested, external_shipment_id: 'TC-Z' },
        'shipments_booked_check',
      ],
      [
        'booked_at on a failed booking',
        { ...requested, status: 'booking_failed', booked_at: db.raw('now()') },
        'shipments_booked_check',
      ],
      [
        'a courier ID needing reconciliation',
        { ...requested, status: 'needs_reconciliation', external_shipment_id: 'TC-W' },
        'shipments_booked_check',
      ],
      // shipments_cancelled_check: cancelled_at exactly on cancelled, and never after hand-over
      [
        'cancelled without cancelled_at',
        { ...requested, status: 'cancelled' },
        'shipments_cancelled_check',
      ],
      [
        'cancelled_at on a live booking',
        { ...requested, cancelled_at: db.raw('now()') },
        'shipments_cancelled_check',
      ],
      [
        'cancelled after hand-over',
        {
          ...requested,
          status: 'cancelled',
          cancelled_at: db.raw('now()'),
          shipped_at: db.raw('now()'),
        },
        'shipments_cancelled_check',
      ],
    ]
    for (const [label, values, constraint] of cases) {
      // `so` has no live shipment, so a row these CHECKs let through would be accepted.
      await refused(assert, insertInto(so, values), { code: '23514', constraint }, label)
    }
  })

  test("T-FUL-102 another shop's account or pickup address gives 23503", async ({ assert }) => {
    const courier = await courierShop()
    const otherShop = await courierShop()
    const so = await insertShopOrder(courier.shopId)
    const requested = { ...booking(courier, so), status: 'booking_requested' }

    // The shop's own account and address are accepted.
    const own = await insertShopOrder(courier.shopId)
    await insertShipment(own, { ...booking(courier, own), status: 'booking_requested' })

    const cases: [string, Row, string][] = [
      [
        "another shop's account",
        { ...requested, logistics_account_id: otherShop.accountId },
        'shipments_account_fkey',
      ],
      [
        "another shop's pickup address",
        { ...requested, pickup_address_id: otherShop.addressId },
        'shipments_pickup_address_fkey',
      ],
      [
        "another shop's address on a manual shipment",
        { pickup_address_id: otherShop.addressId },
        'shipments_pickup_address_fkey',
      ],
    ]
    for (const [label, values, constraint] of cases) {
      await refused(assert, insertInto(so, values), { code: '23503', constraint }, label)
    }
  })
})

test.group('T-FUL-103 shipments_booking_guard', () => {
  test('T-FUL-103 a booking keeps its account, address, reference, COD amount, service and courier ID', async ({
    assert,
  }) => {
    const courier = await courierShop()
    const secondAccountId = await insertAccount(courier.shopId)
    const secondAddressId = await insertPickupAddress(courier.shopId)
    const so = await insertShopOrder(courier.shopId)
    const id = await insertShipment(so, { ...booking(courier, so), status: 'booking_requested' })
    // A cancelled booking on a shop order with no live shipment, so that leaving
    // `cancelled` meets only the guard.
    const cancelledSo = await insertShopOrder(courier.shopId)
    const cancelledId = await insertShipment(cancelledSo, {
      ...booking(courier, cancelledSo),
      status: 'cancelled',
      cancelled_at: db.raw('now()'),
    })

    // What the guard allows: the courier's ID written once, then the parcel moving.
    await db
      .from('shipments')
      .where('id', id)
      .update({
        status: 'booked',
        external_shipment_id: 'TC-1001',
        booked_at: db.raw('now()'),
        version: db.raw('version + 1'),
      })
    await db
      .from('shipments')
      .where('id', id)
      .update({
        ...HANDED_OVER,
        status: 'shipped',
        tracking_number: 'TC1001NP',
        tracking_url: 'https://track.example.com/TC1001NP',
        provider_cost_minor: 15000,
      })

    const cases: [string, string, Row][] = [
      ['the account', id, { logistics_account_id: secondAccountId }],
      ['the pickup address', id, { pickup_address_id: secondAddressId }],
      ['the reference', id, { merchant_reference: `${so.number}-S3` }],
      ['the COD amount', id, { cod_amount_minor: 90000 }],
      ['the service', id, { service_code: 'express' }],
      ['the courier ID', id, { external_shipment_id: 'TC-1002' }],
      ['clearing the courier ID', id, { external_shipment_id: null }],
      ['leaving cancelled', cancelledId, { status: 'booking_failed', cancelled_at: null }],
    ]
    for (const [label, shipmentId, values] of cases) {
      await refused(
        assert,
        (trx) => trx.from('shipments').where('id', shipmentId).update(values),
        { code: 'P0001', message: /a booking keeps its account/ },
        label
      )
    }
  })
})

test.group('T-FUL-104 shipments unique keys', () => {
  test('T-FUL-104 one live shipment per shop order beside its cancelled bookings', async ({
    assert,
  }) => {
    const courier = await courierShop()
    const so = await insertShopOrder(courier.shopId)

    // Two cancelled bookings and then a live manual shipment share the shop order.
    for (const n of [1, 2]) {
      await insertShipment(so, {
        ...booking(courier, so, n),
        status: 'cancelled',
        cancelled_at: db.raw('now()'),
      })
    }
    await insertShipment(so, { status: 'pending' })
    const rows = await db.from('shipments').where('shop_order_id', so.id)
    assert.lengthOf(rows, 3)

    await refused(
      assert,
      insertInto(so, { status: 'pending' }),
      { code: '23505', constraint: 'shipments_shop_order_key' },
      'a second live manual shipment'
    )
    await refused(
      assert,
      insertInto(so, { ...booking(courier, so, 3), status: 'booking_requested' }),
      { code: '23505', constraint: 'shipments_shop_order_key' },
      'a second live courier booking'
    )
  })

  test('T-FUL-104 the same courier ID twice on one account gives 23505', async ({ assert }) => {
    const courier = await courierShop()
    const otherAccountId = await insertAccount(courier.shopId)
    const first = await insertShopOrder(courier.shopId)
    const second = await insertShopOrder(courier.shopId)
    const third = await insertShopOrder(courier.shopId)

    await insertShipment(first, { ...booked(courier, first), external_shipment_id: 'TC-777' })
    // The same courier ID on another account is another parcel.
    await insertShipment(third, {
      ...booked(courier, third),
      logistics_account_id: otherAccountId,
      external_shipment_id: 'TC-777',
    })

    await refused(
      assert,
      insertInto(second, { ...booked(courier, second), external_shipment_id: 'TC-777' }),
      { code: '23505', constraint: 'shipments_external_id_key' },
      'the same courier ID on the same account'
    )
  })
})

test.group('T-FUL-105 shipment_events', () => {
  test('T-FUL-105 a repeated courier update adds no row; provider columns only on provider rows', async ({
    assert,
  }) => {
    const courier = await courierShop()
    const so = await insertShopOrder(courier.shopId)
    const shipmentId = await insertShipment(so, booked(courier, so))
    const shop = await db.from('shops').where('id', courier.shopId).firstOrFail()
    const memberId = shop.owner_user_id as string

    // The adapter's insert of docs/04a §11.6: ON CONFLICT DO NOTHING on the partial key.
    const insertCourierUpdate = () =>
      db.rawQuery(
        `INSERT INTO shipment_events
           (shipment_id, shop_id, event, status, actor_type, provider_event_key, raw_status, metadata)
         VALUES (?, ?, 'booked', 'booked', 'provider', 'evt-1', 'Order Created', '{"hub":"Kathmandu"}')
         ON CONFLICT (shipment_id, provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING`,
        [shipmentId, courier.shopId]
      )
    await insertCourierUpdate()
    await insertCourierUpdate()
    const rows = await db.from('shipment_events').where('shipment_id', shipmentId)
    assert.lengthOf(rows, 1, 'the repeated courier update added a row')

    // A vendor entry and a system entry without provider columns are accepted.
    await db.table('shipment_events').multiInsert([
      {
        shipment_id: shipmentId,
        shop_id: courier.shopId,
        event: 'booked',
        status: 'booked',
        actor_type: 'shop_member',
        actor_user_id: memberId,
      },
      {
        shipment_id: shipmentId,
        shop_id: courier.shopId,
        event: 'in_transit',
        status: 'shipped',
        actor_type: 'system',
      },
    ])

    const event = {
      shipment_id: shipmentId,
      shop_id: courier.shopId,
      event: 'booked',
      status: 'booked',
    }
    // A plain insert of the same update is refused by the key the adapter relies on.
    await refused(
      assert,
      (trx) =>
        trx.table('shipment_events').insert({
          ...event,
          actor_type: 'provider',
          provider_event_key: 'evt-1',
          raw_status: 'Order Created',
        }),
      { code: '23505', constraint: 'shipment_events_provider_event_key' },
      'the same courier update without ON CONFLICT'
    )

    const cases: [string, Row][] = [
      [
        'a provider row without raw_status',
        { actor_type: 'provider', provider_event_key: 'evt-2' },
      ],
      [
        'a key on a shop member row',
        { actor_type: 'shop_member', actor_user_id: memberId, provider_event_key: 'evt-3' },
      ],
      ['a key on a system row', { actor_type: 'system', provider_event_key: 'evt-4' }],
      ['raw_status on a system row', { actor_type: 'system', raw_status: 'Order Created' }],
    ]
    for (const [label, values] of cases) {
      await refused(
        assert,
        (trx) => trx.table('shipment_events').insert({ ...event, ...values }),
        { code: '23514', constraint: 'shipment_events_provider_check' },
        label
      )
    }
  })
})

test.group('T-FUL-106 shipment_items keys', () => {
  test('T-FUL-106 a line of another shop order gives 23503; quantity 0 gives 23514', async ({
    assert,
  }) => {
    const shopId = await insertShop()
    const so = await insertShopOrder(shopId)
    const otherSo = await insertShopOrder(shopId)
    const lineId = await insertOrderItem(so)
    const secondLineId = await insertOrderItem(so)
    const otherLineId = await insertOrderItem(otherSo)
    const shipmentId = await insertShipment(so, { status: 'shipped', ...HANDED_OVER })

    // The shipment's own line is accepted.
    await db
      .table('shipment_items')
      .insert({ shipment_id: shipmentId, order_item_id: lineId, shop_order_id: so.id, quantity: 2 })

    const cases: [string, Row, string, string][] = [
      [
        'a line of another shop order',
        { order_item_id: otherLineId, shop_order_id: so.id, quantity: 1 },
        '23503',
        'shipment_items_order_item_fkey',
      ],
      [
        'a line of another shop order, its shop order copied',
        { order_item_id: otherLineId, shop_order_id: otherSo.id, quantity: 1 },
        '23503',
        'shipment_items_shipment_fkey',
      ],
      [
        'quantity 0',
        { order_item_id: secondLineId, shop_order_id: so.id, quantity: 0 },
        '23514',
        'shipment_items_quantity_check',
      ],
    ]
    for (const [label, values, code, constraint] of cases) {
      await refused(
        assert,
        (trx) => trx.table('shipment_items').insert({ shipment_id: shipmentId, ...values }),
        { code, constraint },
        label
      )
    }
  })
})
