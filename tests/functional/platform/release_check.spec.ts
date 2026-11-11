import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import ReleaseCheck from '../../../commands/release_check.js'

/*
 * `node ace release:check` (docs/09 §9.2, docs/11 §5.4):
 * - T-OPS-023: a user whose email is in a `.invalid` domain, other than an
 *   anonymisation placeholder, or is the prototype's `demo@dripnepal.com`,
 *   fails the release, and the output names no address.
 * The pending-migration and invalid-index checks (T-OPS-013, T-OPS-014)
 * commit what they need and are in tests/concurrency/platform/release_check.spec.ts.
 * Rows inserted here are rolled back with the suite's global transaction,
 * which the command's default connection shares.
 */

async function releaseCheck() {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  const command = await ace.create(ReleaseCheck, [])
  await command.exec()
  return command
}

const output = (command: ReleaseCheck) =>
  command.logger
    .getLogs()
    .map((log) => log.message)
    .join('\n')

async function insertUserWithEmail(email: string) {
  await db.table('users').insert({ email, full_name: 'Seed User', password_hash: 'x' })
}

test.group('T-OPS-023 release check: no known seed user', () => {
  test('T-OPS-023 a migrated database with only reference data passes every check', async ({
    assert,
  }) => {
    const command = await releaseCheck()
    command.assertSucceeded()
    for (const id of ['T-OPS-013', 'T-OPS-014', 'T-OPS-023']) assert.include(output(command), id)
  })

  test('T-OPS-023 a seed user fails the release without printing its address: {email}')
    .with([
      { email: 'vendor-1@dev.dripnepal.invalid' },
      { email: 'someone@example.invalid' },
      { email: 'demo@dripnepal.com' },
    ])
    .run(async ({ assert }, { email }) => {
      await insertUserWithEmail(email)

      const command = await releaseCheck()

      command.assertFailed()
      assert.include(output(command), 'T-OPS-023 no known seed user: 1 failing')
      assert.notInclude(output(command), email.split('@')[0])
    })

  test('T-OPS-023 an anonymisation placeholder passes', async () => {
    const id = randomUUID()
    await db.table('users').insert({
      id,
      email: `deleted-${id}@anonymized.invalid`,
      status: 'anonymized',
      anonymized_at: new Date(),
    })

    const command = await releaseCheck()

    command.assertSucceeded()
  })
})
