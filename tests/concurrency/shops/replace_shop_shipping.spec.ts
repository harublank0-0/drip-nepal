import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DomainError } from '#exceptions/domain_error'
import { replaceShopShipping } from '#modules/shops/actions/replace_shop_shipping'
import { updateShopProfile } from '#modules/shops/actions/update_shop_profile'
import type { Actor } from '#modules/platform/actor'
import type { SellerContext } from '#modules/shops/queries'
import { shopShippingJson } from '#transformers/seller/shipping_transformer'
import { sellerShopJson } from '#transformers/seller/shop_transformer'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-API-004 under concurrency, where real commits matter (docs/10 §3.3):
 * `replaceShopShipping` and `updateShopProfile` both lock the shop row and
 * compare `shops.version` (docs/06 §8; R1-S part 1c). Two saves sent with
 * the same `If-Match` never both land: exactly one commits, with one audit
 * row and the version moved by one, and the other answers 412
 * `VERSION_CONFLICT` and writes nothing, whether the other save is a
 * shipping save or a profile save. The actions are called directly, as
 * `seller_context` would hand them the shop. The shops, their rows and
 * their owners commit for real, so the test deletes them as the migrator,
 * with the retention exemption for the append-only agreement and audit rows.
 */
const ROUNDS = 5

let made: OwnerShop[] = []

async function cleanUp() {
  if (made.length === 0) return
  const shopIds = made.map((shop) => shop.shopId)
  const ownerIds = made.map((shop) => shop.ownerId)
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx.from('audit_logs').whereIn('shop_id', shopIds).delete()
    await trx.from('shop_delivery_coverage').whereIn('shop_id', shopIds).delete()
    await trx.from('shop_shipping_rates').whereIn('shop_id', shopIds).delete()
    await trx.from('shop_agreements').whereIn('shop_id', shopIds).delete()
    await trx.from('shops').whereIn('id', shopIds).delete()
    await trx.from('users').whereIn('id', ownerIds).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
  made = []
}

function contextOf(shop: OwnerShop): SellerContext {
  return {
    id: shop.shopId,
    slug: shop.slug,
    name: shop.name,
    status: 'active',
    suspensionMode: null,
    actor: 'owner',
    viaRedirect: false,
  }
}

const actorOf = (shop: OwnerShop): Actor => ({
  type: 'shop_member',
  userId: shop.ownerId,
  role: `shop:${shop.shopId}:owner`,
  requestId: null,
})

function saveShipping(shop: OwnerShop, coverage: string[]) {
  return replaceShopShipping(
    {
      shop: contextOf(shop),
      expectedVersion: 1,
      changes: {
        coverage,
        rates: [
          { zoneCode: 'ktm_valley', feeMinor: 10000, estMinDays: 0, estMaxDays: 1 },
          { zoneCode: 'outside_valley', feeMinor: 15000, estMinDays: 2, estMaxDays: 5 },
        ],
      },
    },
    { actor: actorOf(shop), present: shopShippingJson }
  )
}

const conflicts = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(
    (result) =>
      result.status === 'rejected' &&
      result.reason instanceof DomainError &&
      result.reason.problemCode === 'VERSION_CONFLICT'
  ).length

const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results.map((result) => (result.status === 'rejected' ? String(result.reason) : 'ok')).join('; ')

test.group('T-API-004 concurrent saves on one shops.version', (group) => {
  group.each.setup(() => () => cleanUp())

  test('T-API-004 two shipping saves on one version: one commits, the other answers 412', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createOwnerShop()
      made.push(shop)
      const results = await Promise.allSettled([
        saveShipping(shop, ['306']),
        saveShipping(shop, ['405', '306']),
      ])
      assert.equal(
        results.filter((r) => r.status === 'fulfilled').length,
        1,
        `round ${round}: ${reasons(results)}`
      )
      assert.equal(conflicts(results), 1, `round ${round}: ${reasons(results)}`)
      const row = await db.from('shops').where('id', shop.shopId).firstOrFail()
      assert.equal(row.version, 2, `round ${round}`)
      const audits = await db
        .from('audit_logs')
        .where({ action: 'shop.shipping_replace', shop_id: shop.shopId })
      assert.lengthOf(audits, 1, `round ${round}`)
    }
  }).timeout(60_000)

  test('T-API-004 a shipping save and a profile save on one version: one commits, the other answers 412', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createOwnerShop()
      made.push(shop)
      const results = await Promise.allSettled([
        saveShipping(shop, ['306']),
        updateShopProfile(
          {
            shop: contextOf(shop),
            expectedVersion: 1,
            changes: { description: `Round ${round}` },
          },
          { actor: actorOf(shop), present: (row) => sellerShopJson(row, 'owner') }
        ),
      ])
      assert.equal(
        results.filter((r) => r.status === 'fulfilled').length,
        1,
        `round ${round}: ${reasons(results)}`
      )
      assert.equal(conflicts(results), 1, `round ${round}: ${reasons(results)}`)
      const row = await db.from('shops').where('id', shop.shopId).firstOrFail()
      assert.equal(row.version, 2, `round ${round}`)
      const coverage = await db.from('shop_delivery_coverage').where('shop_id', shop.shopId)
      // The shipping rows exist exactly when the shipping save won.
      assert.equal(coverage.length === 1, results[0].status === 'fulfilled', `round ${round}`)
    }
  }).timeout(60_000)
})
