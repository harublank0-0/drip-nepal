import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import router from '@adonisjs/core/services/router'
import { Secret } from '@adonisjs/core/helpers'
import User from '#models/user'
import { startSession, SESSION_KEYS } from '#controllers/support/session'
import { courierConfig } from '#config/logistics'
import { courierCallbackToken } from '#modules/logistics/actions/courier_calls'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import env from '#start/env'
import { testBrowser, type Browser } from '#tests/support/browser'
import {
  activeShop,
  courierWorld,
  fakeCourier,
  insertNcmAccount,
  NCM_TOKEN,
  OWNER_PASSWORD,
  type FakeCourier,
} from '#tests/support/courier'
import { queued, useJobBoss } from '#tests/support/jobs'
import { insertUser } from '#tests/support/schema_rows'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'

/*
 * The M6 courier operations over HTTP (docs/06 §13.8, §12.6):
 * T-SHOP-115 (settings and accounts), T-SHOP-113 (disabling returns the shop
 * to manual), T-SHOP-006 (a referenced pickup address is copied on edit),
 * T-SEC-001 (another shop's IDs answer 404), T-SEC-041 (permissions and
 * step-up), T-SEC-040 (credentials never leave the adapter) and T-FUL-112
 * (the callback receiver). Signing in uses `startSession`, as M1's `logIn`
 * will; a staff session's MFA time stands in for M1's challenge.
 */

router.get('/__test__/courier/sign-in/:id', async (ctx) => {
  const user = await User.findOrFail(ctx.params.id)
  await user.refresh()
  await startSession(ctx, user, user.securityStamp)
  const at = ctx.request.qs().mfa_verified_at
  if (typeof at === 'string') ctx.session.put(SESSION_KEYS.mfaVerifiedAt, at)
  return { ok: true }
})

async function signIn(userId: string, mfaVerifiedAt?: string) {
  const browser = testBrowser()
  const query = mfaVerifiedAt ? `?mfa_verified_at=${encodeURIComponent(mfaVerifiedAt)}` : ''
  const response = await browser.request(`/__test__/courier/sign-in/${userId}${query}`)
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  return browser
}

const serverUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

async function send(
  browser: Browser,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const response = await browser.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : null,
    text,
  }
}

// The status of a response read asynchronously (lint: no member access on an await expression).
async function statusOf(response: Promise<{ status: number }>) {
  const { status } = await response
  return status
}

