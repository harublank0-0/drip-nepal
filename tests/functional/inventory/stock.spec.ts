import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { STOCK_MAX } from '#modules/inventory/domain/stock_limits'
import type { Browser } from '#tests/support/browser'
import {
  audits,
  create,
  draftBody,
  fields,
  jobsFor,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { key, send, signIn } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { insertShopOrder } from '#tests/support/schema_rows'
import { addMember, setShopStatus } from '#tests/support/shops'

/*
 * The seller's stock over HTTP (docs/06 §13.5, §14.3; 05 §5.9, §8.13; 01
 * FR-INV-001, FR-INV-003; 02 J-11; R1-S part 2c):
 *
 * - T-INV-008: `adjustInventory` ⚷ answers 201 with the stock row and the
 *   movement; one `adjustment` movement with the actor, reason, note,
 *   request ID and the key row as its reference, one `inventory.adjust`
 *   audit row without the note, one `catalog.refresh_listing` job
 *   (AC-J11-02's first sentence; append-only is T-INV-006); a replay
 *   answers the stored 201 and changes stock once, also when it sends the
 *   omitted note as null or blank, the same key with another body is 422,
 *   no key is 400 (AC-J11-05); a
 *   delta of 0, a decimal or a string, `correction`, `stocktake` or an
 *   unknown reason and a long note are 422 and write nothing (AC-J11-07);
 *   `data_entry_error` is a vendor reason; a blank note is no note; a
 *   result below zero is 409 `below_reserved`, and above the column's limit
 *   422 `max`. `stocktakeInventory` ⚷ sets `on_hand` to the count with a
 *   `stocktake` movement, also when the count confirms the number (0, and
 *   no listing job, AC-J11-08); a stale `expected_on_hand` is 409
 *   `stock_changed` with `on_hand` and `reserved` (AC-J11-03); a refused
 *   request stores no key, so the same key works for the next attempt; an
 *   archived variant of an archived product can still be changed.
 * - T-INV-002: with 2 units committed to an `awaiting_acceptance` shop
 *   order and 1 held for an `awaiting_payment` one, an adjustment or count
 *   below `reserved` is 409 `below_reserved` with the split (the committed
 *   shop order's number, the held units as a count only) and writes
 *   nothing; down to `reserved` is fine (AC-J11-01); `stock_changed` comes
 *   before `below_reserved`; the split names the shop orders the vendor can
 *   act on, oldest first, at most 20, and never an unpaid one.
 * - T-INV-009: `listInventory` lists the shop's products, newest change
 *   first, with their active variants: SKU, label, `on_hand`, `reserved`,
 *   `available` and the latest movement (02 J-11 step 1); archived
 *   products only with `status=archived`; `q` on a title prefix in any
 *   case or a SKU prefix; cursor pages, and a cursor made for other filters
 *   is 400; `low_stock` (R2) and unknown parameters are 400.
 * - T-SEC-001: another shop's variant, an unknown one or a non-UUID is 404
 *   and writes nothing; another shop's products are not listed.
 * - T-SEC-003: `shop_id`, `on_hand` or any other member is `unknown_field`.
 * - T-SEC-030: a viewer or order fulfiller lists but cannot change stock; a
 *   catalog editor can.
 * - T-SEC-031: the list opens while suspended in either mode and is refused
 *   while `pending_review`; changes need an `active` shop.
 */

const inventoryPath = (slug: string) => `/api/v1/seller/shops/${slug}/inventory`

function adjust(
  w: World,
  variantId: string,
  body: unknown,
  idempotencyKey: string | null = key(),
  as: Browser = w.owner
) {
  return send(
    as,
    'POST',
    `${inventoryPath(w.shop.slug)}/${variantId}/adjustments`,
    body,
    idempotencyKey === null ? {} : { 'Idempotency-Key': idempotencyKey }
  )
}

function stocktake(
  w: World,
  variantId: string,
  body: unknown,
  idempotencyKey = key(),
  as: Browser = w.owner
) {
  return send(as, 'POST', `${inventoryPath(w.shop.slug)}/${variantId}/stocktake`, body, {
    'Idempotency-Key': idempotencyKey,
  })
}

function list(w: World, query = '', as: Browser = w.owner) {
  return send(as, 'GET', `${inventoryPath(w.shop.slug)}${query}`)
}

// A draft product with its default variant at 0, created through `createProduct`.
async function product(w: World, overrides: Record<string, unknown> = {}) {
  const response = await create(w, await draftBody(overrides))
  const data = response.body.data as { id: string; variants: { id: string; sku: string }[] }
  return { id: data.id, variantId: data.variants[0].id, sku: data.variants[0].sku }
}

const movements = (variantId: string) =>
  db.from('inventory_movements').where('variant_id', variantId).orderBy('id')

async function stockOf(variantId: string) {
  const row = await db.from('inventory_items').where('variant_id', variantId).firstOrFail()
  return { onHand: row.on_hand as number, reserved: row.reserved as number }
}

const received = (delta: number) => ({ delta, reason_code: 'received_stock' })

/*
 * Units of `variantId` reserved for a new shop order of the shop, as
 * checkout and the payment flows will reserve them (05 §5.3): `committed`
 * for an `awaiting_acceptance` shop order, `held` for an `awaiting_payment`
 * one (or another shop order status, and other shop order columns), with
 * `reserved` raised to match. Returns the shop order's number.
 */
async function reserve(
  shopId: string,
  productId: string,
  variantId: string,
  quantity: number,
  status: 'committed' | 'held',
  shopOrderStatus: 'awaiting_acceptance' | 'accepted' | 'awaiting_payment' = status === 'held'
    ? 'awaiting_payment'
    : 'awaiting_acceptance',
  shopOrderColumns: Record<string, unknown> = {}
) {
  const shopOrder = await insertShopOrder(shopId, {
    ...(shopOrderStatus === 'awaiting_payment'
      ? { status: 'awaiting_payment', acceptance_due_at: null }
      : shopOrderStatus === 'accepted'
        ? { status: 'accepted', accepted_at: db.raw('now()') }
        : {}),
    ...shopOrderColumns,
  })
  const [item] = await db
    .table('order_items')
    .insert({
      order_id: shopOrder.orderId,
      shop_order_id: shopOrder.id,
      shop_id: shopId,
      product_id: productId,
      variant_id: variantId,
      product_title_snapshot: 'Organic cotton crew tee',
      variant_label_snapshot: '',
      sku_snapshot: 'TEE-1',
      category_path_snapshot: 'Clothing > T-shirts',
      unit_price_minor: 50000,
      quantity,
      line_subtotal_minor: 50000 * quantity,
      line_total_minor: 50000 * quantity,
      commission_rate_bp: 1000,
      commission_minor: 5000 * quantity,
    })
    .returning('id')
  await db.table('inventory_reservations').insert({
    shop_id: shopId,
    variant_id: variantId,
    order_id: shopOrder.orderId,
    order_item_id: item.id,
    quantity,
    status,
    expires_at: status === 'held' ? db.raw(`now() + interval '30 minutes'`) : null,
  })
  await db
    .from('inventory_items')
    .where({ variant_id: variantId, shop_id: shopId })
    .increment('reserved', quantity)
  return shopOrder.number
}

test.group('T-INV-008 adjustInventory and stocktakeInventory', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-INV-008 an adjustment answers the row and its movement and writes the journal, audit and job [AC-J11-02 first sentence]', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    const { length: before } = await jobsFor(productId)
    const idempotencyKey = key()
    const response = await adjust(
      w,
      variantId,
      { ...received(20), note: 'Batch from Balaju workshop' },
      idempotencyKey
    )
    assert.equal(response.status, 201, response.text)
    const { movement, ...stock } = response.body.data
    assert.deepEqual(stock, {
      variant_id: variantId,
      on_hand: 20,
      reserved: 0,
      available: 20,
      version: 2,
    })
    assert.deepInclude(movement, {
      kind: 'adjustment',
      on_hand_delta: 20,
      reserved_delta: 0,
      reason_code: 'received_stock',
    })
    assert.deepEqual(Object.keys(movement).sort(), [
      'created_at',
      'id',
      'kind',
      'on_hand_delta',
      'reason_code',
      'reserved_delta',
    ])

    const [row] = await movements(variantId)
    const keyRow = await db
      .from('idempotency_keys')
      .where({ operation: 'adjustInventory', key: idempotencyKey })
      .firstOrFail()
    assert.deepInclude(row, {
      id: movement.id,
      shop_id: w.shop.shopId,
      kind: 'adjustment',
      on_hand_delta: 20,
      reason_code: 'received_stock',
      note: 'Batch from Balaju workshop',
      actor_user_id: w.shop.ownerId,
      reference_type: 'request',
      reference_id: keyRow.id,
      request_id: response.headers.get('x-request-id'),
    })
    const [audit] = await audits(variantId, 'inventory.adjust')
    assert.deepInclude(audit, {
      actor_type: 'shop_member',
      actor_user_id: w.shop.ownerId,
      actor_role: `shop:${w.shop.shopId}:owner`,
      subject_type: 'inventory_item',
      shop_id: w.shop.shopId,
    })
    assert.isNotNull(audit.ip_hash)
    assert.deepEqual(audit.changes, {
      on_hand: { from: 0, to: 20 },
      reason_code: 'received_stock',
      movement_id: movement.id,
    })
    assert.notInclude(
      JSON.stringify(audit.changes),
      'Balaju',
      'the note stays out of the audit row'
    )
    assert.lengthOf(await jobsFor(productId), before + 1)
    assert.deepEqual(await stockOf(variantId), { onHand: 20, reserved: 0 })
  })

  test('T-INV-008 a replay answers the stored 201 and changes stock once [AC-J11-05, AC-FR-INV-001-4]', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    const idempotencyKey = key()
    const first = await adjust(w, variantId, received(5), idempotencyKey)
    assert.equal(first.status, 201, first.text)
    const again = await adjust(w, variantId, received(5), idempotencyKey)
    assert.equal(again.status, 201, again.text)
    assert.equal(again.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(again.body, first.body)
    for (const note of [null, '  ']) {
      const sameRequest = await adjust(w, variantId, { ...received(5), note }, idempotencyKey)
      assert.equal(sameRequest.status, 201, String(note))
      assert.equal(sameRequest.headers.get('idempotency-replayed'), 'true', String(note))
    }
    const reused = await adjust(w, variantId, received(6), idempotencyKey)
    assert.equal(reused.status, 422)
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED')
    const keyless = await adjust(w, variantId, received(5), null)
    assert.equal(keyless.status, 400)
    assert.equal(keyless.body.code, 'IDEMPOTENCY_KEY_REQUIRED')
    assert.lengthOf(await movements(variantId), 1)
    assert.deepEqual(await stockOf(variantId), { onHand: 5, reserved: 0 })
  })

  test('T-INV-008 a delta of 0, a non-integer, a system or unknown reason and a long note are 422 [AC-J11-07]', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    const cases: [unknown, [string, string]][] = [
      [received(0), ['delta', 'not_zero']],
      [received(1.5), ['delta', 'without_decimals']],
      [{ delta: '5', reason_code: 'received_stock' }, ['delta', 'number']],
      [{ delta: STOCK_MAX + 1, reason_code: 'received_stock' }, ['delta', 'range']],
      [{ delta: 1, reason_code: 'correction' }, ['reason_code', 'enum']],
      [{ delta: 1, reason_code: 'stocktake' }, ['reason_code', 'enum']],
      [{ delta: 1, reason_code: 'other' }, ['reason_code', 'enum']],
      [{ delta: 1 }, ['reason_code', 'required']],
      [{ ...received(1), note: 'x'.repeat(501) }, ['note', 'max_length']],
    ]
    for (const [body, expected] of cases) {
      const response = await adjust(w, variantId, body)
      assert.equal(response.status, 422, JSON.stringify(body))
      assert.deepEqual(fields(response.body), [expected], JSON.stringify(body))
    }
    assert.lengthOf(await movements(variantId), 0)

    const fixed = await adjust(w, variantId, {
      delta: 1,
      reason_code: 'data_entry_error',
      note: '  ',
    })
    assert.equal(fixed.status, 201, fixed.text)
    const [row] = await movements(variantId)
    assert.deepInclude(row, { reason_code: 'data_entry_error', note: null })
  })

  test('T-INV-008 a result below zero is 409 below_reserved; above the column limit 422 max; neither stores the key', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    await adjust(w, variantId, received(2))
    const idempotencyKey = key()
    const below = await adjust(w, variantId, { delta: -3, reason_code: 'lost' }, idempotencyKey)
    assert.equal(below.status, 409)
    assert.equal(below.body.code, 'CONFLICT')
    assert.deepEqual(below.body.errors, [
      {
        field: 'delta',
        code: 'below_reserved',
        message: 'On hand is 2, and it cannot go below zero.',
        on_hand: 2,
        reserved: 0,
        reserved_committed: 0,
        committed_shop_orders: [],
        reserved_held: 0,
      },
    ])
    // Nothing was written, the key row included: the next attempt may use the same key.
    const retried = await adjust(w, variantId, { delta: -2, reason_code: 'lost' }, idempotencyKey)
    assert.equal(retried.status, 201, retried.text)
    assert.equal(retried.body.data.on_hand, 0)

    await db
      .from('inventory_items')
      .where('variant_id', variantId)
      .update({ on_hand: STOCK_MAX - 1 })
    const above = await adjust(w, variantId, received(2))
    assert.equal(above.status, 422)
    assert.deepEqual(fields(above.body), [['delta', 'max']])
    const kept = await stockOf(variantId)
    assert.equal(kept.onHand, STOCK_MAX - 1)
    assert.lengthOf(await movements(variantId), 2)
  })

  test('T-INV-008 a stocktake sets the count; a confirming count is journaled at 0 [AC-FR-INV-003-1, AC-J11-08]', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(20))
    const { length: jobsBefore } = await jobsFor(productId)
    const counted = await stocktake(w, variantId, { counted_quantity: 18, expected_on_hand: 20 })
    assert.equal(counted.status, 201, counted.text)
    assert.deepInclude(counted.body.data, { on_hand: 18, available: 18, version: 3 })
    assert.deepInclude(counted.body.data.movement, {
      kind: 'stocktake',
      on_hand_delta: -2,
      reason_code: 'stocktake',
    })
    assert.lengthOf(await jobsFor(productId), jobsBefore + 1)
    const [audit] = await audits(variantId, 'inventory.stocktake')
    assert.deepEqual(audit.changes, {
      on_hand: { from: 20, to: 18 },
      reason_code: 'stocktake',
      movement_id: counted.body.data.movement.id,
    })

    const confirmed = await stocktake(w, variantId, { counted_quantity: 18, expected_on_hand: 18 })
    assert.equal(confirmed.status, 201, confirmed.text)
    assert.deepInclude(confirmed.body.data, { on_hand: 18, version: 4 })
    assert.equal(confirmed.body.data.movement.on_hand_delta, 0)
    assert.lengthOf(
      await jobsFor(productId),
      jobsBefore + 1,
      'a confirming count refreshes nothing'
    )
    const rows = await movements(variantId)
    assert.deepEqual(
      rows.map((row) => [row.kind, row.on_hand_delta, row.actor_user_id]),
      [
        ['adjustment', 20, w.shop.ownerId],
        ['stocktake', -2, w.shop.ownerId],
        ['stocktake', 0, w.shop.ownerId],
      ]
    )
  })

  test('T-INV-008 a stale expected_on_hand is 409 stock_changed and writes nothing [AC-J11-03]', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    await adjust(w, variantId, received(11))
    const idempotencyKey = key()
    const stale = await stocktake(
      w,
      variantId,
      { counted_quantity: 12, expected_on_hand: 12 },
      idempotencyKey
    )
    assert.equal(stale.status, 409)
    assert.equal(
      stale.body.detail,
      'Stock changed while you were counting. Check the new number and confirm again.'
    )
    assert.deepEqual(stale.body.errors, [
      {
        field: 'expected_on_hand',
        code: 'stock_changed',
        message: 'On hand is now 11.',
        on_hand: 11,
        reserved: 0,
      },
    ])
    const lower = await stocktake(w, variantId, { counted_quantity: 12, expected_on_hand: 10 })
    assert.deepEqual(fields(lower.body), [['expected_on_hand', 'stock_changed']], 'lower too')
    assert.lengthOf(await movements(variantId), 1)
    const again = await stocktake(
      w,
      variantId,
      { counted_quantity: 12, expected_on_hand: 11 },
      idempotencyKey
    )
    assert.equal(again.status, 201, again.text)
    assert.equal(again.body.data.on_hand, 12)
  })

  test('T-INV-008 an archived variant of an archived product can still be adjusted and counted', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(1))
    // Its row stays for restocks (docs/04a §8.1), so the vendor can correct it (05 §5.9).
    await db.from('product_variants').where('id', variantId).update({ status: 'archived' })
    await db.from('products').where('id', productId).update({ status: 'archived' })
    const restocked = await adjust(w, variantId, { delta: 2, reason_code: 'found' })
    assert.equal(restocked.status, 201, restocked.text)
    const counted = await stocktake(w, variantId, { counted_quantity: 2, expected_on_hand: 3 })
    assert.equal(counted.status, 201, counted.text)
    assert.deepEqual(await stockOf(variantId), { onHand: 2, reserved: 0 })
  })

  test('T-INV-008 the stocktake numbers are bounded integers', async ({ assert }) => {
    const w = await world()
    const { variantId } = await product(w)
    const cases: [unknown, [string, string][]][] = [
      [{ counted_quantity: -1, expected_on_hand: 0 }, [['counted_quantity', 'range']]],
      [{ counted_quantity: 1.5, expected_on_hand: 0 }, [['counted_quantity', 'without_decimals']]],
      [{ counted_quantity: 1 }, [['expected_on_hand', 'required']]],
      [{ counted_quantity: 1, expected_on_hand: STOCK_MAX + 1 }, [['expected_on_hand', 'range']]],
    ]
    for (const [body, expected] of cases) {
      const response = await stocktake(w, variantId, body)
      assert.equal(response.status, 422, JSON.stringify(body))
      assert.deepEqual(fields(response.body), expected, JSON.stringify(body))
    }
    assert.lengthOf(await movements(variantId), 0)
  })
})

