import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import { purgeOwnerShop, waitForLockWaiter } from '#tests/support/concurrency'
import { send, signIn } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-CAT-106, the race of docs/04a §7.9 between `replaceProductVariants`
 * deleting a never-stocked variant and a stock adjustment of that variant
 * (R1-S part 2b), with real commits. The action locks the variants' stock
 * rows before it reads their history, so an adjustment that holds the row
 * first commits its movement, and the action then sees the history and
 * archives the variant instead of deleting it. Without the lock the action
 * would read no history, wait on the row only at its delete, and fail on
 * the new movement's foreign key (`inventory_movements_stock_fkey`). A
 * transaction stands in for `adjustInventory` (R1-S part 2c), so the test
 * can hold the row while the request runs; the other order of the same race
 * is in tests/concurrency/inventory/stock.spec.ts. The shop and everything
 * it wrote are deleted after the test (`purgeOwnerShop`).
 */

let made: OwnerShop | null = null

async function cleanUp() {
  if (!made) return
  const shop = made
  made = null
  await purgeOwnerShop(shop)
}

test.group('T-CAT-106 replaceProductVariants against a stock adjustment', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.teardown(cleanUp)

  test('T-CAT-106 an adjustment holding the stock row first turns the delete into an archive', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    made = shop
    const product = await ProductFactory.merge({ shopId: shop.shopId }).create()
    const variant = await db.from('product_variants').where('product_id', product.id).firstOrFail()
    const owner = await signIn(shop.ownerId)

    const adjustment = await db.transaction()
    await adjustment
      .from('inventory_items')
      .where('variant_id', variant.id)
      .forUpdate()
      .select('variant_id')
    await adjustment.table('inventory_movements').insert({
      shop_id: shop.shopId,
      variant_id: variant.id,
      kind: 'adjustment',
      on_hand_delta: 2,
      reserved_delta: 0,
      reason_code: 'received_stock',
      reference_type: 'request',
      reference_id: randomUUID(),
    })
    await adjustment.from('inventory_items').where('variant_id', variant.id).increment('on_hand', 2)

    // The request leaves the default variant out while the adjustment holds its stock row.
    const request = send(
      owner,
      'PUT',
      `/api/v1/seller/shops/${shop.slug}/products/${product.id}/variants`,
      {
        option_axes: [],
        variants: [{ option_value_codes: {}, sku: 'NEW-DEFAULT', price_minor: 100 }],
      },
      { 'If-Match': '"1"' }
    )
    // Commit only once the request waits on a lock, so the race is real on a slow machine too.
    await waitForLockWaiter()
    await adjustment.commit()
    const response = await request
    assert.equal(response.status, 200, response.text)
    const row = await db.from('product_variants').where('id', variant.id).firstOrFail()
    assert.equal(row.status, 'archived', 'stocked meanwhile: archived, not deleted')
    const stockRow = await db.from('inventory_items').where('variant_id', variant.id).firstOrFail()
    assert.equal(stockRow.on_hand, 2, 'the adjustment kept its stock')
    const active = await db
      .from('product_variants')
      .where({ product_id: product.id, status: 'active' })
      .select('sku')
    assert.deepEqual(
      active.map((item) => item.sku),
      ['NEW-DEFAULT']
    )
    const [audit] = await db
      .from('audit_logs')
      .where({ subject_id: product.id, action: 'product.variants_replace' })
    assert.deepEqual(
      [audit.changes.archived, audit.changes.created, audit.changes.deleted],
      [1, 1, 0]
    )
  })
})
