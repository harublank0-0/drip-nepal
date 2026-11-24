import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import type { OwnerShop } from '#tests/support/shops'

/*
 * Helpers of the concurrency suite, whose tests commit for real (docs/10
 * §3.1): a wait for a request to block on a row lock, so a race does not
 * depend on timing, the race itself, and the removal of an owner's shop
 * with its catalog and stock after a test.
 */

/*
 * Until another backend of this database waits on a lock in a statement
 * that reads `relation` (at most 10 s), so an unrelated waiter, such as a
 * job worker, does not end the wait early.
 */
export async function waitForLockWaiter(relation = 'inventory_items') {
  for (let tries = 0; tries < 100; tries++) {
    const result = await db.rawQuery(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock' AND query LIKE ?`,
      [`%${relation}%`]
    )
    if (result.rows[0].waiting > 0) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`the request never waited on a lock in ${relation}`)
}

/*
 * The race of a request against another writer, whose transaction `trx`
 * already holds its locks: `write` makes the other writer's change, then
 * the request starts, and once it waits on `relation` the writer commits;
 * returns the request's answer. If anything fails first, `trx` rolls back
 * and the request is awaited, so no lock or open request outlives the test
 * and its clean-up cannot block.
 */
export async function commitWhileWaiting<T>(
  trx: TransactionClientContract,
  steps: {
    write: (trx: TransactionClientContract) => Promise<unknown>
    request: () => Promise<T>
    relation?: string
  }
): Promise<T> {
  let pending: Promise<T> | null = null
  try {
    await steps.write(trx)
    pending = steps.request()
    await waitForLockWaiter(steps.relation)
    await trx.commit()
  } catch (error) {
    if (!trx.isCompleted) await trx.rollback()
    await pending?.catch(() => undefined)
    throw error
  }
  return pending
}

/*
 * Deletes the shop of `createOwnerShop`, its products, variants, stock and
 * journal, its audit rows, and the owner with their sessions and
 * idempotency keys, as the migrator with the retention exemption for the
 * append-only rows. The `catalog.refresh_listing` jobs stay; they name rows
 * that no longer exist, which the handler treats as nothing to do.
 */
export async function purgeOwnerShop(shop: OwnerShop) {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  const products = () => trx.from('products').where('shop_id', shop.shopId).select('id')
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx.from('audit_logs').where('shop_id', shop.shopId).delete()
    await trx.from('inventory_movements').where('shop_id', shop.shopId).delete()
    await trx.from('inventory_items').where('shop_id', shop.shopId).delete()
    await trx.from('variant_option_values').whereIn('product_id', products()).delete()
    await trx.from('product_variants').where('shop_id', shop.shopId).delete()
    await trx.from('product_option_axes').whereIn('product_id', products()).delete()
    await trx.from('product_attribute_values').whereIn('product_id', products()).delete()
    await trx.from('products').where('shop_id', shop.shopId).delete()
    await trx.from('shop_memberships').where('shop_id', shop.shopId).delete()
    await trx.from('shop_agreements').where('shop_id', shop.shopId).delete()
    await trx.from('shops').where('id', shop.shopId).delete()
    await trx.from('idempotency_keys').where('actor_scope', shop.ownerId).delete()
    await trx.from('sessions').where('user_id', shop.ownerId).delete()
    await trx.from('users').where('id', shop.ownerId).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}
