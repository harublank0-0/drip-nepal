import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import type { Browser } from '#tests/support/browser'
import { purgeOwnerShop, waitForLockWaiter } from '#tests/support/concurrency'
import { key, send, signIn } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * The vendor's stock changes against other writers of the same stock row,
 * with real commits (docs/05 §5.9, §8.13, §4.4 level 7; R1-S part 2c). Each
 * action locks the row inside the shop's scope before its guarded update,
 * so its answer is decided on the row as the other writer left it:
 *
 * - T-INV-002: a reservation that commits while an adjustment waits makes
 *   the adjustment 409 `below_reserved` with the new `reserved`, and
 *   nothing is written; three adjustments of -3 against 5 units: one
 *   succeeds, two are refused, and `on_hand` equals the journal's sum
 *   (AC-J11-04).
 * - T-INV-008: a shipment that commits while a count waits makes the count
 *   409 `stock_changed` with the new `on_hand` (AC-J11-03).
 * - T-CAT-106: `replaceProductVariants` deleting a never-stocked variant
 *   while an adjustment waits on its stock row: the adjustment then finds no
 *   row and answers 404 (the other order is in
 *   tests/concurrency/catalog/product_variants.spec.ts).
 *
 * A transaction stands in for the other writer (checkout's reserve, a
 * shipment, the variant delete), so the test holds the row while the
 * request runs. The shop and everything it wrote are deleted after each
 * test (`purgeOwnerShop`).
 */

let made: OwnerShop | null = null

async function cleanUp() {
  if (!made) return
  const shop = made
  made = null
  await purgeOwnerShop(shop)
}

type Stocked = { shop: OwnerShop; owner: Browser; productId: string; variantId: string }

// An owner's shop with a draft product whose default variant has `onHand` units, received through the API.
async function stocked(onHand: number): Promise<Stocked> {
  const shop = await createOwnerShop()
  made = shop
  const product = await ProductFactory.merge({ shopId: shop.shopId }).create()
  const variant = await db.from('product_variants').where('product_id', product.id).firstOrFail()
  const owner = await signIn(shop.ownerId)
  const received = await adjust(
    { shop, owner, productId: product.id, variantId: variant.id },
    { delta: onHand, reason_code: 'received_stock' }
  )
  if (received.status !== 201) throw new Error(`stock setup answered ${received.status}`)
  return { shop, owner, productId: product.id, variantId: variant.id }
}

function adjust(s: Stocked, body: unknown) {
  return send(
    s.owner,
    'POST',
    `/api/v1/seller/shops/${s.shop.slug}/inventory/${s.variantId}/adjustments`,
    body,
    { 'Idempotency-Key': key() }
  )
}

function stocktake(s: Stocked, body: unknown) {
  return send(
    s.owner,
    'POST',
    `/api/v1/seller/shops/${s.shop.slug}/inventory/${s.variantId}/stocktake`,
    body,
    { 'Idempotency-Key': key() }
  )
}

async function stockOf(variantId: string) {
  const row = await db.from('inventory_items').where('variant_id', variantId).first()
  return row ? { onHand: row.on_hand as number, reserved: row.reserved as number } : null
}

async function journalSum(variantId: string) {
  const result = await db.rawQuery(
    `SELECT count(*)::int AS rows, coalesce(sum(on_hand_delta), 0)::int AS on_hand
       FROM inventory_movements WHERE variant_id = ?`,
    [variantId]
  )
  return result.rows[0] as { rows: number; on_hand: number }
}

// A transaction holding the stock row, as another writer's would.
async function holdRow(variantId: string) {
  const trx = await db.transaction()
  await trx.from('inventory_items').where('variant_id', variantId).forUpdate().select('variant_id')
  return trx
}

