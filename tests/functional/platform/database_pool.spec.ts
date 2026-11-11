import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { PostgreConfig } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import { poolLimits } from '#config/database'

/*
 * T-ARCH-035 (docs/09 §6.3): `DB_POOL_MAX` sets the pool,
 * and a one-off container run with `DB_POOL_MAX=1` (docs/11 §10.1, §14.6)
 * gets a pool Tarn accepts, whose minimum is not above its maximum. The
 * probe connection is a copy of the default one with that pool.
 */

const PROBE = 'pool_max_1_probe'

test.group('T-ARCH-035 database pool limits', (group) => {
  group.each.teardown(async () => {
    if (db.manager.has(PROBE)) await db.manager.close(PROBE, true)
  })

  test('T-ARCH-035 the default connection takes its pool from DB_POOL_MAX', ({ assert }) => {
    const config = db.manager.get(db.primaryConnectionName)!.config as PostgreConfig
    assert.deepEqual(config.pool, poolLimits(env.get('DB_POOL_MAX')))
  })

  test('T-ARCH-035 DB_POOL_MAX=1 gives a pool that connects', async ({ assert }) => {
    assert.deepEqual(poolLimits(1), { min: 1, max: 1 })
    const config = db.manager.get(db.primaryConnectionName)!.config as PostgreConfig
    db.manager.add(PROBE, { ...config, pool: poolLimits(1) })
    const result = await db.connection(PROBE).rawQuery('SELECT 1 AS one')
    assert.equal(result.rows[0].one, 1)
  })
})
