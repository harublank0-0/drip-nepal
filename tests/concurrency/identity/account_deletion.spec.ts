import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { requestAccountDeletion } from '#modules/identity/actions/request_account_deletion'
import { JOB_SCHEMA } from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { countingScrypt, deletionRequestedJobsFor, forgetReauth } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'

/*
 * The deletion request where real commits matter (docs/10 §3.3; M1 part
 * 6a). The action is called directly; every call commits on its own pool
 * connection, and the limiter store commits on its own.
 * - T-IAM-110: the only two active platform admins ask at the same moment;
 *   under the lock on the admin rows one closes the account and the other
 *   gets 409 `CONFLICT`, so an active admin remains (docs/04a §5.4, docs/07
 *   §3.12). Three rounds, fresh admins each.
 * - T-IAM-008: two requests of one account at once close it once, write
 *   one audit row and queue one email; the other is refused.
 * - T-SEC-011: the sixth wrong password in 15 minutes gets 429 without a
 *   hash, and a right one too while the window holds; the account stays
 *   open.
 * Each test uses fresh emails under its own prefix, then deletes its
 * users, staff rows, jobs, audit rows and sessions, as the migrator, with
 * the retention exemption for the audit rows, and its `reauth` keys.
 */

const PREFIX = 'conc-deletion-'

const newEmail = (label: string) => `${PREFIX}${label}-${randomUUID()}@example.com`

async function account(label: string) {
  const user = await UserFactory.merge({ email: newEmail(label) }).create()
  await user.refresh()
  return user
}

const context = { requestId: null, ipHash: null }

function ask(user: { id: string; securityStamp: string }, password = FACTORY_PASSWORD) {
  return requestAccountDeletion(
    user.id,
    { password, reason: null, sessionStamp: user.securityStamp },
    context
  )
}

async function refusal(call: () => Promise<unknown>) {
  return call().then(
    () => null,
    (error) => error
  )
}

async function cleanUp() {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    const users = await trx.from('users').where('email', 'like', `${PREFIX}%`).select('id')
    const ids = users.map((user) => user.id as string)
    if (ids.length > 0) {
      await trx.rawQuery(
        `DELETE FROM ${JOB_SCHEMA}.job
          WHERE name IN ('notifications.dispatch', 'identity.revoke_sessions')
            AND data->>'user_id' = ANY(?::text[])`,
        [ids]
      )
      await trx.from('sessions').whereIn('user_id', ids).delete()
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

// Active platform admins whose account is `active`, outside this file's accounts.
async function otherActiveAdmins() {
  const rows = await db
    .from('platform_staff')
    .join('users', 'users.id', 'platform_staff.user_id')
    .where('platform_staff.role', 'platform_admin')
    .whereNull('platform_staff.revoked_at')
    .where('users.status', 'active')
    .whereRaw('users.email::text NOT LIKE ?', [`${PREFIX}%`])
    .select('platform_staff.user_id')
  return rows.length
}

test.group('T-IAM-110 the last active admin under concurrent deletion requests', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-IAM-110 the only two active admins ask at once: one closes, the other gets 409 [docs/04a §5.4]', async ({
    assert,
  }) => {
    assert.equal(await otherActiveAdmins(), 0, 'the test starts with no other active admin')
    for (let round = 0; round < 3; round++) {
      const first = await account(`admin-a-${round}`)
      const second = await account(`admin-b-${round}`)
      await db.table('platform_staff').insert([
        { user_id: first.id, role: 'platform_admin' },
        { user_id: second.id, role: 'platform_admin' },
      ])
      try {
        const results = await Promise.allSettled([ask(first), ask(second)])
        const closed = results.filter((result) => result.status === 'fulfilled')
        const refused = results.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : []
        )
        assert.lengthOf(closed, 1, `round ${round}`)
        assert.lengthOf(refused, 1, `round ${round}`)
        // Any other error (a deadlock, a constraint) fails the test.
        assert.instanceOf(refused[0], DomainError)
        assert.equal((refused[0] as DomainError).problemCode, 'CONFLICT')

        const statuses = await db
          .from('users')
          .whereIn('id', [first.id, second.id])
          .select('status')
        assert.sameMembers(
          statuses.map((row) => row.status),
          ['active', 'deactivated']
        )
        assert.equal(await otherActiveAdmins(), 0)
      } finally {
        await forgetReauth(first.id)
        await forgetReauth(second.id)
      }
      // The next round starts with no active admin from this one.
      await db
        .from('platform_staff')
        .whereIn('user_id', [first.id, second.id])
        .update({ revoked_at: db.raw('now()'), revoked_by: first.id })
    }
  }).timeout(60_000)
})

test.group('T-IAM-008 one account, two requests at once', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-IAM-008 two requests of one account at once close it once, with one row and one email', async ({
    assert,
  }) => {
    const user = await account('twice')
    try {
      const results = await Promise.allSettled([ask(user), ask(user)])
      const closed = results.filter((result) => result.status === 'fulfilled')
      const refused = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      )
      assert.lengthOf(closed, 1)
      assert.lengthOf(refused, 1)
      assert.instanceOf(refused[0], DomainError)
      assert.include(['ACCOUNT_SUSPENDED', 'UNAUTHENTICATED'], refused[0].problemCode)

      const row = await db.from('users').where('id', user.id).firstOrFail()
      assert.equal(row.status, 'deactivated')
      const audits = await db
        .from('audit_logs')
        .where({ action: 'user.deletion_request', subject_id: user.id })
      assert.lengthOf(audits, 1)
      assert.lengthOf(await deletionRequestedJobsFor(user.id), 1)
    } finally {
      await forgetReauth(user.id)
    }
  }).timeout(30_000)
})

test.group('T-SEC-011 password re-entry on requestAccountDeletion', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-SEC-011 the sixth wrong password in 15 minutes gets 429 without hashing, a right one too [TM-08]', async ({
    assert,
  }) => {
    const user = await account('reauth')
    try {
      for (let n = 0; n < 5; n++) {
        const error = await refusal(() => ask(user, `${FACTORY_PASSWORD}x`))
        assert.instanceOf(error, DomainError)
        assert.equal((error as DomainError).problemCode, 'VALIDATION_FAILED')
      }
      const {
        result: sixth,
        make,
        verify,
      } = await countingScrypt(() => refusal(() => ask(user, `${FACTORY_PASSWORD}x`)))
      assert.instanceOf(sixth, limiterErrors.E_TOO_MANY_REQUESTS)
      assert.deepEqual({ make, verify }, { make: 0, verify: 0 })

      const right = await refusal(() => ask(user))
      assert.instanceOf(right, limiterErrors.E_TOO_MANY_REQUESTS)
      const row = await db.from('users').where('id', user.id).firstOrFail()
      assert.equal(row.status, 'active')
      assert.isNull(row.deletion_requested_at)
    } finally {
      await forgetReauth(user.id)
    }
  }).timeout(30_000)
})
