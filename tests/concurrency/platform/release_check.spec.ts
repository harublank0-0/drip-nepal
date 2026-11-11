import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import ReleaseCheck from '../../../commands/release_check.js'

/*
 * `node ace release:check` as the release step runs it, on the migrator's
 * connection (docs/11 §6.1):
 * - T-OPS-013: a migration file with no `adonis_schema` row is pending, and
 *   a row whose file is gone is corrupt; either fails the release;
 * - T-OPS-014: an index left invalid by a failed `CREATE INDEX
 *   CONCURRENTLY` fails the release.
 * Both conditions need committed changes (an index build that runs outside
 * a transaction, a row of the migration table), so the tests are here and
 * restore what they changed (docs/10 §3.3).
 */

const TABLE = 't_ops_014_probe'

async function releaseCheck() {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  const command = await ace.create(ReleaseCheck, [`--connection=${MIGRATOR_CONNECTION}`])
  await command.exec()
  return command
}

const output = (command: ReleaseCheck) =>
  command.logger
    .getLogs()
    .map((log) => log.message)
    .join('\n')

test.group('T-OPS-013 T-OPS-014 release checks on the migrator connection', (group) => {
  group.each.teardown(async () => {
    await db.connection(MIGRATOR_CONNECTION).rawQuery(`DROP TABLE IF EXISTS ${TABLE}`)
  })

  test('T-OPS-013 a pending migration fails the release', async ({ assert }) => {
    const migrator = db.connection(MIGRATOR_CONNECTION)
    const last = await migrator.from('adonis_schema').orderBy('id', 'desc').firstOrFail()
    await migrator.from('adonis_schema').where('id', last.id).delete()
    try {
      const command = await releaseCheck()
      command.assertFailed()
      assert.include(output(command), 'T-OPS-013 no pending migration: 1 failing')
    } finally {
      await migrator.table('adonis_schema').insert(last)
    }
    const restored = await releaseCheck()
    restored.assertSucceeded()
  })

  test('T-OPS-013 an applied migration whose file is gone fails the release', async ({
    assert,
  }) => {
    const migrator = db.connection(MIGRATOR_CONNECTION)
    const [row] = await migrator
      .table('adonis_schema')
      .insert({ name: 'database/migrations/1700000000000_t_ops_013_missing', batch: 1 })
      .returning('id')
    try {
      const command = await releaseCheck()
      command.assertFailed()
      assert.include(output(command), 'T-OPS-013 no pending migration: 1 failing')
    } finally {
      await migrator.from('adonis_schema').where('id', row.id).delete()
    }
  })

  test('T-OPS-014 an index left invalid by a failed concurrent build fails the release', async ({
    assert,
  }) => {
    const migrator = db.connection(MIGRATOR_CONNECTION)
    await migrator.rawQuery(`CREATE TABLE ${TABLE} (n int)`)
    await migrator.rawQuery(`INSERT INTO ${TABLE} (n) VALUES (1), (1)`)
    // A unique build over duplicates fails and leaves the index behind, invalid.
    await assert.rejects(() =>
      migrator.rawQuery(`CREATE UNIQUE INDEX CONCURRENTLY ${TABLE}_n_key ON ${TABLE} (n)`)
    )

    const command = await releaseCheck()

    command.assertFailed()
    assert.include(output(command), 'T-OPS-014 no invalid index: 1 failing')
  })
})
