import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { confirmTotpEnrollment } from '#modules/identity/actions/confirm_totp_enrollment'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { startTotpEnrollment } from '#modules/identity/actions/start_totp_enrollment'
import { verifyMfaChallenge } from '#modules/identity/actions/verify_mfa_challenge'
import { JOB_SCHEMA } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { FACTORY_PASSWORD } from '#database/factories/user_factory'
import { signIn } from '#tests/support/courier_http'
import {
  MFA_CHALLENGE_PATH,
  codeAt,
  enrolledStaff,
  forgetMfa,
  forgetReauth,
  postJson,
  randomIPv4,
  rawTokenOf,
  staffWithoutTotp,
  wrongCode,
  type Guest,
} from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'
import { captureLogs } from '#tests/support/logs'

/*
 * The TOTP limiters and races where real commits matter (docs/10 §3.3;
 * docs/06 §9.1 `mfa_user` and `mfa`; docs/07 §3.9; M1 part 5). The limiter
 * store commits on its own connection, and each action call commits on its
 * own pool connection.
 * - T-SEC-011: the 6th wrong code in 5 minutes locks the account's TOTP
 *   checks for 15 minutes even when the codes come from 3 sessions and 3
 *   client networks; a right code from any session is then refused with
 *   429 and `Retry-After`; one `auth.mfa_locked` row and one `mfa_lockout`
 *   alert (AC-FR-IAM-007-4, OD-50).
 * - T-SEC-011: 20 wrong codes sent at once reach the check at most 5 times.
 * - T-SEC-011: the per-source `mfa` limiter refuses the 6th code in a
 *   minute from one network once a right code elsewhere has cleared the
 *   account's count.
 * - T-SEC-008: two requests carrying one valid code at once: exactly one
 *   passes (AC-FR-IAM-007-3).
 * - T-IAM-105: two confirmations of one enrolment at once: one turns TOTP
 *   on and consumes the token, the other is refused, and one email is
 *   queued.
 * Each test uses fresh staff under its own prefix and fresh client
 * networks, then deletes its users, staff rows, tokens, jobs, sessions,
 * audit rows and limiter keys, as the migrator, with the retention
 * exemption for the audit rows.
 */

const PREFIX = 'conc-mfa-'
const newEmail = (label: string) => `${PREFIX}${label}-${randomUUID()}@example.com`

const context = (ip: string) => ({ ip, requestId: null, ipHash: null })

