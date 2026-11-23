import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import PlatformCreateShop, {
  GRIEVANCE_NAME_PROMPT,
  GRIEVANCE_PHONE_PROMPT,
} from '../../../commands/platform_create_shop.js'

/*
 * T-SHOP-007, the concurrent case (docs/09 §9.8 "Concurrency"): two runs
 * for the same owner started at the same moment, with different slugs,
 * leave exactly one shop; one run commits and the other exits 1 having
 * written nothing. The advisory lock and the owner's row lock serialise
 * them, so the second finds the first's shop.
 *
 * The runs commit for real, so the test deletes what they wrote, as the
 * migrator, with the retention exemption for the append-only agreement and
 * audit rows (docs/10 §3.3).
 */

let owner: { id: string; email: string } | null = null

async function cleanUp() {
  if (!owner) return
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    const shops = await trx.from('shops').where('owner_user_id', owner.id).select('id')
    const ids = shops.map((shop) => shop.id as string)
    if (ids.length > 0) {
      await trx.from('audit_logs').whereIn('shop_id', ids).delete()
      await trx.from('shop_agreements').whereIn('shop_id', ids).delete()
      await trx.from('shops').whereIn('id', ids).delete()
    }
    await trx.from('users').where('id', owner.id).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
  owner = null
}

test.group('T-SHOP-007 platform:create-shop under concurrency', (group) => {
  group.each.teardown(cleanUp)

  test('T-SHOP-007 two runs for one owner at the same moment leave exactly one shop', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    owner = { id: user.id, email: user.email }
    const stamp = Date.now().toString(36)

    const ace = await app.container.make('ace')
    ace.ui.switchMode('raw')
    const runs = await Promise.all(
      ['one', 'two'].map((suffix) =>
        ace.create(PlatformCreateShop, [
          `--owner=${user.email}`,
          `--slug=race-${suffix}-${stamp}`,
          '--name=Race Shop',
          `--contact-email=race-${suffix}-${stamp}@example.com`,
          '--contact-phone=9800000001',
          '--business-type=individual',
          '--return-policy=Returns within 7 days.',
        ])
      )
    )
    for (const run of runs) {
      run.interactiveTerminal = false
      run.prompt.trap(GRIEVANCE_NAME_PROMPT).replyWith('Synthetic Grievance Officer')
      run.prompt.trap(GRIEVANCE_PHONE_PROMPT).replyWith('9800000042')
    }
    await Promise.all(runs.map((run) => run.exec()))

    assert.sameMembers(
      runs.map((run) => run.exitCode ?? 0),
      [0, 1]
    )
    const shops = await db.from('shops').where('owner_user_id', user.id).select('id')
    assert.lengthOf(shops, 1)
    // The run that lost wrote nothing: one agreement row and one audit row in all.
    const agreements = await db
      .from('shop_agreements')
      .where('shop_id', shops[0].id)
      .count('* as n')
    assert.equal(Number(agreements[0].n), 1)
    const audits = await db
      .from('audit_logs')
      .where({ action: 'shop.bootstrap', shop_id: shops[0].id })
      .count('* as n')
    assert.equal(Number(audits[0].n), 1)
  }).timeout(30_000)
})