test.group('T-INV-002 a change below reserved', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-INV-002 an adjustment below reserved is 409 with the split; down to reserved is fine [AC-J11-01]', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(5))
    const committed = await reserve(w.shop.shopId, productId, variantId, 2, 'committed')
    await reserve(w.shop.shopId, productId, variantId, 1, 'held')
    const refused = await adjust(w, variantId, { delta: -3, reason_code: 'damaged' })
    assert.equal(refused.status, 409)
    assert.equal(
      refused.body.detail,
      'This change would leave less stock than is reserved for orders.'
    )
    assert.deepEqual(refused.body.errors, [
      {
        field: 'delta',
        code: 'below_reserved',
        message: 'On hand cannot go below the 3 reserved units.',
        on_hand: 5,
        reserved: 3,
        reserved_committed: 2,
        committed_shop_orders: [committed],
        reserved_held: 1,
      },
    ])
    assert.deepEqual(await stockOf(variantId), { onHand: 5, reserved: 3 })
    assert.lengthOf(await movements(variantId), 1)
    assert.lengthOf(await audits(variantId, 'inventory.adjust'), 1)

    const fine = await adjust(w, variantId, { delta: -2, reason_code: 'damaged' })
    assert.equal(fine.status, 201, fine.text)
    assert.deepInclude(fine.body.data, { on_hand: 3, reserved: 3, available: 0 })
    assert.lengthOf(await movements(variantId), 2)
  })

  test('T-INV-002 the split names accepted shop orders, oldest first, and never one the vendor cannot see', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(9))
    const waiting = await reserve(w.shop.shopId, productId, variantId, 1, 'committed')
    // Placed an hour before the waiting one, though inserted after it: oldest first.
    const accepted = await reserve(
      w.shop.shopId,
      productId,
      variantId,
      2,
      'committed',
      'accepted',
      {
        created_at: db.raw(`now() - interval '1 hour'`),
      }
    )
    // Committed units of an unpaid shop order cannot arise (05 §5.3); were they to, the number stays hidden.
    await reserve(w.shop.shopId, productId, variantId, 1, 'committed', 'awaiting_payment')
    const refused = await adjust(w, variantId, { delta: -6, reason_code: 'lost' })
    assert.deepInclude(refused.body.errors[0], {
      reserved: 4,
      reserved_committed: 4,
      committed_shop_orders: [accepted, waiting],
      reserved_held: 0,
    })
  })

  test('T-INV-002 the split names at most 20 shop orders and counts every unit', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(21))
    const numbers: string[] = []
    for (let n = 0; n < 21; n++) {
      numbers.push(await reserve(w.shop.shopId, productId, variantId, 1, 'committed'))
    }
    const refused = await adjust(w, variantId, { delta: -1, reason_code: 'lost' })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.errors[0].reserved_committed, 21)
    assert.deepEqual(refused.body.errors[0].committed_shop_orders, numbers.slice(0, 20))
  })

  test('T-INV-002 a count below reserved is 409 on counted_quantity; stock_changed comes first [AC-FR-INV-003-2]', async ({
    assert,
  }) => {
    const w = await world()
    const { id: productId, variantId } = await product(w)
    await adjust(w, variantId, received(5))
    const committed = await reserve(w.shop.shopId, productId, variantId, 2, 'committed')
    const refused = await stocktake(w, variantId, { counted_quantity: 1, expected_on_hand: 5 })
    assert.equal(refused.status, 409)
    assert.deepEqual(refused.body.errors, [
      {
        field: 'counted_quantity',
        code: 'below_reserved',
        message: 'On hand cannot go below the 2 reserved units.',
        on_hand: 5,
        reserved: 2,
        reserved_committed: 2,
        committed_shop_orders: [committed],
        reserved_held: 0,
      },
    ])
    const both = await stocktake(w, variantId, { counted_quantity: 1, expected_on_hand: 4 })
    assert.deepEqual(fields(both.body), [['expected_on_hand', 'stock_changed']])
    assert.deepEqual(await stockOf(variantId), { onHand: 5, reserved: 2 })
    assert.lengthOf(await movements(variantId), 1)
    const fine = await stocktake(w, variantId, { counted_quantity: 2, expected_on_hand: 5 })
    assert.equal(fine.status, 201, fine.text)
    assert.deepInclude(fine.body.data, { on_hand: 2, reserved: 2, available: 0 })
  })
})

