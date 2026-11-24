import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { activeShop, courierWorld, NCM_TOKEN, type CourierWorld } from '#tests/support/courier'
import { key, minutesAgo, send, signIn } from '#tests/support/courier_http'
import {
  codeAt,
  enrolledStaff,
  forgetKeys,
  forgetMfa,
  randomIPv4,
  wrongCode,
} from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'

/*
 * T-SEC-045: OD-44's own-shop check on the admin operations (docs/07 §4.1
 * rule 4, §4.5, §4.7; decided 2026-11-23, option (b) with the
 * `single_operator_mode` exception; R1-S part 1c-ii). A platform action on a
 * shop the staff member owns or works in, or on its orders, answers 403
 * while `single_operator_mode` is off; under the mode it needs a fresh
 * `totp_code` in the body, checked in the action's transaction, and its
 * audit row carries the `single_operator` flag. On any other shop nothing
 * changes. Over HTTP against the test server, as staff signed in with a
 * real TOTP secret; the limiter keys a test charged are deleted after it.
 * Here the limiter writes share the test's global transaction and roll back
 * with the action, so what the limiters keep, and two requests racing with
 * one code, are tested with real commits in
 * tests/concurrency/shops/own_shop_check.spec.ts.
 */

const MODE = 'single_operator_mode'

async function setMode(on: boolean) {
  await db.rawQuery(
    `INSERT INTO platform_settings (key, value) VALUES (?, ?::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [MODE, JSON.stringify(on)]
  )
}

async function insertPlatformAccount(name: string) {
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'ncm',
      owner_type: 'platform',
      shop_id: null,
      name,
      environment: 'sandbox',
      credentials_enc: encryptField(
        JSON.stringify({ token: NCM_TOKEN }),
        'logistics_accounts.credentials_enc'
      ),
      status: 'active',
      verified_at: db.raw('now()'),
    })
    .returning('id')
  return row.id as string
}

async function allowShop(accountId: string, shopId: string) {
  await db.table('logistics_account_shops').insert({
    account_id: accountId,
    shop_id: shopId,
    account_owner_type: 'platform',
    owner_shop_id: null,
  })
}

// The world's shipment as the booking job leaves it after a lost answer (docs/05 §6.3).
async function needsReconciliation(world: CourierWorld) {
  await db
    .from('shipments')
    .where('id', world.shipmentId)
    .update({
      status: 'needs_reconciliation',
      logistics_account_id: world.accountId,
      pickup_address_id: world.addressId,
      merchant_reference: `${world.shopOrder.number}-S1`,
      cod_amount_minor: 110000,
    })
}

// A held courier reading on the world's shipment (docs/04a §9.14).
async function heldEvent(world: CourierWorld) {
  const [row] = await db
    .table('courier_events')
    .insert({
      logistics_account_id: world.accountId,
      source: 'poll',
      event_key: `test-held-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      external_shipment_id: '9001',
      shipment_id: world.shipmentId,
      shop_id: world.shopId,
      raw_status: 'Teleported',
      payload: JSON.stringify({}),
      processing_status: 'held',
      processed_at: db.raw('now()'),
      hold_reason: 'unmapped_status',
    })
    .returning('id')
  return row.id as string
}

const auditsBy = (userId: string) =>
  db
    .from('audit_logs')
    .where('actor_user_id', userId)
    .whereNot('action', 'like', 'auth.%')
    .select('action', 'changes')

const mfaFailures = (userId: string) =>
  db.from('audit_logs').where({ action: 'auth.mfa_failed', subject_id: userId })

async function mfaFailureCount(userId: string) {
  const rows = await mfaFailures(userId)
  return rows.length
}

const fields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// One column of the first row a query finds, or null (lint: no member access on an await expression).
async function column<T>(query: Promise<Record<string, T> | null | undefined>, name: string) {
  const row = await query
  return row?.[name] ?? null
}

async function lastUsedStep(userId: string) {
  const row = await db.from('users').where('id', userId).select('mfa_last_used_step').first()
  return row.mfa_last_used_step as number | null
}

// Each code below must be later than the last one spent; tests that spend several reset it.
async function forgetLastStep(userId: string) {
  await db.from('users').where('id', userId).update({ mfa_last_used_step: null })
}

