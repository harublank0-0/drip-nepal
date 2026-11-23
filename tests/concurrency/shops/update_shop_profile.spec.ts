import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { send, signIn } from '#tests/support/courier_http'
import { forgetKeys } from '#tests/support/identity'
import { addMember, createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-SEC-011, the `shop_profile_update` limiter of docs/06 §9.1 (proposed,
 * R1-S part 1b), where real commits matter: the limiter store writes
 * `rate_limits` on its own connection (docs/10 §3.3). The API limits
 * middleware charges it on every `updateShopProfile` call by a signed-in
 * user, before the route's middleware and every check (round-2 review):
 * - accepted and refused calls count alike: after 10 saves and 10 calls
 *   refused with 428, the 21st call in the hour gets 429 and writes nothing,
 *   so neither edits nor a loop of bad requests go unbounded;
 * - a role the permission refuses (403) is charged too, and once its window
 *   is used up it gets 429 before the permission check.
 * Windows are used up with the limiter's `set` where the count is not the
 * point. The shop, its edits and the sessions commit for real, so the test
 * deletes what it wrote, as the migrator, with the retention exemption for
 * the append-only agreement and audit rows, and the users' limiter keys.
 */

let made: { shop: OwnerShop; userIds: string[] } | null = null

async function cleanUp() {
  if (!made) return
  const { shop, userIds } = made
  for (const id of userIds) await forgetKeys('shop_profile_update', id)
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx.from('audit_logs').where('shop_id', shop.shopId).delete()
    await trx.from('shop_memberships').where('shop_id', shop.shopId).delete()
    await trx.from('shop_agreements').where('shop_id', shop.shopId).delete()
    await trx.from('shops').where('id', shop.shopId).delete()
    await trx.from('sessions').whereIn('user_id', userIds).delete()
    await trx.from('users').whereIn('id', userIds).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
  made = null
}

const shopPath = (slug: string) => `/api/v1/seller/shops/${slug}`
const audits = (shopId: string) =>
  db.from('audit_logs').where({ action: 'shop.profile_update', shop_id: shopId })

test.group('T-SEC-011 shop_profile_update', (group) => {
  group.each.teardown(cleanUp)

  test('T-SEC-011 saves and refused calls count alike: the 21st updateShopProfile in an hour gets 429 and writes nothing', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    made = { shop, userIds: [shop.ownerId] }
    const browser = await signIn(shop.ownerId)
    for (let n = 1; n <= 10; n++) {
      const saved = await send(
        browser,
        'PATCH',
        shopPath(shop.slug),
        { description: `Edit ${n}` },
        { 'If-Match': `"${n}"` }
      )
      assert.equal(saved.status, 200, saved.text)
      // Refused before the action: no If-Match.
      const refused = await send(browser, 'PATCH', shopPath(shop.slug), { description: 'No.' })
      assert.equal(refused.status, 428, refused.text)
    }
    assert.lengthOf(await audits(shop.shopId), 10)

    const limited = await send(
      browser,
      'PATCH',
      shopPath(shop.slug),
      { description: 'Not saved' },
      { 'If-Match': '"11"' }
    )
    assert.equal(limited.status, 429, limited.text)
    assert.equal(limited.body.code, 'RATE_LIMITED')
    assert.lengthOf(await audits(shop.shopId), 10)
    const row = await db.from('shops').where('id', shop.shopId).firstOrFail()
    assert.equal(row.version, 11)
    assert.equal(row.description, 'Edit 10')
  }).timeout(60_000)

  test('T-SEC-011 a call the permission refuses takes a point, and past the limit gets 429 first', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    const viewerId = await addMember(shop.shopId, 'viewer')
    made = { shop, userIds: [shop.ownerId, viewerId] }
    const browser = await signIn(viewerId)
    const key = rateLimitKey('shop_profile_update', viewerId)
    await rateLimiter('shop_profile_update').set(key, 19, '1 hour')

    const forbidden = await send(
      browser,
      'PATCH',
      shopPath(shop.slug),
      { description: 'Not mine to change' },
      { 'If-Match': '"1"' }
    )
    assert.equal(forbidden.status, 403, forbidden.text)
    const limited = await send(
      browser,
      'PATCH',
      shopPath(shop.slug),
      { description: 'Not mine to change' },
      { 'If-Match': '"1"' }
    )
    assert.equal(limited.status, 429, limited.text)
    assert.equal(limited.body.code, 'RATE_LIMITED')
  }).timeout(30_000)
})