async function outcomeOf(call: () => Promise<unknown>) {
  return call().then(
    () => 'ok',
    (error: { problemCode?: string; code?: string }) => error.problemCode ?? error.code ?? 'error'
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
          WHERE name = 'notifications.dispatch'
            AND (data->>'user_id' = ANY(?::text[])
              OR data->>'user_token_id' IN (
                SELECT id::text FROM user_tokens WHERE user_id = ANY(?::uuid[])))`,
        [ids, ids]
      )
      await trx.from('sessions').whereIn('user_id', ids).delete()
      await trx.from('user_tokens').whereIn('user_id', ids).delete()
      await trx.from('audit_logs').whereIn('subject_id', ids).delete()
      await trx.from('platform_staff').whereIn('user_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

const auditCount = async (action: string, userId: string) => {
  const rows = await db.from('audit_logs').where({ action, subject_id: userId })
  return rows.length
}

test.group('T-SEC-011 TOTP throttling', (group) => {
  let forget: { userId: string; ips: string[] }[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    forget = []
    return async () => {
      for (const { userId, ips } of forget) {
        await forgetMfa(userId, ...ips)
        await forgetReauth(userId)
      }
      await cleanUp()
    }
  })

  test('T-SEC-011 the 6th wrong code in 5 minutes locks TOTP for the account across 3 sessions and 3 networks; a right code is then refused with 429 [AC-FR-IAM-007-4]', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff('platform_admin', newEmail('lock'))
    const devices: Guest[] = []
    for (let n = 0; n < 3; n++) {
      devices.push({ browser: await signIn(user.id), ip: randomIPv4() })
    }
    forget.push({ userId: user.id, ips: devices.map((device) => device.ip) })
    const bad = wrongCode(secret)

    const statuses: number[] = []
    const lines = await captureLogs(async () => {
      for (let n = 0; n < 5; n++) {
        const response = await postJson(devices[n % 3], MFA_CHALLENGE_PATH, { code: bad })
        statuses.push(response.status)
      }
      const sixth = await postJson(devices[2], MFA_CHALLENGE_PATH, { code: bad })
      statuses.push(sixth.status)
      assert.equal(sixth.body.code, 'RATE_LIMITED')
      assert.isAtLeast(Number(sixth.headers.get('retry-after')), 14 * 60)
    })
    assert.deepEqual(statuses, [422, 422, 422, 422, 422, 429])

    // While blocked, a right code from any session and network is refused too.
    const right = await postJson(devices[0], MFA_CHALLENGE_PATH, { code: codeAt(secret) })
    assert.equal(right.status, 429, right.text)
    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    assert.isNull(fresh.mfa_last_used_step)

    assert.equal(await auditCount('auth.mfa_failed', user.id), 5)
    assert.equal(await auditCount('auth.mfa_locked', user.id), 1)
    const alerts = lines.filter((line) => line.fields.alert === 'mfa_lockout')
    assert.lengthOf(alerts, 1)
    assert.equal(alerts[0].fields.user_id, user.id)
  })

  test('T-SEC-011 20 wrong codes sent at once reach the check at most 5 times, and the lock is recorded once', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff('platform_admin', newEmail('parallel'))
    const ips = Array.from({ length: 20 }, () => randomIPv4())
    forget.push({ userId: user.id, ips })
    const bad = wrongCode(secret)

    const outcomes = await Promise.all(
      ips.map((ip) => outcomeOf(() => verifyMfaChallenge(user.id, bad, context(ip))))
    )
    const checked = outcomes.filter((outcome) => outcome === 'VALIDATION_FAILED').length
    const refused = outcomes.filter((outcome) => outcome === 'E_TOO_MANY_REQUESTS').length
    assert.equal(checked, 5, outcomes.join(', '))
    assert.equal(refused, 15, outcomes.join(', '))
    assert.equal(await auditCount('auth.mfa_failed', user.id), 5)
    assert.equal(await auditCount('auth.mfa_locked', user.id), 1)
  })

  test('T-SEC-011 the per-source mfa limiter refuses the 6th code in a minute from one network after the account count was cleared', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff('platform_admin', newEmail('source'))
    const [noisy, other] = [randomIPv4(), randomIPv4()]
    forget.push({ userId: user.id, ips: [noisy, other] })
    const bad = wrongCode(secret)

    for (let n = 0; n < 4; n++) {
      assert.equal(
        await outcomeOf(() => verifyMfaChallenge(user.id, bad, context(noisy))),
        'VALIDATION_FAILED'
      )
    }
    // A right code from another network clears the account's count, not the noisy network's.
    assert.equal(
      await outcomeOf(() => verifyMfaChallenge(user.id, codeAt(secret, 1), context(other))),
      'ok'
    )
    assert.equal(
      await outcomeOf(() => verifyMfaChallenge(user.id, bad, context(noisy))),
      'VALIDATION_FAILED'
    )
    assert.equal(
      await outcomeOf(() => verifyMfaChallenge(user.id, bad, context(noisy))),
      'E_TOO_MANY_REQUESTS'
    )
    // No account lock: the per-source layer refused it.
    assert.equal(await auditCount('auth.mfa_locked', user.id), 0)
  })

  test('T-SEC-008 two requests carrying one valid code at once: exactly one passes [AC-FR-IAM-007-3]', async ({
    assert,
  }) => {
    const { user, secret } = await enrolledStaff('platform_admin', newEmail('replay'))
    const ips = [randomIPv4(), randomIPv4()]
    forget.push({ userId: user.id, ips })
    const code = codeAt(secret)

    const outcomes = await Promise.all(
      ips.map((ip) => outcomeOf(() => verifyMfaChallenge(user.id, code, context(ip))))
    )
    assert.sameMembers(outcomes, ['ok', 'VALIDATION_FAILED'])
    assert.equal(await auditCount('auth.mfa_verify', user.id), 1)
  })

  test('T-IAM-105 two confirmations of one enrolment at once: one turns TOTP on and consumes the token, the other is refused, one email is queued', async ({
    assert,
  }) => {
    const user = await staffWithoutTotp('platform_admin', newEmail('confirm'))
    const issued = await withTx((trx) => issueUserToken(trx, user.id, 'mfa_enrollment'))
    const token = await rawTokenOf(issued.id, 'mfa_enrollment')
    const ips = [randomIPv4(), randomIPv4()]
    forget.push({ userId: user.id, ips })
    const { secret } = await startTotpEnrollment(
      user.id,
      { token, password: FACTORY_PASSWORD },
      { requestId: null, ipHash: null }
    )

    const outcomes = await Promise.all(
      [codeAt(secret), codeAt(secret, 1)].map((code, n) =>
        outcomeOf(() => confirmTotpEnrollment(user.id, { code, token }, context(ips[n])))
      )
    )
    assert.include(outcomes, 'ok')
    assert.lengthOf(
      outcomes.filter((outcome) => outcome !== 'ok'),
      1,
      outcomes.join(', ')
    )
    assert.oneOf(
      outcomes.find((outcome) => outcome !== 'ok'),
      ['CONFLICT', 'VALIDATION_FAILED']
    )

    const row = await db.from('users').where('id', user.id).firstOrFail()
    assert.instanceOf(row.mfa_enabled_at, Date)
    const live = await db
      .from('user_tokens')
      .where({ user_id: user.id, purpose: 'mfa_enrollment' })
      .whereNull('consumed_at')
    assert.lengthOf(live, 0)
    assert.equal(await auditCount('platform_staff.mfa_enable', user.id), 1)
    const emails = await db
      .from(`${JOB_SCHEMA}.job`)
      .where('name', 'notifications.dispatch')
      .whereRaw(`data->>'event' = 'user.mfa_enabled' AND data->>'user_id' = ?`, [user.id])
    assert.lengthOf(emails, 1)
  })
})
