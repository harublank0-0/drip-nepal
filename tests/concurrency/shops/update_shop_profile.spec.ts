import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { updateShopProfile } from '#modules/shops/actions/update_shop_profile'
import { sellerShopJson } from '#transformers/seller/shop_transformer'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { forgetKeys } from '#tests/support/identity'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-SEC-011, the `shop_profile_update` limiter of docs/06 §9.1 (proposed,
 * R1-S part 1b), where real commits matter: the limiter store writes
 * `rate_limits` on its own connection (docs/10 §3.3). The 21st
 * `updateShopProfile` of one user in an hour gets 429 and writes nothing,
 * so repeated edits cannot grow the insert-only `audit_logs` without bound.
 *
 * The shop and its edits commit for real, so the test deletes what it
 * wrote, as the migrator, with the retention exemption for the append-only
 * agreement and audit rows, and the user's limiter key.
 */

let made: OwnerShop | null = null

async function cleanUp() {
  if (!made) return
  await forgetKeys('shop_profile_update', made.ownerId)
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx.from('audit_logs').where('shop_id', made.shopId).delete()
    await trx.from('shop_agreements').where('shop_id', made.shopId).delete()
    await trx.from('shops').where('id', made.shopId).delete()
    await trx.from('users').where('id', made.ownerId).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
  made = null
}

test.group('T-SEC-011 shop_profile_update', (group) => {
  group.each.teardown(cleanUp)

  test('T-SEC-011 the 21st updateShopProfile of one user in an hour gets 429 and writes nothing', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    made = shop
    const context = {
      id: shop.shopId,
      slug: shop.slug,
      name: shop.name,
      status: 'active',
      suspensionMode: null,
      actor: 'owner' as const,
      viaRedirect: false,
    }
    const edit = (version: number, description: string) =>
      updateShopProfile(
        { shop: context, expectedVersion: version, changes: { description } },
        {
          actor: {
            type: 'shop_member',
            userId: shop.ownerId,
            role: `shop:${shop.shopId}:owner`,
            requestId: null,
          },
          present: (row) => sellerShopJson(row, 'owner'),
        }
      )
    for (let n = 0; n < 20; n++) await edit(n + 1, `Edit ${n}`)
    const audits = () =>
      db.from('audit_logs').where({ action: 'shop.profile_update', shop_id: shop.shopId })
    assert.lengthOf(await audits(), 20)

    const refused = await edit(21, 'Not saved').then(
      () => null,
      (error) => error
    )
    assert.instanceOf(refused, limiterErrors.E_TOO_MANY_REQUESTS)
    assert.lengthOf(await audits(), 20)
    const row = await db.from('shops').where('id', shop.shopId).firstOrFail()
    assert.equal(row.version, 21)
    assert.equal(row.description, 'Edit 19')
  }).timeout(30_000)
})
