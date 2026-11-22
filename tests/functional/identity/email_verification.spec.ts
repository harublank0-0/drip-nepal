import { randomBytes } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { withTx } from '#modules/platform/tx'
import { signIn, statusOf } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import {
  CONFIRM_PATH,
  RESEND_PATH,
  SIGN_UP_PATH,
  dispatchJobsFor,
  forgetKeys,
  forgetSignUp,
  guest,
  liveToken,
  postJson,
  rawTokenOf,
  signUpBody,
  userByEmail,
  type Guest,
} from '#tests/support/identity'

/*
 * `confirmEmail` and `resendEmailVerification` over HTTP (docs/06 §13.3;
 * 01 FR-IAM-002; 02 J-04 steps 3–4; docs/07 §3.8, §3.12; M1 part 2a). Every
 * account is made by the real `signUp`, and every token is read from the
 * dispatch job its issuer queued.
 * - T-IAM-002: a valid link activates the account and consumes the token,
 *   and the same link again answers 200; an expired, replaced, unknown or
 *   malformed link answers 422 on `token` and changes nothing; a resend
 *   replaces the live token; a verified user's resend is refused, and a
 *   guest's needs a session.
 * - T-SEC-012: a token of another purpose sent to `confirmEmail` fails and
 *   stays unconsumed.
 * - T-API-002: an extra member on each of the three operations answers 422
 *   and changes nothing.
 * The resend limiter and concurrent redemption (T-IAM-105) are in
 * tests/concurrency/identity/sign_up.spec.ts.
 */

type Account = { userId: string; email: string; tokenId: string; token: string }

// An account made by `signUp`, with its live verification token.
async function signedUp(client: Guest, prefix: string): Promise<Account> {
  const body = signUpBody(prefix)
  const response = await postJson(client, SIGN_UP_PATH, body)
  if (response.status !== 202) throw new Error(`signUp answered ${response.status}`)
  const user = await userByEmail(body.email)
  const live = await liveToken(user.id)
  return {
    userId: user.id,
    email: body.email,
    tokenId: live.id,
    token: await rawTokenOf(live.id, 'email_verification'),
  }
}

const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()
const tokenRow = (tokenId: string) => db.from('user_tokens').where('id', tokenId).firstOrFail()

// Scalars read on their own, so no assertion reads a member of an await expression (lint).
async function userStatus(userId: string): Promise<string> {
  const user = await userRow(userId)
  return user.status
}
async function consumedAt(tokenId: string): Promise<Date | null> {
  const token = await tokenRow(tokenId)
  return token.consumed_at
}
const verifyAudits = (userId: string) =>
  db
    .from('audit_logs')
    .where({ subject_type: 'user', subject_id: userId, action: 'user.email_verify' })

test.group('T-IAM-002 email verification', (group) => {
  let client: Guest
  let resenders: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    resenders = []
    return async () => {
      await forgetSignUp(client.ip)
      for (const userId of resenders) await forgetKeys('verify_resend', userId)
    }
  })

  test('T-IAM-002 a valid link activates the account and consumes the token; the same link again answers 200 [AC-FR-IAM-002-1, AC-J04-06]', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-iam-002')
    // Anyone holding the link may use it: a fresh browser with no account.
    const holder = await guest(client.ip)
    const response = await postJson(holder, CONFIRM_PATH, { token: account.token })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: { status: 'active' } })

    const user = await userRow(account.userId)
    assert.equal(user.status, 'active')
    assert.instanceOf(user.email_verified_at, Date)
    const token = await tokenRow(account.tokenId)
    assert.instanceOf(token.consumed_at, Date)
    const audits = await verifyAudits(account.userId)
    assert.lengthOf(audits, 1)
    assert.include(audits[0], { actor_type: 'customer', actor_user_id: account.userId })
    assert.deepEqual(audits[0].changes, {
      status: { from: 'pending_verification', to: 'active' },
    })
    // Confirming signs nobody in (docs/07 TM-09).
    assert.lengthOf(await db.from('sessions').where('user_id', account.userId), 0)

    // A double click or a second tab: "already verified", no second write.
    const again = await postJson(holder, CONFIRM_PATH, { token: account.token })
    assert.equal(again.status, 200)
    assert.deepEqual(again.body, { data: { status: 'active' } })
    assert.lengthOf(await verifyAudits(account.userId), 1)
  })

  test(
    'T-IAM-002 an {name} link is refused with 422 on token and changes nothing [AC-FR-IAM-002-4, AC-J04-06]'
  )
    .with([
      { name: 'expired', kind: 'expired' as const },
      { name: 'unknown', kind: 'unknown' as const },
      { name: 'malformed', kind: 'malformed' as const },
    ])
    .run(async ({ assert }, { kind }) => {
      const account = await signedUp(client, `t-iam-002-${kind}`)
      if (kind === 'expired') {
        await db
          .from('user_tokens')
          .where('id', account.tokenId)
          .update({
            created_at: db.raw("now() - interval '2 days'"),
            expires_at: db.raw("now() - interval '1 day'"),
          })
      }
      const token = {
        expired: account.token,
        unknown: randomBytes(32).toString('base64url'),
        malformed: 'not a token',
      }[kind]

      const response = await postJson(client, CONFIRM_PATH, { token })
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(
        response.body.errors.map((item: { field: string; code: string }) => [
          item.field,
          item.code,
        ]),
        [['token', 'token_invalid']]
      )
      // No account data in the answer (AC-FR-IAM-002-4).
      assert.notInclude(response.text, account.email)
      assert.notInclude(response.text, account.userId)

      const user = await userRow(account.userId)
      assert.equal(user.status, 'pending_verification')
      assert.isNull(user.email_verified_at)
      assert.isNull(await consumedAt(account.tokenId))
      assert.lengthOf(await verifyAudits(account.userId), 0)
    })

  test('T-IAM-002 a resend replaces the live token: the old link stops working and the new one verifies [AC-FR-IAM-002-3]', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-iam-002-resend')
    resenders.push(account.userId)
    const browser = await signIn(account.userId)
    const signedIn: Guest = { browser, ip: client.ip }

    const response = await postJson(signedIn, RESEND_PATH, {})
    assert.equal(response.status, 202, response.text)
    assert.deepEqual(response.body, { data: { status: 'verification_email_sent' } })

    // At most one live token per purpose (docs/04a §5.2): the first is consumed.
    assert.instanceOf(await consumedAt(account.tokenId), Date)
    const live = await db
      .from('user_tokens')
      .where({ user_id: account.userId, purpose: 'email_verification' })
      .whereNull('consumed_at')
    assert.lengthOf(live, 1)
    const jobs = await dispatchJobsFor(account.userId)
    assert.lengthOf(jobs, 2)
    const fresh = jobs.find((job) => job.data.user_token_id === live[0].id)
    assert.isDefined(fresh)

    const old = await postJson(client, CONFIRM_PATH, { token: account.token })
    assert.equal(old.status, 422)
    assert.equal(await userStatus(account.userId), 'pending_verification')

    const newToken = await rawTokenOf(live[0].id, 'email_verification')
    const confirmed = await postJson(client, CONFIRM_PATH, { token: newToken })
    assert.equal(confirmed.status, 200, confirmed.text)
    assert.equal(await userStatus(account.userId), 'active')
  })

  test('T-IAM-002 a verified user is refused a resend with 403 and no token is issued', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-iam-002-verified')
    resenders.push(account.userId)
    assert.equal(await statusOf(postJson(client, CONFIRM_PATH, { token: account.token })), 200)
    const browser = await signIn(account.userId)

    const response = await postJson({ browser, ip: client.ip }, RESEND_PATH, {})
    assert.equal(response.status, 403, response.text)
    assert.equal(response.body.code, 'FORBIDDEN')
    assert.lengthOf(await db.from('user_tokens').where('user_id', account.userId), 1)
    assert.lengthOf(await dispatchJobsFor(account.userId), 1)
  })

  test('T-IAM-002 a resend without a session gets 401 UNAUTHENTICATED', async ({ assert }) => {
    const response = await postJson(client, RESEND_PATH, {})
    assert.equal(response.status, 401)
    assert.equal(response.body.code, 'UNAUTHENTICATED')
  })
})