test.group('T-INV-002 T-INV-008 stock changes against other writers', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.teardown(cleanUp)

  test('T-INV-002 a reservation committed while an adjustment waits makes it 409 below_reserved', async ({
    assert,
  }) => {
    const s = await stocked(5)
    const checkout = await holdRow(s.variantId)
    await checkout.from('inventory_items').where('variant_id', s.variantId).increment('reserved', 4)
    const request = adjust(s, { delta: -3, reason_code: 'damaged' })
    await waitForLockWaiter()
    await checkout.commit()
    const response = await request
    assert.equal(response.status, 409, response.text)
    assert.deepInclude(response.body.errors[0], {
      field: 'delta',
      code: 'below_reserved',
      on_hand: 5,
      reserved: 4,
    })
    assert.deepEqual(await stockOf(s.variantId), { onHand: 5, reserved: 4 })
    assert.deepEqual(await journalSum(s.variantId), { rows: 1, on_hand: 5 })
  })

  test('T-INV-002 three adjustments of -3 against 5 units: one succeeds, the journal matches [AC-J11-04]', async ({
    assert,
  }) => {
    const s = await stocked(5)
    const responses = await Promise.all(
      [1, 2, 3].map(() => adjust(s, { delta: -3, reason_code: 'sold_offline' }))
    )
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [201, 409, 409],
      responses.map((response) => response.text).join('\n')
    )
    for (const response of responses.filter((item) => item.status === 409)) {
      assert.equal(response.body.errors[0].code, 'below_reserved')
      assert.equal(response.body.errors[0].on_hand, 2)
    }
    assert.deepEqual(await stockOf(s.variantId), { onHand: 2, reserved: 0 })
    assert.deepEqual(await journalSum(s.variantId), { rows: 2, on_hand: 2 })
  })

  test('T-INV-008 a shipment committed while a count waits makes it 409 stock_changed [AC-J11-03]', async ({
    assert,
  }) => {
    const s = await stocked(5)
    const shipment = await holdRow(s.variantId)
    await shipment.from('inventory_items').where('variant_id', s.variantId).decrement('on_hand', 1)
    const request = stocktake(s, { counted_quantity: 5, expected_on_hand: 5 })
    await waitForLockWaiter()
    await shipment.commit()
    const response = await request
    assert.equal(response.status, 409, response.text)
    assert.deepInclude(response.body.errors[0], {
      field: 'expected_on_hand',
      code: 'stock_changed',
      on_hand: 4,
    })
    assert.deepEqual(await stockOf(s.variantId), { onHand: 4, reserved: 0 })
    const journal = await journalSum(s.variantId)
    assert.equal(journal.rows, 1)
  })

  test('T-CAT-106 an adjustment waiting on a variant that a replace deletes answers 404', async ({
    assert,
  }) => {
    const s = await stocked(1)
    // A second, never-stocked variant, which a replace may delete (docs/04a §7.9).
    const [spare] = await db
      .table('product_variants')
      .insert({
        shop_id: s.shop.shopId,
        product_id: s.productId,
        sku: `SPARE-${Date.now()}`,
        price_minor: 100,
        is_default: false,
        option_signature: 'apparel_size:s',
      })
      .returning('id')
    await db.table('inventory_items').insert({ variant_id: spare.id, shop_id: s.shop.shopId })
    const spareStock: Stocked = { ...s, variantId: spare.id }

    const replace = await db.transaction()
    await replace.from('products').where('id', s.productId).forUpdate().select('id')
    await replace
      .from('inventory_items')
      .where('variant_id', spare.id)
      .forUpdate()
      .select('variant_id')
    await replace.from('inventory_items').where('variant_id', spare.id).delete()
    await replace.from('product_variants').where('id', spare.id).delete()
    const request = adjust(spareStock, { delta: 2, reason_code: 'received_stock' })
    await waitForLockWaiter()
    await replace.commit()
    const response = await request
    assert.equal(response.status, 404, response.text)
    assert.equal(response.body.code, 'NOT_FOUND')
    assert.isNull(await stockOf(spare.id))
    assert.deepEqual(await journalSum(spare.id), { rows: 0, on_hand: 0 })
  })
})