const key = () => `test-key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

async function member(shopId: string, role: string) {
  const userId = await insertUser()
  await db
    .table('shop_memberships')
    .insert({ shop_id: shopId, user_id: userId, role, status: 'active' })
  return userId
}

async function staffUser(role: string) {
  const userId = await insertUser()
  await db
    .from('users')
    .where('id', userId)
    // users_mfa_check: MFA on needs a TOTP secret; a placeholder stands in for M1's enrolment.
    .update({
      status: 'active',
      email_verified_at: db.raw('now()'),
      mfa_enabled_at: db.raw('now()'),
      mfa_totp_secret_enc: placeholderCiphertext(),
    })
  await db.table('platform_staff').insert({ user_id: userId, role })
  return userId
}

test.group('T-SHOP-115 logistics settings and courier accounts', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SHOP-115 the first save sends If-Match "0", a stale version gives 412, none gives 428', async ({
    assert,
  }) => {
    const { ownerId, shopId, slug } = await activeShop()
    const accountId = await insertNcmAccount(shopId)
    const browser = await signIn(ownerId)
    const base = `/api/v1/seller/shops/${slug}/logistics`
    const shown = await send(browser, 'GET', base)
    assert.equal(shown.status, 200)
    assert.equal(shown.headers.get('etag'), '"0"')
    assert.equal(shown.body.data.settings.fulfillment_mode, 'manual')
    const body = { fulfillment_mode: 'vendor', default_account_id: accountId }
    assert.equal(await statusOf(send(browser, 'PUT', base, body)), 428)
    const saved = await send(browser, 'PUT', base, body, { 'If-Match': '"0"' })
    assert.equal(saved.status, 200, saved.text)
    assert.equal(saved.headers.get('etag'), '"1"')
    const stale = await send(browser, 'PUT', base, body, { 'If-Match': '"0"' })
    assert.equal(stale.status, 412)
    assert.equal(stale.body.code, 'VERSION_CONFLICT')
    assert.equal(stale.body.current.version, 1)
  })

  test('T-SHOP-115 an account the shop may not use, the platform mode, or an unknown member gives 422', async ({
    assert,
  }) => {
    const { ownerId, slug } = await activeShop()
    const other = await activeShop()
    const foreign = await insertNcmAccount(other.shopId)
    const browser = await signIn(ownerId)
    const base = `/api/v1/seller/shops/${slug}/logistics`
    const notUsable = await send(
      browser,
      'PUT',
      base,
      { fulfillment_mode: 'vendor', default_account_id: foreign },
      { 'If-Match': '"0"' }
    )
    assert.equal(notUsable.status, 422)
    assert.equal(notUsable.body.errors[0].code, 'account_not_usable')
    const platform = await send(
      browser,
      'PUT',
      base,
      { fulfillment_mode: 'platform', default_account_id: foreign },
      { 'If-Match': '"0"' }
    )
    assert.equal(platform.status, 422)
    assert.equal(platform.body.errors[0].field, 'fulfillment_mode')
    const unknown = await send(
      browser,
      'PUT',
      base,
      { fulfillment_mode: 'manual', shop_id: other.shopId },
      { 'If-Match': '"0"' }
    )
    assert.equal(unknown.status, 422)
    assert.equal(unknown.body.errors[0].code, 'unknown_field')
  })

  test('T-SHOP-115 creating an account needs a key and the password; a duplicate reference gives 422; a replay answers the same', async ({
    assert,
  }) => {
    const { ownerId, slug, shopId } = await activeShop()
    const browser = await signIn(ownerId)
    const path = `/api/v1/seller/shops/${slug}/courier-accounts`
    const body = {
      provider_code: 'ncm',
      name: 'NCM Kathmandu',
      environment: 'sandbox',
      external_account_ref: 'VENDOR-42',
      credentials: { token: NCM_TOKEN },
      password: OWNER_PASSWORD,
    }
    assert.equal(await statusOf(send(browser, 'POST', path, body)), 400, 'no Idempotency-Key')
    const wrong = await send(
      browser,
      'POST',
      path,
      { ...body, password: 'not the password' },
      { 'Idempotency-Key': key() }
    )
    assert.equal(wrong.status, 422)
    assert.equal(wrong.body.errors[0].field, 'password')
    const idempotencyKey = key()
    const created = await send(browser, 'POST', path, body, { 'Idempotency-Key': idempotencyKey })
    assert.equal(created.status, 201, created.text)
    assert.equal(created.body.data.status, 'pending')
    assert.notInclude(created.text, NCM_TOKEN)
    assert.notProperty(created.body.data, 'credentials_enc')
    const replay = await send(browser, 'POST', path, body, { 'Idempotency-Key': idempotencyKey })
    assert.equal(replay.status, 201)
    assert.equal(replay.headers.get('idempotency-replayed'), 'true')
    assert.deepEqual(replay.body, created.body)
    const duplicate = await send(browser, 'POST', path, body, { 'Idempotency-Key': key() })
    assert.equal(duplicate.status, 422)
    assert.equal(duplicate.body.errors[0].code, 'already_registered')
    const accounts = await db.from('logistics_accounts').where('shop_id', shopId)
    assert.lengthOf(accounts, 1)
    const jobs = await queued<{ account_id: string }>('logistics.verify_account')
    assert.isTrue(jobs.some((job) => job.data.account_id === accounts[0].id))
  })

  test('T-SHOP-113 disabling an account with an unfinished parcel gives 409; otherwise the shop returns to manual', async ({
    assert,
  }) => {
    const world = await courierWorld()
    await db
      .from('shipments')
      .where('id', world.shipmentId)
      .update({
        status: 'booked',
        logistics_account_id: world.accountId,
        pickup_address_id: world.addressId,
        merchant_reference: `${world.shopOrder.number}-S1`,
        cod_amount_minor: 110000,
        external_shipment_id: '5150',
        booked_at: db.raw('now()'),
      })
    const browser = await signIn(world.ownerId)
    const path = `/api/v1/seller/shops/${world.slug}/courier-accounts/${world.accountId}/disable`
    const blocked = await send(browser, 'POST', path, { password: OWNER_PASSWORD })
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.code, 'INVALID_STATE_TRANSITION')

    const other = await courierWorld()
    const otherBrowser = await signIn(other.ownerId)
    const disabled = await send(
      otherBrowser,
      'POST',
      `/api/v1/seller/shops/${other.slug}/courier-accounts/${other.accountId}/disable`,
      { password: OWNER_PASSWORD }
    )
    assert.equal(disabled.status, 200, disabled.text)
    assert.equal(disabled.body.data.status, 'disabled')
    const account = await db.from('logistics_accounts').where('id', other.accountId).first()
    assert.isNull(account.credentials_enc, 'credentials erased')
    const settings = await db.from('shop_logistics_settings').where('shop_id', other.shopId).first()
    assert.deepEqual([settings.fulfillment_mode, settings.default_account_id], ['manual', null])
    const link = await db
      .from('logistics_account_shops')
      .where('account_id', other.accountId)
      .first()
    assert.isFalse(link.is_active)
  })

  test('T-SHOP-115 archiving the default pickup address gives 409; is_default false on it gives 422', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const browser = await signIn(world.ownerId)
    const path = `/api/v1/seller/shops/${world.slug}/pickup-addresses/${world.addressId}`
    const archived = await send(browser, 'DELETE', path)
    assert.equal(archived.status, 409)
    const undefault = await send(browser, 'PATCH', path, { is_default: false })
    assert.equal(undefault.status, 422)
  })
})

test.group('T-SHOP-006 and T-SEC-001 on the courier operations', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SHOP-006 editing a pickup address a shipment references archives it and inserts a copy', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const browser = await signIn(world.ownerId)
    const booking = await send(
      browser,
      'POST',
      `/api/v1/seller/shops/${world.slug}/orders/${world.shopOrder.number}/courier-booking`,
      {
        account_id: world.accountId,
        pickup_address_id: world.addressId,
        service_code: 'Door2Door',
        origin_branch_id: world.originBranchId,
        destination_branch_id: world.destinationBranchId,
      },
      { 'Idempotency-Key': key() }
    )
    assert.equal(booking.status, 200, booking.text)
    const edited = await send(
      browser,
      'PATCH',
      `/api/v1/seller/shops/${world.slug}/pickup-addresses/${world.addressId}`,
      {
        contact_name: 'Hari Thapa',
        contact_phone: '9811111111',
        province_code: '3',
        district_code: '306',
        local_level_code: '30608',
        ward_no: 11,
        area_tole: 'Lazimpat',
      }
    )
    assert.equal(edited.status, 200, edited.text)
    assert.notEqual(edited.body.data.id, world.addressId)
    assert.equal(edited.body.data.contact_phone, '9811111111')
    assert.isTrue(edited.body.data.is_default)
    const old = await db.from('shop_addresses').where('id', world.addressId).first()
    assert.isNotNull(old.archived_at)
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(
      shipment.pickup_address_id,
      world.addressId,
      'the shipment keeps the address its parcel left from'
    )
  })

  test("T-SEC-001 another shop's account, address or shop order answers 404", async ({
    assert,
  }) => {
    const mine = await courierWorld()
    const theirs = await courierWorld()
    const browser = await signIn(mine.ownerId)
    const base = `/api/v1/seller/shops/${mine.slug}`
    const rekey = await send(
      browser,
      'POST',
      `${base}/courier-accounts/${theirs.accountId}/credentials`,
      { credentials: { token: NCM_TOKEN }, password: OWNER_PASSWORD },
      { 'If-Match': '"1"' }
    )
    assert.equal(rekey.status, 404)
    const address = await send(browser, 'PATCH', `${base}/pickup-addresses/${theirs.addressId}`, {
      is_default: true,
    })
    assert.equal(address.status, 404)
    const booking = await send(
      browser,
      'POST',
      `${base}/orders/${theirs.shopOrder.number}/courier-booking`,
      { account_id: mine.accountId, pickup_address_id: mine.addressId, service_code: 'Door2Door' },
      { 'Idempotency-Key': key() }
    )
    assert.equal(booking.status, 404)
  })
})

test.group('T-SEC-041 courier-account permissions', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SEC-041 a manager may not change a courier account; a fulfiller may book but not edit settings', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const manager = await signIn(await member(world.shopId, 'manager'))
    const create = await send(
      manager,
      'POST',
      `/api/v1/seller/shops/${world.slug}/courier-accounts`,
      {
        provider_code: 'ncm',
        name: 'NCM 2',
        environment: 'sandbox',
        credentials: { token: NCM_TOKEN },
        password: 'x',
      },
      { 'Idempotency-Key': key() }
    )
    assert.equal(create.status, 403)
    const fulfiller = await signIn(await member(world.shopId, 'order_fulfiller'))
    assert.equal(
      await statusOf(send(fulfiller, 'GET', `/api/v1/seller/shops/${world.slug}/logistics`)),
      403
    )
    const options = await send(
      fulfiller,
      'GET',
      `/api/v1/seller/shops/${world.slug}/orders/${world.shopOrder.number}/courier-booking-options`
    )
    assert.equal(options.status, 200, options.text)
    assert.deepEqual(
      options.body.data.origin_branches.map((b: { name: string }) => b.name),
      ['TINKUNE']
    )
  })

  test('T-SEC-041 only a platform admin with step-up changes an account status', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const path = `/api/v1/admin/logistics/accounts/${world.accountId}/status`
    const body = { status: 'suspended', reason: 'Credentials reported leaked' }
    const agent = await signIn(await staffUser('support_agent'), minutesAgo(1))
    assert.equal(await statusOf(send(agent, 'POST', path, body)), 403)
    const stale = await signIn(await staffUser('platform_admin'), minutesAgo(60))
    const noStepUp = await send(stale, 'POST', path, body)
    assert.equal(noStepUp.status, 401)
    assert.equal(noStepUp.body.code, 'MFA_REQUIRED')
    const unverified = await signIn(await staffUser('platform_admin'))
    assert.equal(await statusOf(send(unverified, 'POST', path, body)), 401)
    const fresh = await signIn(await staffUser('platform_admin'), minutesAgo(1))
    const done = await send(fresh, 'POST', path, body)
    assert.equal(done.status, 200, done.text)
    assert.equal(done.body.data.status, 'suspended')
  })
})

test.group('T-SEC-040 courier credentials never leave the adapter', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SEC-040 no response, audit row, idempotency answer or job payload holds the token or its ciphertext', async ({
    assert,
  }) => {
    const { ownerId, slug, shopId } = await activeShop()
    const browser = await signIn(ownerId)
    const created = await send(
      browser,
      'POST',
      `/api/v1/seller/shops/${slug}/courier-accounts`,
      {
        provider_code: 'ncm',
        name: 'NCM Lalitpur',
        environment: 'sandbox',
        credentials: { token: NCM_TOKEN },
        password: OWNER_PASSWORD,
      },
      { 'Idempotency-Key': key() }
    )
    assert.equal(created.status, 201, created.text)
    const account = await db.from('logistics_accounts').where('shop_id', shopId).first()
    const settings = await send(browser, 'GET', `/api/v1/seller/shops/${slug}/logistics`)
    const audits = await db.from('audit_logs').where('shop_id', shopId)
    const answers = await db.from('idempotency_keys').where('actor_scope', ownerId)
    const jobs = await queued('logistics.verify_account')
    for (const text of [
      created.text,
      settings.text,
      JSON.stringify(audits),
      JSON.stringify(answers),
      JSON.stringify(jobs),
    ]) {
      assert.notInclude(text, NCM_TOKEN)
      assert.notInclude(text, account.credentials_enc)
    }
  })
})

test.group('T-FUL-112 the courier callback receiver', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  async function bookedParcel() {
    const world = await courierWorld()
    await db
      .from('shipments')
      .where('id', world.shipmentId)
      .update({
        status: 'booked',
        logistics_account_id: world.accountId,
        pickup_address_id: world.addressId,
        merchant_reference: `${world.shopOrder.number}-S1`,
        cod_amount_minor: 110000,
        external_shipment_id: '6100',
        booked_at: db.raw('now()'),
      })
    return world
  }

  const callback = (accountId: string, token: string | null, body: unknown, provider = 'ncm') => {
    const query = token === null ? '' : `?token=${encodeURIComponent(token)}`
    return fetch(`${serverUrl()}/api/v1/webhooks/couriers/${provider}/${accountId}${query}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  }

  const stored = (accountId: string) =>
    db.from('courier_events').where('logistics_account_id', accountId)

  test('T-FUL-112 a wrong token, an unknown account or another provider path gives 401 and stores nothing', async ({
    assert,
  }) => {
    const world = await bookedParcel()
    const event = { event: 'pickup_completed', order_id: 6100 }
    assert.equal(await statusOf(callback(world.accountId, 'wrong-token', event)), 401)
    assert.equal(await statusOf(callback(world.accountId, null, event)), 401)
    const unknown = '01a1fccb-0000-7000-8000-000000000000'
    assert.equal(await statusOf(callback(unknown, courierCallbackToken(unknown), event)), 401)
    assert.equal(
      await statusOf(
        callback(world.accountId, courierCallbackToken(world.accountId), event, 'other_courier')
      ),
      401
    )
    assert.lengthOf(await stored(world.accountId), 0)
  })

  test('T-FUL-112 a valid callback is stored once; a test event and a disabled account are answered 200 and not stored', async ({
    assert,
  }) => {
    const world = await bookedParcel()
    const token = courierCallbackToken(world.accountId)
    const ok = await callback(world.accountId, token, { event: 'pickup_completed', order_id: 6100 })
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { data: { received: true } })
    assert.equal(
      await statusOf(
        callback(world.accountId, token, { event: 'pickup_completed', order_id: 6100 })
      ),
      200
    )
    assert.lengthOf(await stored(world.accountId), 1)
    assert.equal(await statusOf(callback(world.accountId, token, { test: true })), 200)
    assert.lengthOf(await stored(world.accountId), 1)
    await db
      .from('logistics_accounts')
      .where('id', world.accountId)
      .update({
        status: 'disabled',
        credentials_enc: null,
        disabled_at: db.raw('now()'),
      })
    assert.equal(
      await statusOf(
        callback(world.accountId, token, { event: 'sent_for_delivery', order_id: 6100 })
      ),
      200
    )
    assert.lengthOf(await stored(world.accountId), 1)
  })

  test('T-FUL-112 a body over 64 KB gives 413', async ({ assert }) => {
    const world = await bookedParcel()
    const big = JSON.stringify({
      event: 'pickup_completed',
      order_id: 6100,
      padding: 'x'.repeat(70 * 1024),
    })
    const response = await callback(world.accountId, courierCallbackToken(world.accountId), big)
    assert.equal(response.status, 413)
    assert.lengthOf(await stored(world.accountId), 0)
  })

  test('T-FUL-112 webhook_ip throttles before the token; past courier_callback a valid callback gives 429', async ({
    assert,
  }) => {
    const world = await bookedParcel()
    const ipKeys = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].map((ip) =>
      rateLimitKey('webhook_ip', clientNetwork(ip))
    )
    for (const ipKey of ipKeys) await rateLimiter('webhook_ip').block(ipKey, '1 minute')
    try {
      assert.equal(await statusOf(callback(world.accountId, 'wrong-token', { event: 'x' })), 429)
    } finally {
      for (const ipKey of ipKeys) await rateLimiter('webhook_ip').delete(ipKey)
    }
    const accountKey = rateLimitKey('courier_callback', world.accountId)
    await rateLimiter('courier_callback').block(accountKey, '1 minute')
    try {
      const limited = await callback(world.accountId, courierCallbackToken(world.accountId), {
        event: 'pickup_completed',
        order_id: 6100,
      })
      assert.equal(limited.status, 429)
      assert.lengthOf(await stored(world.accountId), 0)
    } finally {
      await rateLimiter('courier_callback').delete(accountKey)
    }
  })

  test("T-FUL-112 the previous key's token is accepted during a rotation and refused after it", async ({
    assert,
  }) => {
    const world = await bookedParcel()
    const original = courierConfig.callbackKeys
    const originalActive = courierConfig.callbackActiveKeyId
    const oldToken = courierCallbackToken(world.accountId)
    const ring = new Map(original!.release())
    ring.set('next1', Buffer.alloc(32, 9))
    try {
      courierConfig.callbackKeys = new Secret(ring)
      courierConfig.callbackActiveKeyId = 'next1'
      assert.notEqual(courierCallbackToken(world.accountId), oldToken)
      assert.equal(
        await statusOf(
          callback(world.accountId, oldToken, { event: 'pickup_completed', order_id: 6100 })
        ),
        200
      )
      courierConfig.callbackKeys = new Secret(new Map([['next1', Buffer.alloc(32, 9)]]))
      assert.equal(
        await statusOf(
          callback(world.accountId, oldToken, { event: 'sent_for_delivery', order_id: 6100 })
        ),
        401
      )
    } finally {
      courierConfig.callbackKeys = original
      courierConfig.callbackActiveKeyId = originalActive
    }
  })
})