test.group('T-SEC-012 token purposes on confirmEmail', (group) => {
  let client: Guest
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    return () => forgetSignUp(client.ip)
  })

  test('T-SEC-012 a password_reset token sent to confirmEmail fails and stays unconsumed', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-sec-012-purpose')
    const reset = await withTx((trx) => issueUserToken(trx, account.userId, 'password_reset'))
    const resetToken = await rawTokenOf(reset.id, 'password_reset')

    const response = await postJson(client, CONFIRM_PATH, { token: resetToken })
    assert.equal(response.status, 422, response.text)
    assert.equal(response.body.errors[0].code, 'token_invalid')
    assert.isNull(await consumedAt(reset.id))
    assert.equal(await userStatus(account.userId), 'pending_verification')
    // The verification link of the same account still works.
    assert.isNull(await consumedAt(account.tokenId))
  })
})

test.group('T-API-002 unknown members on the sign-up operations', (group) => {
  let client: Guest
  let resenders: string[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    resenders = []
    return async () => {
      await forgetSignUp(client.ip)
      for (const userId of resenders) await forgetKeys('verify_resend', userId)
    }
  })

  test('T-API-002 an extra member on signUp is refused with 422 and creates no user', async ({
    assert,
  }) => {
    const body = signUpBody('t-api-002', { referrer: 'friend' })
    const response = await postJson(client, SIGN_UP_PATH, body)
    assert.equal(response.status, 422)
    assert.equal(response.body.errors[0].field, 'referrer')
    assert.equal(response.body.errors[0].code, 'unknown_field')
    assert.isNull(await userByEmail(body.email))
  })

  test('T-API-002 an extra member on confirmEmail is refused with 422 and the token stays live', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-api-002-confirm')
    const response = await postJson(client, CONFIRM_PATH, {
      token: account.token,
      user_id: account.userId,
    })
    assert.equal(response.status, 422)
    assert.equal(response.body.errors[0].field, 'user_id')
    assert.equal(response.body.errors[0].code, 'unknown_field')
    assert.isNull(await consumedAt(account.tokenId))
    assert.equal(await userStatus(account.userId), 'pending_verification')
  })

  test('T-API-002 an extra member on resendEmailVerification is refused with 422 and issues nothing', async ({
    assert,
  }) => {
    const account = await signedUp(client, 't-api-002-resend')
    resenders.push(account.userId)
    const browser = await signIn(account.userId)
    const response = await postJson({ browser, ip: client.ip }, RESEND_PATH, {
      email: 'other@example.com',
    })
    assert.equal(response.status, 422)
    assert.equal(response.body.errors[0].field, 'email')
    assert.equal(response.body.errors[0].code, 'unknown_field')
    assert.isNull(await consumedAt(account.tokenId))
    assert.lengthOf(await dispatchJobsFor(account.userId), 1)
  })
})
