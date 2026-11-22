import { randomBytes, randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { toProblem } from '#exceptions/to_problem'
import { changePassword } from '#modules/identity/actions/change_password'
import { confirmPassword } from '#modules/identity/actions/confirm_password'
import { requestPasswordReset } from '#modules/identity/actions/request_password_reset'
import { resetPassword } from '#modules/identity/actions/reset_password'
import { JOB_SCHEMA } from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import {
  countingScrypt,
  forgetKeys,
  forgetLogin,
  forgetPasswordReset,
  forgetReauth,
  forgetResetToken,
  liveToken,
  randomIPv4,
  rawTokenOf,
  revokeJobsFor,
  sessionsRevokedJobsFor,
} from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'

/*
 * Password reset and change where real commits matter (docs/10 §3.3; M1
 * part 4). The actions are called directly; every call commits on its own
 * pool connection, and the limiter store commits on its own.
 * - T-IAM-005: the fourth reset request for one email in an hour gets 429
 *   `RATE_LIMITED` for a known and an unknown email alike, and the
 *   eleventh from one client network too (`pwreset_email`, `pwreset_ip`).
 * - T-IAM-005: requests carrying one live reset token at once reach the
 *   hasher at most 5 times (`pwreset_token`, proposed).
 * - T-IAM-105: two concurrent reset requests for one account leave exactly
 *   one live token, and concurrent redemptions of one reset token succeed
 *   once.
 * - T-SEC-011: the sixth wrong current password in 15 minutes on
 *   `changePassword` gets 429 without hashing; the tenth in 24 h rotates
 *   the stamp and queues `identity.revoke_sessions` and the "sessions
 *   revoked" email, through `changePassword` and through `confirmPassword`
 *   (the courier operations' re-entry, as a shop member, on `password`).
 * Each test uses fresh emails under its own prefix and fresh client
 * networks, then deletes its users, tokens, jobs, audit rows and limiter
 * keys, as the migrator, with the retention exemption for the audit rows.
 */

const PREFIX = 'conc-pwreset-'
const NEW_PASSWORD = randomBytes(12).toString('base64url')

const newEmail = (label: string) => `${PREFIX}${label}-${randomUUID()}@example.com`

async function account(label: string) {
  const user = await UserFactory.merge({ email: newEmail(label) }).create()
  await user.refresh()
  return user
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
            AND (data->>'user_id' = ANY(?::text[])
              OR data->>'user_token_id' IN (
                SELECT id::text FROM user_tokens WHERE user_id = ANY(?::uuid[])))`,
        [ids, ids]
      )
      await trx.from('sessions').whereIn('user_id', ids).delete()
      await trx.from('user_tokens').whereIn('user_id', ids).delete()
      await trx.from('audit_logs').whereIn('subject_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-IAM-005 the reset request limiters', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-IAM-005 the fourth request for one email in an hour gets 429, for a known and an unknown email alike [AC-FR-IAM-004-3, AC-J18-01]', async ({
    assert,
  }) => {
    const known = await account('limit-known')
    const unknown = newEmail('limit-unknown')
    const used: [string, string][] = []
    try {
      for (const email of [known.email, unknown]) {
        // A new client network per request, so only the email limiter counts.
        for (let n = 0; n < 3; n++) {
          const ip = randomIPv4()
          used.push([email, ip])
          await requestPasswordReset(email, { ip, requestId: null })
        }
        const ip = randomIPv4()
        used.push([email, ip])
        const error = await refusal(() => requestPasswordReset(email, { ip, requestId: null }))
        assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS, email)
        const problem = toProblem(error, 'req-1')
        assert.equal(problem.status, 429)
        assert.equal(problem.code, 'RATE_LIMITED')
        assert.isAbove(problem.retry_after_seconds!, 0)
        assert.isAtMost(problem.retry_after_seconds!, 3600)
      }
      // Three accepted requests, three tokens, one live; the fourth issued nothing.
      const tokens = await db
        .from('user_tokens')
        .where({ user_id: known.id, purpose: 'password_reset' })
      assert.lengthOf(tokens, 3)
      assert.lengthOf(
        tokens.filter((token) => token.consumed_at === null),
        1
      )
    } finally {
      for (const [email, ip] of used) await forgetPasswordReset(email, ip)
    }
  }).timeout(30_000)

  test('T-IAM-005 the eleventh request from one client network in an hour gets 429 [AC-FR-IAM-004-3]', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const emails = Array.from({ length: 11 }, (_, n) => newEmail(`ip-${n}`))
    try {
      for (const email of emails.slice(0, 10)) {
        await requestPasswordReset(email, { ip, requestId: null })
      }
      const error = await refusal(() => requestPasswordReset(emails[10], { ip, requestId: null }))
      assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
    } finally {
      for (const email of emails) await forgetPasswordReset(email, ip)
    }
  }).timeout(30_000)
})

test.group('T-IAM-105 password reset races', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-IAM-105 two concurrent reset requests for one known email both succeed and leave exactly one live token', async ({
    assert,
  }) => {
    for (let round = 0; round < 3; round++) {
      const user = await account(`race-${round}`)
      const ips = [randomIPv4(), randomIPv4()]
      try {
        const results = await Promise.allSettled(
          ips.map((ip) => requestPasswordReset(user.email, { ip, requestId: null }))
        )
        // A hit on `user_tokens_live_key` here would mean the user-row lock was skipped.
        for (const result of results) {
          assert.equal(result.status, 'fulfilled', String((result as PromiseRejectedResult).reason))
        }
        const live = await db
          .from('user_tokens')
          .where({ user_id: user.id, purpose: 'password_reset' })
          .whereNull('consumed_at')
        assert.lengthOf(live, 1)
        assert.lengthOf(await db.from('user_tokens').where('user_id', user.id), 2)
      } finally {
        for (const ip of ips) await forgetPasswordReset(user.email, ip)
      }
    }
  }).timeout(60_000)

  test('T-IAM-105 five concurrent redemptions of one reset token succeed once; the others answer 422 on token [02 J-18 "Concurrency"]', async ({
    assert,
  }) => {
    const user = await account('redeem')
    const ip = randomIPv4()
    await requestPasswordReset(user.email, { ip, requestId: null })
    await forgetPasswordReset(user.email, ip)
    const live = await liveToken(user.id, 'password_reset')
    const token = await rawTokenOf(live.id, 'password_reset')

    try {
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, n) =>
          resetPassword(token, `${NEW_PASSWORD}-${n}`, { requestId: null, ipHash: null })
        )
      )
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      assert.lengthOf(fulfilled, 1)
      for (const result of results) {
        if (result.status === 'fulfilled') continue
        assert.instanceOf(result.reason, DomainError)
        const problem = toProblem(result.reason, 'req-1')
        assert.equal(problem.status, 422)
        assert.deepEqual(
          problem.errors?.map((item) => item.code),
          ['token_invalid']
        )
      }
      const audits = await db
        .from('audit_logs')
        .where({ action: 'auth.password_reset', subject_id: user.id })
      assert.lengthOf(audits, 1)
      assert.lengthOf(await revokeJobsFor(user.id), 1)
    } finally {
      await forgetResetToken(token)
    }
  }).timeout(30_000)

  test('T-IAM-005 eight requests carrying one live token at once reach the hasher at most five times [docs/06 §9.1 pwreset_token]', async ({
    assert,
  }) => {
    const user = await account('burst')
    const ip = randomIPv4()
    await requestPasswordReset(user.email, { ip, requestId: null })
    await forgetPasswordReset(user.email, ip)
    const live = await liveToken(user.id, 'password_reset')
    const token = await rawTokenOf(live.id, 'password_reset')
    try {
      const { result: results, make } = await countingScrypt(() =>
        Promise.allSettled(
          Array.from({ length: 8 }, (_, n) =>
            resetPassword(token, `${NEW_PASSWORD}-${n}`, { requestId: null, ipHash: null })
          )
        )
      )
      assert.isAtMost(make, 5)
      assert.lengthOf(
        results.filter((result) => result.status === 'fulfilled'),
        1
      )
      const statuses = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => toProblem(result.reason, 'req-1').status)
      for (const status of statuses) assert.oneOf(status, [422, 429])
      assert.isAtLeast(statuses.filter((status) => status === 429).length, 1)
    } finally {
      await forgetResetToken(token)
    }
  }).timeout(30_000)
})

test.group('T-SEC-011 password re-entry on changePassword', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-SEC-011 the sixth wrong current password in 15 minutes gets 429 without hashing [TM-08]', async ({
    assert,
  }) => {
    const user = await account('reauth-window')
    const ip = randomIPv4()
    const attempt = () =>
      changePassword(
        user.id,
        {
          currentPassword: `${FACTORY_PASSWORD}x`,
          newPassword: NEW_PASSWORD,
          sessionStamp: user.securityStamp,
        },
        { ip, requestId: null, ipHash: null }
      )
    try {
      for (let n = 0; n < 5; n++) {
        const error = await refusal(attempt)
        assert.instanceOf(error, DomainError)
        assert.equal(toProblem(error, 'req-1').status, 422)
      }
      const { result: sixth, make, verify } = await countingScrypt(() => refusal(attempt))
      assert.instanceOf(sixth, limiterErrors.E_TOO_MANY_REQUESTS)
      assert.deepEqual({ make, verify }, { make: 0, verify: 0 })
      // A right password is refused too while the window holds.
      const right = await refusal(() =>
        changePassword(
          user.id,
          {
            currentPassword: FACTORY_PASSWORD,
            newPassword: NEW_PASSWORD,
            sessionStamp: user.securityStamp,
          },
          { ip, requestId: null, ipHash: null }
        )
      )
      assert.instanceOf(right, limiterErrors.E_TOO_MANY_REQUESTS)
      const failed = await db
        .from('audit_logs')
        .where({ action: 'auth.reauth_failed', subject_id: user.id })
      assert.lengthOf(failed, 5)
      const fresh = await db.from('users').where('id', user.id).firstOrFail()
      assert.equal(fresh.security_stamp, user.securityStamp)
    } finally {
      await forgetReauth(user.id)
      await forgetLogin(user.email, ip)
    }
  }).timeout(60_000)

  test('T-SEC-011 the tenth wrong password in 24 hours rotates the stamp and queues identity.revoke_sessions [TM-08]', async ({
    assert,
  }) => {
    const user = await account('reauth-day')
    const ip = randomIPv4()
    const attempt = () =>
      changePassword(
        user.id,
        {
          currentPassword: `${FACTORY_PASSWORD}x`,
          newPassword: NEW_PASSWORD,
          sessionStamp: user.securityStamp,
        },
        { ip, requestId: null, ipHash: null }
      )
    try {
      for (let n = 0; n < 10; n++) {
        // A new 15-minute window after the fifth, so only the day key fills.
        if (n === 5) await forgetKeys('reauth_user', user.id)
        const error = await refusal(attempt)
        assert.instanceOf(error, DomainError, `attempt ${n + 1}`)
        const fresh = await db.from('users').where('id', user.id).firstOrFail()
        if (n < 9) assert.equal(fresh.security_stamp, user.securityStamp, `attempt ${n + 1}`)
        else assert.notEqual(fresh.security_stamp, user.securityStamp)
      }
      const jobs = await revokeJobsFor(user.id)
      assert.lengthOf(jobs, 1)
      assert.lengthOf(await sessionsRevokedJobsFor(user.id), 1)
      const [lockout] = await db
        .from('audit_logs')
        .where({ action: 'auth.reauth_failed', subject_id: user.id })
        .orderBy('id', 'desc')
        .limit(1)
      assert.deepEqual(lockout.changes, { changed: ['security_stamp'] })

      await forgetKeys('reauth_user', user.id)
      const eleventh = await refusal(attempt)
      assert.instanceOf(eleventh, limiterErrors.E_TOO_MANY_REQUESTS)
    } finally {
      await forgetReauth(user.id)
      await forgetLogin(user.email, ip)
    }
  }).timeout(60_000)

  test("T-SEC-011 confirmPassword, the courier operations' re-entry: a wrong password is 422 on password by a shop member, and the tenth in 24 hours locks out [TM-08, TM-32]", async ({
    assert,
  }) => {
    const user = await account('reauth-confirm')
    const wrong = () => confirmPassword(user.id, `${FACTORY_PASSWORD}x`, null)
    try {
      // A right password passes and gives its points back.
      await confirmPassword(user.id, FACTORY_PASSWORD, null)
      for (let n = 0; n < 10; n++) {
        if (n === 5) await forgetKeys('reauth_user', user.id)
        const error = await refusal(wrong)
        assert.instanceOf(error, DomainError, `attempt ${n + 1}`)
        assert.deepEqual(
          toProblem(error, 'req-1').errors?.map((item) => [item.field, item.code]),
          [['password', 'password_incorrect']]
        )
      }
      const failed = await db
        .from('audit_logs')
        .where({ action: 'auth.reauth_failed', subject_id: user.id })
        .orderBy('id', 'asc')
      assert.lengthOf(failed, 10)
      assert.include(failed[0], { actor_type: 'shop_member', actor_user_id: user.id })
      assert.deepEqual(failed[9].changes, { changed: ['security_stamp'] })
      const fresh = await db.from('users').where('id', user.id).firstOrFail()
      assert.notEqual(fresh.security_stamp, user.securityStamp)
      assert.lengthOf(await revokeJobsFor(user.id), 1)
      assert.lengthOf(await sessionsRevokedJobsFor(user.id), 1)

      await forgetKeys('reauth_user', user.id)
      const eleventh = await refusal(() => confirmPassword(user.id, FACTORY_PASSWORD, null))
      assert.instanceOf(eleventh, limiterErrors.E_TOO_MANY_REQUESTS)
    } finally {
      await forgetReauth(user.id)
    }
  }).timeout(60_000)
})
