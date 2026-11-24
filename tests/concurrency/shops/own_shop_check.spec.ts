import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { minutesAgo, send, signIn } from '#tests/support/courier_http'
import {
  codeAt,
  enrolledStaff,
  forgetKeys,
  forgetMfa,
  randomIPv4,
  wrongCode,
} from '#tests/support/identity'
import { createOwnerShop } from '#tests/support/shops'

/*
 * T-SEC-045, the parts of OD-44's own-shop check that need real commits
 * (docs/07 §3.10, §4.1 rule 4; docs/06 §7.3 step 3): the `mfa_user` and
 * `mfa` limiters write `rate_limits` on their own connection, outside the
 * action's transaction, so
 * - a wrong `totp_code` keeps its point although the action rolls back, a
 *   right one deletes the key, and a request that needs no code (none sent
 *   under the mode, or a refusal with the mode off) charges nothing;
 * - of two own-shop actions sent at once with one code, exactly one passes:
 *   the second waits on the `users` row that the first's compare-and-set
 *   locked until its commit, then finds the step spent (422 on
 *   `totp_code`).
 * The staff member owns two shops; the shops, their settings, the audit
 * rows, the sessions, the users and the limiter keys are deleted after each
 * test, as the migrator with the retention exemption, and
 * `single_operator_mode` goes back to `false`.
 */

const MODE = 'single_operator_mode'

async function setMode(on: boolean) {
  await db.rawQuery(
    `INSERT INTO platform_settings (key, value) VALUES (?, ?::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [MODE, JSON.stringify(on)]
  )
}

type Made = { shopIds: string[]; userIds: string[]; staffId: string; ip: string }
let made: Made | null = null

async function cleanUp() {
  await setMode(false)
  if (!made) return
  const { shopIds, userIds, staffId, ip } = made
  await forgetMfa(staffId, ip)
  await forgetKeys('api_staff', staffId)
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    await trx.rawQuery(`SET LOCAL dripnepal.retention_purge = 'on'`)
    await trx
      .from('audit_logs')
      .where((query) => {
        query
          .whereIn('shop_id', shopIds)
          .orWhereIn('actor_user_id', userIds)
          .orWhereIn('subject_id', userIds)
      })
      .delete()
    await trx.from('shop_logistics_settings').whereIn('shop_id', shopIds).delete()
    await trx.from('shop_agreements').whereIn('shop_id', shopIds).delete()
    await trx.from('shops').whereIn('id', shopIds).delete()
    await trx.from('sessions').whereIn('user_id', userIds).delete()
    await trx.from('platform_staff').whereIn('user_id', userIds).delete()
    await trx.from('users').whereIn('id', userIds).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
  made = null
}

async function setUp() {
  const { user, secret } = await enrolledStaff('platform_admin')
  const first = await createOwnerShop()
  const second = await createOwnerShop()
  const shopIds = [first.shopId, second.shopId]
  await db.from('shops').whereIn('id', shopIds).update({ owner_user_id: user.id })
  const ip = randomIPv4()
  made = { shopIds, userIds: [user.id, first.ownerId, second.ownerId], staffId: user.id, ip }
  const browser = await signIn(user.id, minutesAgo(0))
  const switchOff = (shopId: string, totpCode?: string) =>
    send(
      browser,
      'PUT',
      `/api/v1/admin/shops/${shopId}/logistics-enabled`,
      { is_enabled: false, reason: 'Checking one code at once', totp_code: totpCode },
      { 'X-Forwarded-For': ip }
    )
  return { userId: user.id, secret, shopIds, switchOff }
}

async function consumed(userId: string) {
  const point = await rateLimiter('mfa_user').get(rateLimitKey('mfa_user', userId))
  return point?.consumed ?? 0
}

test.group('T-SEC-045 the own-shop code with real commits', (group) => {
  group.each.teardown(cleanUp)

  test('T-SEC-045 a wrong code keeps its limiter point, a right one clears it, and a request that needs no code charges none', async ({
    assert,
  }) => {
    const s = await setUp()
    await setMode(false)
    const refused = await s.switchOff(s.shopIds[0], codeAt(s.secret))
    assert.equal(refused.status, 403)
    assert.equal(await consumed(s.userId), 0, 'the refusal with the mode off charged nothing')

    await setMode(true)
    const missing = await s.switchOff(s.shopIds[0])
    assert.equal(missing.status, 422)
    assert.equal(await consumed(s.userId), 0, 'no code, no charge')

    const wrong = await s.switchOff(s.shopIds[0], wrongCode(s.secret))
    assert.equal(wrong.status, 422)
    assert.equal(await consumed(s.userId), 1, 'the wrong code stays counted after the rollback')

    const right = await s.switchOff(s.shopIds[0], codeAt(s.secret))
    assert.equal(right.status, 200, right.text)
    assert.equal(await consumed(s.userId), 0, 'a right code deletes the key')
  })

  test('T-SEC-045 two own-shop actions sent at once with one code: exactly one passes', async ({
    assert,
  }) => {
    const s = await setUp()
    await setMode(true)
    for (let round = 0; round < 3; round++) {
      await db.from('users').where('id', s.userId).update({ mfa_last_used_step: null })
      await db.from('shop_logistics_settings').whereIn('shop_id', s.shopIds).delete()
      const code = codeAt(s.secret)
      const results = await Promise.all(s.shopIds.map((shopId) => s.switchOff(shopId, code)))
      const statuses = results.map((result) => result.status).sort()
      assert.deepEqual(statuses, [200, 422], `round ${round}`)
      const loser = results.find((result) => result.status === 422)!
      assert.deepEqual(
        loser.body.errors.map((item: { field: string; code: string }) => [item.field, item.code]),
        [['totp_code', 'code_incorrect']]
      )
      const switched = await db
        .from('shop_logistics_settings')
        .whereIn('shop_id', s.shopIds)
        .where('is_enabled', false)
      assert.lengthOf(switched, 1, `round ${round}: one change only`)
      await forgetMfa(s.userId, made!.ip)
    }
  })
})
