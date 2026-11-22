import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { toProblem } from '#exceptions/to_problem'
import { confirmEmail } from '#modules/identity/actions/confirm_email'
import { resendEmailVerification } from '#modules/identity/actions/resend_email_verification'
import { signUp, type SignUpCommand } from '#modules/identity/actions/sign_up'
import { JOB_SCHEMA } from '#modules/platform/jobs'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import {
  SIGN_UP_PASSWORD,
  countingHashes,
  dispatchJobsFor,
  forgetKeys,
  forgetSignUp,
  liveToken,
  randomIPv4,
  rawTokenOf,
} from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'

/*
 * Sign-up and email verification where real commits matter (docs/10 §3.3;
 * M1 part 2a). The actions are called directly; every call commits on its
 * own pool connection, and the limiter store commits on its own.
 * - T-IAM-001: the sixth sign-up from one client network in an hour gets
 *   429 `RATE_LIMITED` without hashing and writes nothing (`signup_ip`).
 * - T-IAM-002: the fourth resend of one user in an hour gets 429 and queues
 *   nothing (`verify_resend`).
 * - T-SEC-012: two sign-ups for one new email at once both succeed and
 *   leave one account.
 * - T-IAM-105: concurrent redemptions of one token redeem it once, and two
 *   concurrent resends leave exactly one live token.
 * Each test uses fresh emails under its own prefix and a fresh client
 * network, then deletes its users, tokens, jobs, audit rows and limiter
 * keys as the migrator, with the retention exemption for the audit rows.
 */

const PREFIX = 'conc-signup-'

const command = (email: string): SignUpCommand => ({
  email,
  password: SIGN_UP_PASSWORD,
  fullName: 'Sita Shrestha',
  phoneE164: null,
  marketingEmailConsent: false,
  marketingSmsConsent: false,
})

const newEmail = (label: string) => `${PREFIX}${label}-${randomUUID()}@example.com`
const context = (ip: string) => ({ ip, requestId: null, ipHash: null })

async function userId(email: string) {
  const user = await db.from('users').where('email', email).firstOrFail()
  return user.id as string
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
        `DELETE FROM ${JOB_SCHEMA}.job WHERE name = 'notifications.dispatch'
            AND (data->>'user_id' = ANY(?::text[])
              OR data->>'user_token_id' IN (
                SELECT id::text FROM user_tokens WHERE user_id = ANY(?::uuid[])))`,
        [ids, ids]
      )
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

test.group('T-IAM-001 and T-IAM-002 the sign-up limiters', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-IAM-001 the sixth sign-up from one client network in an hour gets 429 without a hash and writes nothing [AC-FR-IAM-001-3, AC-J04-02]', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    try {
      for (let n = 0; n < 5; n++) {
        await signUp(command(newEmail(`limit-${n}`)), context(ip))
      }
      const sixth = newEmail('limit-6')
      const { result: error, calls } = await countingHashes(() =>
        refusal(() => signUp(command(sixth), context(ip)))
      )
      assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
      assert.equal(calls, 0, 'a blocked network costs no hash')
      const problem = toProblem(error, 'req-1')
      assert.equal(problem.status, 429)
      assert.equal(problem.code, 'RATE_LIMITED')
      assert.isAbove(problem.retry_after_seconds!, 0)
      assert.isAtMost(problem.retry_after_seconds!, 3600)
      assert.isNull(await db.from('users').where('email', sixth).first())
    } finally {
      await forgetSignUp(ip)
    }
  }).timeout(30_000)

  test('T-IAM-002 the fourth resend of one user in an hour gets 429 and queues nothing [AC-FR-IAM-002-3, AC-J04-10]', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const email = newEmail('resend-limit')
    await signUp(command(email), context(ip))
    await forgetSignUp(ip)
    const id = await userId(email)
    try {
      for (let n = 0; n < 3; n++) {
        await resendEmailVerification(id, { requestId: null })
      }
      const before = await liveToken(id)
      const error = await refusal(() => resendEmailVerification(id, { requestId: null }))
      assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
      // One token job from the sign-up and one per accepted resend; the fourth queued nothing.
      assert.lengthOf(await dispatchJobsFor(id), 4)
      const after = await liveToken(id)
      assert.equal(after.id, before.id)
    } finally {
      await forgetKeys('verify_resend', id)
    }
  }).timeout(30_000)
})

test.group('T-SEC-012 and T-IAM-105 sign-up and verification races', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => cleanUp)

  test('T-SEC-012 two sign-ups for one new email at once both succeed and leave one account', async ({
    assert,
  }) => {
    for (let round = 0; round < 3; round++) {
      const email = newEmail(`race-${round}`)
      const ips = [randomIPv4(), randomIPv4()]
      try {
        const results = await Promise.allSettled(
          ips.map((ip) => signUp(command(email), context(ip)))
        )
        // A refusal or a 23505 here would tell the caller the address is taken.
        for (const result of results) {
          assert.equal(result.status, 'fulfilled', String((result as PromiseRejectedResult).reason))
        }
        const rows = await db.from('users').where('email', email)
        assert.lengthOf(rows, 1)
        assert.lengthOf(await db.from('user_tokens').where('user_id', rows[0].id), 1)
        const jobs = await dispatchJobsFor(rows[0].id)
        assert.sameMembers(
          jobs.map((job) => job.data.event),
          ['user_token.issued', 'user.signup_attempted']
        )
      } finally {
        for (const ip of ips) await forgetSignUp(ip)
      }
    }
  }).timeout(60_000)

  test('T-IAM-105 five concurrent redemptions of one token redeem it once and all answer active [AC-J04-06]', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const email = newEmail('redeem')
    await signUp(command(email), context(ip))
    await forgetSignUp(ip)
    const id = await userId(email)
    const live = await liveToken(id)
    const token = await rawTokenOf(live.id, 'email_verification')

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => confirmEmail(token, { requestId: null, ipHash: null }))
    )
    for (const result of results) {
      assert.deepEqual(result.status === 'fulfilled' ? result.value : result.reason, {
        status: 'active',
      })
    }
    const user = await db.from('users').where('id', id).firstOrFail()
    assert.equal(user.status, 'active')
    const consumed = await db.from('user_tokens').where('id', live.id).firstOrFail()
    assert.instanceOf(consumed.consumed_at, Date)
    const audits = await db
      .from('audit_logs')
      .where({ subject_type: 'user', subject_id: id, action: 'user.email_verify' })
    assert.lengthOf(audits, 1)
  }).timeout(30_000)

  test('T-IAM-105 two concurrent resends both succeed and leave exactly one live token', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const email = newEmail('resend-race')
    await signUp(command(email), context(ip))
    await forgetSignUp(ip)
    const id = await userId(email)
    try {
      const results = await Promise.allSettled([
        resendEmailVerification(id, { requestId: null }),
        resendEmailVerification(id, { requestId: null }),
      ])
      for (const result of results) {
        assert.equal(result.status, 'fulfilled', String((result as PromiseRejectedResult).reason))
      }
      const live = await db
        .from('user_tokens')
        .where({ user_id: id, purpose: 'email_verification' })
        .whereNull('consumed_at')
      assert.lengthOf(live, 1)
      assert.lengthOf(await db.from('user_tokens').where('user_id', id), 3)
    } finally {
      await forgetKeys('verify_resend', id)
    }
  }).timeout(30_000)
})
