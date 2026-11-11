import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { JOB_SCHEMA, createJobBoss, setJobBoss } from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import PlatformCreateAdmin from '../../../commands/platform_create_admin.js'

/*
 * T-OPS-019, the concurrent case (docs/09 §9.1 "Concurrency"): two runs
 * started at the same moment on a database with no admin, with different
 * emails, leave exactly one unrevoked `platform_admin`; one run commits and
 * the other exits 1. On an empty database there is no admin row to lock,
 * so only the transaction-scoped advisory lock serialises them.
 *
 * The runs commit for real, so the test deletes what they wrote, as the
 * migrator, with the retention exemption for the audit rows (docs/10 §3.3).
 * Both runs use one pg-boss instance that the test starts, as the worker
 * process's provider will.
 */

const EMAILS = ['race.one@example.com', 'race.two@example.com']

async function cleanUp() {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    const users = await trx.from('users').whereIn('email', EMAILS).select('id')
    const ids = users.map((user) => user.id as string)
    if (ids.length > 0) {
      await trx.rawQuery(
        `DELETE FROM ${JOB_SCHEMA}.job WHERE name = 'notifications.dispatch'
            AND data->>'user_token_id' IN (SELECT id::text FROM user_tokens WHERE user_id = ANY(?::uuid[]))`,
        [ids]
      )
      await trx.from('user_tokens').whereIn('user_id', ids).delete()
      await trx.from('platform_staff').whereIn('user_id', ids).delete()
      await trx.from('audit_logs').whereIn('subject_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-OPS-019 platform:create-admin under concurrency', (group) => {
  group.setup(async () => {
    const boss = createJobBoss(
      {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD').release(),
        database: env.get('DB_DATABASE'),
      },
      'web'
    )
    await boss.start()
    setJobBoss(boss)
    return async () => {
      setJobBoss(null)
      await boss.stop({ graceful: false, close: true })
    }
  })
  group.each.setup(cleanUp)
  group.each.teardown(cleanUp)

  test('T-OPS-019 two runs at the same moment leave exactly one platform_admin', async ({
    assert,
  }) => {
    const admins = await db
      .from('platform_staff')
      .where({ role: 'platform_admin' })
      .whereNull('revoked_at')
      .count('* as n')
    assert.equal(Number(admins[0].n), 0, 'the test starts with no admin')

    const ace = await app.container.make('ace')
    ace.ui.switchMode('raw')
    const runs = await Promise.all(
      EMAILS.map((email) =>
        ace.create(PlatformCreateAdmin, [`--email=${email}`, '--full-name=Race'])
      )
    )
    await Promise.all(runs.map((run) => run.exec()))

    assert.sameMembers(
      runs.map((run) => run.exitCode ?? 0),
      [0, 1]
    )
    const after = await db
      .from('platform_staff')
      .where({ role: 'platform_admin' })
      .whereNull('revoked_at')
      .select('user_id')
    assert.lengthOf(after, 1)
    // The run that lost wrote nothing: one user, its two tokens and its audit row.
    const users = await db.from('users').whereIn('email', EMAILS).select('id')
    assert.lengthOf(users, 1)
    assert.equal(users[0].id, after[0].user_id)
    const audits = await db
      .from('audit_logs')
      .where('action', 'platform_staff.bootstrap')
      .count('* as n')
    assert.equal(Number(audits[0].n), 1)
  }).timeout(30_000)
})