test.group('T-INV-009 listInventory', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-INV-009 the list shows each product’s active variants with stock and the latest movement', async ({
    assert,
  }) => {
    const w = await world()
    const tee = await product(w)
    const size = (code: string, sku: string, id?: string) => ({
      ...(id ? { id } : {}),
      option_value_codes: { apparel_size: code },
      sku,
      price_minor: 129900,
    })
    const replace = (variants: unknown[], version: number) =>
      send(
        w.owner,
        'PUT',
        `${productPath(w.shop.slug, tee.id)}/variants`,
        { option_axes: ['apparel_size'], variants },
        { 'If-Match': `"${version}"` }
      )
    const sized = await replace([size('s', 'TEE-S'), size('m', 'TEE-M'), size('l', 'TEE-L')], 1)
    assert.equal(sized.status, 200, sized.text)
    const [small, medium, large] = sized.body.data.variants as { id: string }[]
    await adjust(w, small.id, received(7))
    await adjust(w, small.id, { delta: -1, reason_code: 'damaged' })
    await adjust(w, large.id, received(2))
    // Stocked and left out, the large variant is archived, not deleted (docs/04a §7.9).
    const kept = await replace([size('s', 'TEE-S', small.id), size('m', 'TEE-M', medium.id)], 2)
    assert.equal(kept.status, 200, kept.text)
    const archived = await db.from('product_variants').where('id', large.id).firstOrFail()
    assert.equal(archived.status, 'archived')
    const response = await list(w)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body.meta, { limit: 25, next_cursor: null })
    const [item] = response.body.data
    assert.deepInclude(item, {
      product_id: tee.id,
      title: 'Organic cotton crew tee',
      status: 'draft',
    })
    const variants = item.variants as Record<string, unknown>[]
    assert.deepEqual(
      variants.map((variant) => [variant.variant_id, variant.sku, variant.label]),
      [
        [small.id, 'TEE-S', 'Size: S'],
        [medium.id, 'TEE-M', 'Size: M'],
      ],
      'the archived variant is not shown'
    )
    assert.deepInclude(variants[0], {
      is_default: false,
      on_hand: 6,
      reserved: 0,
      available: 6,
      version: 3,
    })
    assert.deepInclude(variants[0].last_movement as object, {
      kind: 'adjustment',
      reason_code: 'damaged',
      on_hand_delta: -1,
      reserved_delta: 0,
    })
    assert.deepInclude(variants[1], { on_hand: 0, last_movement: null })
  })

  test('T-INV-009 filters, cursor pages and parameters', async ({ assert }) => {
    const w = await world()
    const topi = await product(w, { title: 'Dhaka topi' })
    const shawl = await product(w, { title: 'Pashmina shawl' })
    const tee = await product(w)
    await db.from('products').where('id', topi.id).update({ status: 'archived' })
    const others = await world()
    await product(others, { title: 'Pashmina wrap' })
    const ids = (response: { body: { data: { product_id: string }[] } }) =>
      response.body.data.map((item) => item.product_id)

    // Newest change first. Inside the suite's one transaction the change times tie and the ID
    // decides; T-CAT-010 orders the same query by real change times (concurrency suite).
    assert.deepEqual(
      ids(await list(w)),
      [tee.id, shawl.id],
      'archived products are left out; another shop’s are never listed'
    )
    assert.deepEqual(ids(await list(w, '?status=archived')), [topi.id])
    assert.deepEqual(ids(await list(w, '?q=PASH')), [shawl.id], 'a title prefix, in any case')
    assert.deepEqual(
      ids(await list(w, `?q=${encodeURIComponent(shawl.sku)}`)),
      [shawl.id],
      'a SKU prefix'
    )
    assert.deepEqual(ids(await list(w, '?q=zzz')), [])
    assert.deepEqual(ids(await list(w, `?status=archived&q=${encodeURIComponent(topi.sku)}`)), [
      topi.id,
    ])

    await db.from('products').where('id', topi.id).update({ status: 'draft' })
    const page = await list(w, '?limit=2')
    assert.deepEqual(ids(page), [tee.id, shawl.id])
    assert.isString(page.body.meta.next_cursor)
    const next = await list(w, `?limit=2&cursor=${page.body.meta.next_cursor}`)
    assert.deepEqual(ids(next), [topi.id])
    assert.isNull(next.body.meta.next_cursor)
    const foreign = await list(w, `?limit=2&q=pash&cursor=${page.body.meta.next_cursor}`)
    assert.equal(foreign.status, 400, 'a cursor made for other filters')
    assert.equal(foreign.body.code, 'INVALID_QUERY_PARAMETER')

    for (const query of ['?low_stock=true', '?shop_id=x', '?q=', '?status=sold']) {
      const refused = await list(w, query)
      assert.equal(refused.status, 400, query)
      assert.equal(refused.body.code, 'INVALID_QUERY_PARAMETER', query)
    }
  })
})