test.group('T-SEC-008 and T-API-003 on the admin courier lists', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SEC-008 a signed-in user without a staff row gets 404; stale MFA names verification_required', async ({
    assert,
  }) => {
    const customer = await insertUser()
    await db
      .from('users')
      .where('id', customer)
      .update({ status: 'active', email_verified_at: db.raw('now()') })
    const outsider = await signIn(customer, minutesAgo(1))
    const hidden = await send(outsider, 'GET', '/api/v1/admin/courier-bookings')
    assert.equal(hidden.status, 404)
    assert.equal(hidden.body.code, 'NOT_FOUND')
    const stale = await signIn(await staffUser('support_agent'), minutesAgo(13 * 60))
    const answer = await send(stale, 'GET', '/api/v1/admin/courier-bookings')
    assert.equal(answer.status, 401)
    assert.equal(answer.body.code, 'MFA_REQUIRED')
    assert.equal(answer.body.mfa, 'verification_required')
  })

  test('T-API-003 the booking queue pages with its cursor; a tampered cursor, a changed filter or an unknown parameter gives 400', async ({
    assert,
  }) => {
    const shipments: string[] = []
    for (let n = 0; n < 3; n++) {
      const world = await courierWorld()
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
      shipments.push(world.shipmentId)
    }
    const admin = await signIn(await staffUser('support_agent'), minutesAgo(1))
    const seen: string[] = []
    let cursor: string | null = null
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const query: string = cursor ? `&cursor=${cursor}` : ''
      const answer = await send(admin, 'GET', `/api/v1/admin/courier-bookings?limit=1${query}`)
      assert.equal(answer.status, 200, answer.text)
      assert.equal(answer.body.meta.limit, 1)
      seen.push(...answer.body.data.map((row: { id: string }) => row.id))
      cursor = answer.body.meta.next_cursor
      if (!cursor) break
    }
    const ours = seen.filter((id) => shipments.includes(id))
    assert.sameMembers(ours, shipments)
    assert.lengthOf(new Set(seen), seen.length, 'no row repeats')

    const first = await send(admin, 'GET', '/api/v1/admin/courier-bookings?limit=1')
    const next = first.body.meta.next_cursor as string
    const decoded = JSON.parse(Buffer.from(next, 'base64url').toString('utf8'))
    const forged = Buffer.from(JSON.stringify({ ...decoded, v: 2 })).toString('base64url')
    for (const query of [
      `cursor=${forged}`,
      'cursor=not-a-cursor',
      `queue=cancel_requested&cursor=${next}`,
      'limit=0',
      'limit=101',
      'queue=everything',
      'shop_id=x',
    ]) {
      const answer = await send(admin, 'GET', `/api/v1/admin/courier-bookings?${query}`)
      assert.equal(answer.status, 400, query)
      assert.equal(answer.body.code, 'INVALID_QUERY_PARAMETER', query)
    }
  })

  test('T-API-014 an API success is private and never stored', async ({ assert }) => {
    const admin = await signIn(await staffUser('support_agent'), minutesAgo(1))
    const answer = await send(admin, 'GET', '/api/v1/admin/courier-events')
    assert.equal(answer.status, 200)
    assert.equal(answer.headers.get('cache-control'), 'private, no-store')
  })

  test('T-SEC-001 a shop order number matches in any case; a partial pickup-address edit gives 422', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const browser = await signIn(world.ownerId)
    const options = await send(
      browser,
      'GET',
      `/api/v1/seller/shops/${world.slug}/orders/${world.shopOrder.number.toLowerCase()}/courier-booking-options`
    )
    assert.equal(options.status, 200, options.text)
    const labelOnly = await send(
      browser,
      'PATCH',
      `/api/v1/seller/shops/${world.slug}/pickup-addresses/${world.addressId}`,
      { label: 'Warehouse' }
    )
    assert.equal(labelOnly.status, 422)
  })
})
