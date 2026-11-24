import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { send, signIn } from '#tests/support/courier_http'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-CAT-010 and T-API-003, the order of `listShopProducts` (docs/06 §13.5,
 * §6.2; R1-S part 2a), where real commits matter: `products_set_updated_at`
 * sets `updated_at` to the transaction's `now()`, so inside the functional
 * suite's one global transaction every product shares one change time and
 * only the `id` tie-break would order them. Here each write commits, so the
 * change times differ: a product created first and edited last is listed
 * first, and the cursor pages follow the change time, not the creation
 * order. The shop, its products and the users are deleted after each test,
 * as the migrator with the retention exemption for the append-only rows.
 */

let made: OwnerShop | null = null

async function cleanUp() {
  if (!made) return
  const shop = made
  made = null
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx.from('audit_logs').where('shop_id', shop.shopId).delete()
    await trx.from('inventory_items').where('shop_id', shop.shopId).delete()
    await trx.from('product_variants').where('shop_id', shop.shopId).delete()
    await trx.from('products').where('shop_id', shop.shopId).delete()
    await trx.from('shop_memberships').where('shop_id', shop.shopId).delete()
    await trx.from('shop_agreements').where('shop_id', shop.shopId).delete()
    await trx.from('shops').where('id', shop.shopId).delete()
    await trx.from('sessions').where('user_id', shop.ownerId).delete()
    await trx.from('users').where('id', shop.ownerId).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-CAT-010 listShopProducts in change order', (group) => {
  group.each.teardown(cleanUp)

  test('T-CAT-010 the latest change comes first, across cursor pages', async ({ assert }) => {
    const shop = await createOwnerShop()
    made = shop
    const ids: Record<string, string> = {}
    for (const title of ['Alpha tee', 'Beta tee', 'Gamma hoodie']) {
      const product = await ProductFactory.merge({ shopId: shop.shopId, title }).create()
      ids[title] = product.id
    }
    // Alpha, created first, changes last.
    await db.from('products').where('id', ids['Alpha tee']).update({ title: 'Alpha tee, washed' })
    const owner = await signIn(shop.ownerId)
    const path = `/api/v1/seller/shops/${shop.slug}/products`
    const first = await send(owner, 'GET', `${path}?limit=2`)
    assert.equal(first.status, 200, first.text)
    assert.deepEqual(
      first.body.data.map((item: { id: string }) => item.id),
      [ids['Alpha tee'], ids['Gamma hoodie']]
    )
    const cursor = encodeURIComponent(first.body.meta.next_cursor)
    const second = await send(owner, 'GET', `${path}?limit=2&cursor=${cursor}`)
    assert.deepEqual(
      second.body.data.map((item: { id: string }) => item.id),
      [ids['Beta tee']]
    )
    assert.isNull(second.body.meta.next_cursor)
  })
})