test.group('T-SEC-001 T-SEC-003 T-SEC-030 T-SEC-031 stock access', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-SEC-001 another shop’s variant, an unknown one or a non-UUID is 404 and writes nothing', async ({
    assert,
  }) => {
    const w = await world()
    const theirs = await world()
    const { variantId } = await product(theirs)
    await adjust(theirs, variantId, received(4))
    const foreign = await adjust(w, variantId, received(1))
    assert.equal(foreign.status, 404)
    assert.equal(foreign.body.code, 'NOT_FOUND')
    assert.notProperty(foreign.body, 'errors')
    const counted = await stocktake(w, variantId, { counted_quantity: 0, expected_on_hand: 4 })
    assert.equal(counted.status, 404)
    assert.equal(counted.body.code, 'NOT_FOUND')
    assert.notProperty(counted.body, 'errors')
    const unknown = await adjust(w, '01929a51-0000-7000-8000-0000000000b1', received(1))
    assert.equal(unknown.status, 404)
    const malformed = await adjust(w, 'not-a-uuid', received(1))
    assert.equal(malformed.status, 404)
    assert.deepEqual(await stockOf(variantId), { onHand: 4, reserved: 0 })
    assert.lengthOf(await movements(variantId), 1)
    // An upper-case ID names the same variant of the caller's own shop.
    const mine = await product(w)
    const upper = await adjust(w, mine.variantId.toUpperCase(), received(1))
    assert.equal(upper.status, 201, upper.text)
    assert.equal(upper.body.data.variant_id, mine.variantId)
    const [audit] = await audits(mine.variantId, 'inventory.adjust')
    assert.equal(audit.subject_id, mine.variantId, 'the audit row names the canonical ID')
  })

  test('T-SEC-003 a server-owned or unknown member is unknown_field', async ({ assert }) => {
    const w = await world()
    const { variantId } = await product(w)
    const cases: [string, unknown][] = [
      ['adjust', { ...received(1), shop_id: w.shop.shopId }],
      ['adjust', { ...received(1), on_hand: 9 }],
      ['stocktake', { counted_quantity: 1, expected_on_hand: 0, reserved: 0 }],
    ]
    for (const [operation, body] of cases) {
      const response =
        operation === 'adjust'
          ? await adjust(w, variantId, body)
          : await stocktake(w, variantId, body)
      assert.equal(response.status, 422, JSON.stringify(body))
      assert.deepInclude(
        fields(response.body).map(([, code]) => code),
        'unknown_field',
        JSON.stringify(body)
      )
    }
    assert.lengthOf(await movements(variantId), 0)
  })

  test('T-SEC-030 a viewer or fulfiller lists but cannot change stock; a catalog editor can', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    for (const role of ['viewer', 'order_fulfiller']) {
      const browser = await signIn(await addMember(w.shop.shopId, role))
      const read = await list(w, '', browser)
      assert.equal(read.status, 200, role)
      const write = await adjust(w, variantId, received(1), key(), browser)
      assert.equal(write.status, 403, role)
      assert.equal(write.body.code, 'FORBIDDEN', role)
      const count = await stocktake(
        w,
        variantId,
        { counted_quantity: 1, expected_on_hand: 0 },
        key(),
        browser
      )
      assert.equal(count.status, 403, role)
    }
    const editorId = await addMember(w.shop.shopId, 'catalog_editor')
    const editor = await signIn(editorId)
    const edited = await adjust(w, variantId, received(1), key(), editor)
    assert.equal(edited.status, 201, edited.text)
    const [row] = await movements(variantId)
    assert.equal(row.actor_user_id, editorId)
  })

  test('T-SEC-031 the list opens while suspended; a change needs an active shop', async ({
    assert,
  }) => {
    const w = await world()
    const { variantId } = await product(w)
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const read = await list(w)
    assert.equal(read.status, 200, read.text)
    const write = await adjust(w, variantId, received(1))
    assert.equal(write.status, 403)
    assert.equal(write.body.code, 'SHOP_NOT_ACTIVE')
    const count = await stocktake(w, variantId, { counted_quantity: 1, expected_on_hand: 0 })
    assert.equal(count.body.code, 'SHOP_NOT_ACTIVE')
    assert.lengthOf(await movements(variantId), 0)
    await setShopStatus(w.shop.shopId, 'suspended', 'frozen')
    const frozenRead = await list(w)
    assert.equal(frozenRead.status, 200, frozenRead.text)
    const frozenWrite = await adjust(w, variantId, received(1))
    assert.equal(frozenWrite.body.code, 'SHOP_NOT_ACTIVE')
    await setShopStatus(w.shop.shopId, 'pending_review')
    const pending = await list(w)
    assert.equal(pending.status, 403)
    assert.equal(pending.body.code, 'SHOP_NOT_ACTIVE')
  })
})