test.group('T-SEC-045 OD-44: platform actions on the staff member’s own shop', (group) => {
  let charged: { userId: string; ip: string }[]
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    charged = []
    return async () => {
      for (const { userId, ip } of charged) {
        await forgetMfa(userId, ip)
        await forgetKeys('api_staff', userId)
      }
    }
  })

  /*
   * Staff signed in with MFA now, with a TOTP secret, and a courier world
   * whose shop they own (or work in, or have nothing to do with), with the
   * rows each operation needs: a shipment waiting for reconciliation, a
   * held reading, and two platform-owned accounts, one with the shop
   * allowed on it.
   */
  async function setUp(relation: 'owner' | 'member' | 'none', mfaVerifiedAt = minutesAgo(0)) {
    const { user, secret } = await enrolledStaff('platform_admin')
    const world = await courierWorld()
    if (relation === 'owner') {
      await db.from('shops').where('id', world.shopId).update({ owner_user_id: user.id })
    } else if (relation === 'member') {
      await db
        .table('shop_memberships')
        .insert({ shop_id: world.shopId, user_id: user.id, role: 'manager', status: 'active' })
    }
    await needsReconciliation(world)
    const eventId = await heldEvent(world)
    const allowedAccountId = await insertPlatformAccount('DripNepal NCM')
    await allowShop(allowedAccountId, world.shopId)
    const otherAccountId = await insertPlatformAccount('DripNepal NCM 2')
    const ip = randomIPv4()
    charged.push({ userId: user.id, ip })
    const browser = await signIn(user.id, mfaVerifiedAt)
    const call = (method: string, path: string, body?: unknown, headers = {}) =>
      send(browser, method, path, body, { 'X-Forwarded-For': ip, ...headers })
    return { user, secret, world, eventId, allowedAccountId, otherAccountId, call }
  }

  type Setup = Awaited<ReturnType<typeof setUp>>

  // Every admin write that acts on a shop or its orders, with a reading of what it changes.
  function operations(s: Setup) {
    const { world } = s
    return [
      {
        name: 'adminSetShopLogisticsEnabled',
        method: 'PUT',
        path: `/api/v1/admin/shops/${world.shopId}/logistics-enabled`,
        body: { is_enabled: false, reason: 'Checking the own-shop rule' },
        headers: {},
        state: async () =>
          column(
            db.from('shop_logistics_settings').where('shop_id', world.shopId).first(),
            'is_enabled'
          ),
      },
      {
        name: 'adminSetLogisticsAccountStatus (shop-owned account)',
        method: 'POST',
        path: `/api/v1/admin/logistics/accounts/${world.accountId}/status`,
        body: { status: 'suspended', reason: 'Checking the own-shop rule' },
        headers: {},
        state: async () =>
          column(db.from('logistics_accounts').where('id', world.accountId).first(), 'status'),
      },
      {
        name: 'adminAllowShopOnLogisticsAccount',
        method: 'PUT',
        path: `/api/v1/admin/logistics/accounts/${s.otherAccountId}/shops/${world.shopId}`,
        body: {},
        headers: {},
        state: async () =>
          column(
            db
              .from('logistics_account_shops')
              .where({ account_id: s.otherAccountId, shop_id: world.shopId })
              .first(),
            'is_active'
          ),
      },
      {
        name: 'adminRemoveShopFromLogisticsAccount',
        method: 'DELETE',
        path: `/api/v1/admin/logistics/accounts/${s.allowedAccountId}/shops/${world.shopId}`,
        body: {},
        headers: {},
        state: async () =>
          column(
            db
              .from('logistics_account_shops')
              .where({ account_id: s.allowedAccountId, shop_id: world.shopId })
              .first(),
            'is_active'
          ),
      },
      {
        name: 'adminResolveCourierBooking',
        method: 'POST',
        path: `/api/v1/admin/shop-orders/${world.shopOrder.number}/courier-booking/resolution`,
        body: { outcome: 'booking_failed', note: 'Not on the NCM portal' },
        headers: { 'Idempotency-Key': key() },
        state: async () =>
          column(db.from('shipments').where('id', world.shipmentId).first(), 'status'),
      },
      {
        name: 'adminResolveCourierEvent',
        method: 'POST',
        path: `/api/v1/admin/courier-events/${s.eventId}/resolution`,
        body: { processing_status: 'ignored', note: 'An NCM internal label' },
        headers: {},
        state: async () =>
          column(db.from('courier_events').where('id', s.eventId).first(), 'processing_status'),
      },
      {
        name: 'adminRecordOrderVerification',
        method: 'POST',
        path: `/api/v1/admin/orders/${world.orderNumber}/verification`,
        body: { verification_status: 'review_required', verification_method: 'phone_call' },
        headers: {},
        state: async () =>
          column(db.from('orders').where('id', world.orderId).first(), 'verification_status'),
      },
    ]
  }

  test('T-SEC-045 with single-operator mode off, every admin write on the staff member’s own shop answers 403 and changes nothing', async ({
    assert,
  }) => {
    await setMode(false)
    const s = await setUp('owner')
    for (const op of operations(s)) {
      const before = await op.state()
      const response = await s.call(op.method, op.path, op.body, op.headers)
      assert.equal(response.status, 403, op.name)
      assert.equal(response.body.code, 'FORBIDDEN', op.name)
      assert.match(response.body.detail, /single-operator mode is off/, op.name)
      assert.deepEqual(await op.state(), before, `${op.name} changed nothing`)
    }
    assert.lengthOf(await auditsBy(s.user.id), 0, 'no audit row')
  })

  test('T-SEC-045 with the mode off, a code changes nothing: the refusal comes first and the code is not spent', async ({
    assert,
  }) => {
    await setMode(false)
    const s = await setUp('owner')
    const [op] = operations(s)
    const response = await s.call(op.method, op.path, {
      ...op.body,
      totp_code: codeAt(s.secret),
    })
    assert.equal(response.status, 403)
    assert.isNull(await lastUsedStep(s.user.id), 'the code was not spent')
  })

  test('T-SEC-045 an active member counts as working in the shop; a removed member does not', async ({
    assert,
  }) => {
    await setMode(false)
    const s = await setUp('member')
    const [op] = operations(s)
    const refused = await s.call(op.method, op.path, op.body)
    assert.equal(refused.status, 403)
    await db
      .from('shop_memberships')
      .where({ shop_id: s.world.shopId, user_id: s.user.id })
      .update({ status: 'removed', removed_at: db.raw('now()') })
    const allowed = await s.call(op.method, op.path, op.body)
    assert.equal(allowed.status, 200)
    assert.isFalse(await op.state())
  })

  test('T-SEC-045 under single-operator mode, no code answers 422 on totp_code and changes nothing', async ({
    assert,
  }) => {
    await setMode(true)
    const s = await setUp('owner')
    for (const op of operations(s)) {
      const before = await op.state()
      const response = await s.call(op.method, op.path, op.body, op.headers)
      assert.equal(response.status, 422, op.name)
      assert.deepEqual(fields(response.body), [['totp_code', 'required']], op.name)
      assert.deepEqual(await op.state(), before, `${op.name} changed nothing`)
    }
    assert.lengthOf(await auditsBy(s.user.id), 0)
  })

  test('T-SEC-045 under the mode, a fresh code makes each change, flags its audit row single_operator and is spent', async ({
    assert,
  }) => {
    await setMode(true)
    const s = await setUp('owner')
    for (const op of operations(s)) {
      await forgetLastStep(s.user.id)
      const before = await op.state()
      const code = codeAt(s.secret)
      const response = await s.call(op.method, op.path, { ...op.body, totp_code: code }, op.headers)
      assert.include([200, 204], response.status, `${op.name}: ${response.text}`)
      assert.notDeepEqual(await op.state(), before, `${op.name} made its change`)
      assert.isNotNull(await lastUsedStep(s.user.id), `${op.name} spent the code`)

      // The same code again is a replay: 422 on totp_code, one auth.mfa_failed row.
      const failuresBefore = await mfaFailureCount(s.user.id)
      const again = await s.call(
        op.method,
        op.path,
        { ...op.body, totp_code: code },
        { ...op.headers, ...('Idempotency-Key' in op.headers ? { 'Idempotency-Key': key() } : {}) }
      )
      assert.equal(again.status, 422, `${op.name} replayed code`)
      assert.deepEqual(fields(again.body), [['totp_code', 'code_incorrect']])
      assert.lengthOf(await mfaFailures(s.user.id), failuresBefore + 1)
      await forgetMfa(s.user.id, charged[0].ip)
    }
    const audits = await auditsBy(s.user.id)
    assert.lengthOf(audits, operations(s).length)
    for (const row of audits) {
      assert.deepEqual(row.changes.flags, ['single_operator'], row.action)
    }
  })

  // The limiter points need real commits: tests/concurrency/shops/own_shop_check.spec.ts.
  test('T-SEC-045 a wrong code answers 422 on totp_code, writes auth.mfa_failed and changes nothing', async ({
    assert,
  }) => {
    await setMode(true)
    const s = await setUp('owner')
    const op = operations(s)[1]
    const response = await s.call(op.method, op.path, {
      ...op.body,
      totp_code: wrongCode(s.secret),
    })
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [['totp_code', 'code_incorrect']])
    assert.equal(await op.state(), 'active')
    assert.isNull(await lastUsedStep(s.user.id))
    assert.lengthOf(await mfaFailures(s.user.id), 1)
    assert.lengthOf(await auditsBy(s.user.id), 0)
  })

  test('T-SEC-045 a replayed idempotency key returns its stored answer without a code; a wrong code left the key free', async ({
    assert,
  }) => {
    await setMode(true)
    const s = await setUp('owner')
    const op = operations(s)[4]
    const headers = { 'Idempotency-Key': key() }
    const wrong = await s.call(
      op.method,
      op.path,
      { ...op.body, totp_code: wrongCode(s.secret) },
      headers
    )
    assert.equal(wrong.status, 422)
    const first = await s.call(
      op.method,
      op.path,
      { ...op.body, totp_code: codeAt(s.secret) },
      headers
    )
    assert.equal(first.status, 200, first.text)
    assert.isNull(first.headers.get('idempotency-replayed'), 'the key was free: the action ran')
    const failures = await mfaFailureCount(s.user.id)

    const replay = await s.call(op.method, op.path, op.body, headers)
    assert.equal(replay.status, 200)
    assert.equal(replay.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(replay.body, first.body)
    const stale = await s.call(
      op.method,
      op.path,
      { ...op.body, totp_code: wrongCode(s.secret) },
      headers
    )
    assert.equal(stale.status, 200, 'a replay checks no code')
    assert.lengthOf(await mfaFailures(s.user.id), failures)
  })

  test('T-SEC-045 on a shop the staff member has nothing to do with, the writes need no code and are not flagged', async ({
    assert,
  }) => {
    await setMode(true)
    const s = await setUp('none')
    // They own another shop, which changes nothing here.
    await activeShop(s.user.id)
    for (const op of operations(s)) {
      const response = await s.call(op.method, op.path, op.body, op.headers)
      assert.include([200, 204], response.status, `${op.name}: ${response.text}`)
    }
    for (const row of await auditsBy(s.user.id)) {
      assert.notProperty(row.changes, 'flags', row.action)
    }
    // A code sent anyway is not checked.
    await forgetLastStep(s.user.id)
    const op = operations(s)[6]
    const response = await s.call(op.method, op.path, {
      ...op.body,
      verification_status: 'verified',
      totp_code: wrongCode(s.secret),
    })
    assert.equal(response.status, 200)
    assert.lengthOf(await mfaFailures(s.user.id), 0)
    assert.isNull(await lastUsedStep(s.user.id))
  })

  test('T-SEC-045 a platform-owned account is nobody’s shop: its status changes without the check', async ({
    assert,
  }) => {
    await setMode(false)
    const s = await setUp('owner')
    const response = await s.call(
      'POST',
      `/api/v1/admin/logistics/accounts/${s.allowedAccountId}/status`,
      { status: 'suspended', reason: 'Checking the platform account' }
    )
    assert.equal(response.status, 200, response.text)
    const [row] = await auditsBy(s.user.id)
    assert.notProperty(row.changes, 'flags')
  })

  test('T-SEC-045 a step-up operation takes a code in the body in place of a fresh session, which the code refreshes', async ({
    assert,
  }) => {
    await setMode(false)
    // MFA 30 minutes ago: inside the 12-hour admin window, past the 15-minute step-up.
    const s = await setUp('none', minutesAgo(30))
    const suspend = { status: 'suspended', reason: 'Checking the step-up code' }
    const path = (id: string) => `/api/v1/admin/logistics/accounts/${id}/status`

    const stale = await s.call('POST', path(s.otherAccountId), suspend)
    assert.equal(stale.status, 401)
    assert.equal(stale.body.mfa, 'verification_required')

    const wrong = await s.call('POST', path(s.otherAccountId), {
      ...suspend,
      totp_code: wrongCode(s.secret),
    })
    assert.equal(wrong.status, 422)
    assert.deepEqual(fields(wrong.body), [['totp_code', 'code_incorrect']])

    const right = await s.call('POST', path(s.otherAccountId), {
      ...suspend,
      totp_code: codeAt(s.secret),
    })
    assert.equal(right.status, 200, right.text)
    // The session now holds a fresh proof: the next step-up operation needs no code.
    const next = await s.call('POST', path(s.allowedAccountId), suspend)
    assert.equal(next.status, 200, next.text)
  })
})
