import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { bookCourierShipment } from '#modules/orders/actions/book_courier_shipment'
import type { Actor } from '#modules/platform/actor'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import {
  activeShop,
  courierWorld,
  fakeCourier,
  insertNcmAccount,
  NCM_TOKEN,
  type CourierWorld,
  type FakeCourier,
} from '#tests/support/courier'
import { key, minutesAgo, send, signIn, staffUser, statusOf } from '#tests/support/courier_http'
import { queued, useJobBoss } from '#tests/support/jobs'

/*
 * The platform-owned NCM account of OD-58 (re-decided 2026-11-22; docs/05
 * §6.3, docs/06 §13.8, docs/04a §9.9–§9.11, §15.1). A shop with no active
 * account of its own may book on a platform-owned account that staff allow
 * it on; its own active account wins (`own_account_active`). Live COD on a
 * platform-owned account waits for `platform_account_cod_enabled`, seeded
 * false. T-SHOP-115 (settings), T-FUL-006 (booking) and T-SEC-041 (the
 * staff operations, with step-up), widened for platform mode.
 */

const COD_SWITCH = 'platform_account_cod_enabled'

async function setCodSwitch(enabled: boolean) {
  await db.rawQuery(
    `INSERT INTO platform_settings (key, value) VALUES (?, ?::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [COD_SWITCH, JSON.stringify(enabled)]
  )
}

async function insertPlatformAccount(values: Record<string, unknown> = {}) {
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'ncm',
      owner_type: 'platform',
      shop_id: null,
      name: 'DripNepal NCM',
      environment: 'sandbox',
      credentials_enc: encryptField(
        JSON.stringify({ token: NCM_TOKEN }),
        'logistics_accounts.credentials_enc'
      ),
      status: 'active',
      verified_at: db.raw('now()'),
      ...values,
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

// A courier world whose shop has no active account of its own and books on the platform's.
async function platformWorld() {
  const world = await courierWorld({ mode: 'manual' })
  await db.from('logistics_accounts').where('id', world.accountId).update({ status: 'pending' })
  const platformAccountId = await insertPlatformAccount()
  await allowShop(platformAccountId, world.shopId)
  await db.table('shop_logistics_settings').insert({
    shop_id: world.shopId,
    fulfillment_mode: 'platform',
    default_account_id: platformAccountId,
    default_account_owner_type: 'platform',
  })
  return { world, platformAccountId }
}

const vendor = (world: CourierWorld): Actor => ({
  type: 'shop_member',
  userId: world.ownerId,
  role: `shop:${world.shopId}:owner`,
  requestId: null,
})

function bookOn(world: CourierWorld, accountId: string) {
  return bookCourierShipment(
    {
      shopId: world.shopId,
      shopOrderNumber: world.shopOrder.number,
      accountId,
      pickupAddressId: world.addressId,
      serviceCode: 'Door2Door',
      originBranchId: world.originBranchId,
      destinationBranchId: world.destinationBranchId,
    },
    { actor: vendor(world), idempotency: null, present: (shipment) => shipment }
  )
}

async function refusal(work: Promise<unknown>) {
  return work.then(
    () => null,
    (error) => error as { code: string; options?: { errors?: { field: string; code: string }[] } }
  )
}

test.group('T-SHOP-115 the platform mode of the logistics settings (OD-58)', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SHOP-115 a shop with no active account of its own saves the platform mode with an allowed account', async ({
    assert,
  }) => {
    const { ownerId, shopId, slug } = await activeShop()
    const platformAccountId = await insertPlatformAccount()
    await allowShop(platformAccountId, shopId)
    const browser = await signIn(ownerId)
    const base = `/api/v1/seller/shops/${slug}/logistics`
    const saved = await send(
      browser,
      'PUT',
      base,
      { fulfillment_mode: 'platform', default_account_id: platformAccountId },
      { 'If-Match': '"0"' }
    )
    assert.equal(saved.status, 200, saved.text)
    assert.equal(saved.body.data.fulfillment_mode, 'platform')
    const row = await db.from('shop_logistics_settings').where('shop_id', shopId).first()
    assert.equal(row.default_account_owner_type, 'platform')
    // The owner sees the platform account, but never its callback URL (staff register it).
    const shown = await send(browser, 'GET', base)
    const listed = shown.body.data.accounts.find((a: { id: string }) => a.id === platformAccountId)
    assert.equal(listed.owner_type, 'platform')
    assert.isNull(listed.callback_url)
  })

  test('T-SHOP-115 the platform mode is refused to a shop with an active account of its own, without an account, or with one not allowed', async ({
    assert,
  }) => {
    const { ownerId, shopId, slug } = await activeShop()
    const platformAccountId = await insertPlatformAccount()
    await allowShop(platformAccountId, shopId)
    const notAllowed = await insertPlatformAccount({ name: 'DripNepal NCM 2' })
    const browser = await signIn(ownerId)
    const base = `/api/v1/seller/shops/${slug}/logistics`
    const put = (body: Record<string, unknown>) =>
      send(browser, 'PUT', base, body, { 'If-Match': '"0"' })

    const noAccount = await put({ fulfillment_mode: 'platform' })
    assert.equal(noAccount.status, 422)
    assert.deepInclude(noAccount.body.errors[0], { field: 'default_account_id', code: 'required' })
    const foreign = await put({ fulfillment_mode: 'platform', default_account_id: notAllowed })
    assert.equal(foreign.status, 422)
    assert.equal(foreign.body.errors[0].code, 'account_not_usable')
    const wrongMode = await put({
      fulfillment_mode: 'vendor',
      default_account_id: platformAccountId,
    })
    assert.equal(wrongMode.status, 422)
    assert.equal(wrongMode.body.errors[0].code, 'account_not_usable')

    await insertNcmAccount(shopId)
    const ownWins = await put({
      fulfillment_mode: 'platform',
      default_account_id: platformAccountId,
    })
    assert.equal(ownWins.status, 422)
    assert.deepInclude(ownWins.body.errors[0], {
      field: 'fulfillment_mode',
      code: 'own_account_active',
    })
    assert.isNull(await db.from('shop_logistics_settings').where('shop_id', shopId).first())
  })
})

test.group('T-FUL-006 booking on a platform-owned account (OD-58)', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-FUL-006 a COD booking on a platform-owned account answers 409 while the switch is off, and writes nothing', async ({
    assert,
  }) => {
    const { world, platformAccountId } = await platformWorld()
    await setCodSwitch(false)
    const error = await refusal(bookOn(world, platformAccountId))
    assert.equal(error?.code, 'INVALID_STATE_TRANSITION')
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(shipment.status, 'pending')
    assert.isNull(shipment.logistics_account_id)
    assert.lengthOf(await queued('orders.book_courier_shipment'), 0)
  })

  test('T-FUL-006 with the switch on, the platform-owned account books the parcel', async ({
    assert,
  }) => {
    const { world, platformAccountId } = await platformWorld()
    await setCodSwitch(true)
    await bookOn(world, platformAccountId)
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(shipment.status, 'booking_requested')
    assert.equal(shipment.logistics_account_id, platformAccountId)
    assert.equal(Number(shipment.cod_amount_minor), 110000)
    assert.lengthOf(await queued('orders.book_courier_shipment'), 1)
  })

  test('T-FUL-006 a shop whose own account became active is refused the platform-owned account', async ({
    assert,
  }) => {
    const { world, platformAccountId } = await platformWorld()
    await setCodSwitch(true)
    await db.from('logistics_accounts').where('id', world.accountId).update({ status: 'active' })
    const error = await refusal(bookOn(world, platformAccountId))
    assert.equal(error?.code, 'VALIDATION_FAILED')
    assert.deepInclude(error?.options?.errors?.[0], {
      field: 'account_id',
      code: 'own_account_active',
    })
  })

  test('T-FUL-006 the booking form offers the platform-owned account in platform mode, and nothing once an own account is active', async ({
    assert,
  }) => {
    const { world, platformAccountId } = await platformWorld()
    const browser = await signIn(world.ownerId)
    const path = `/api/v1/seller/shops/${world.slug}/orders/${world.shopOrder.number}/courier-booking-options`
    const offered = await send(browser, 'GET', path)
    assert.equal(offered.status, 200, offered.text)
    assert.deepEqual(
      offered.body.data.accounts.map((a: { id: string }) => a.id),
      [platformAccountId]
    )
    assert.equal(offered.body.data.account_id, platformAccountId)
    await db.from('logistics_accounts').where('id', world.accountId).update({ status: 'active' })
    const none = await send(browser, 'GET', path)
    assert.deepEqual(none.body.data.accounts, [])
    assert.isNull(none.body.data.account_id)
  })
})

test.group('T-SEC-041 the platform-owned account operations (OD-58)', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  const createBody = {
    provider_code: 'ncm',
    name: 'DripNepal NCM',
    environment: 'sandbox',
    external_account_ref: null,
    credentials: { token: NCM_TOKEN },
  }

  test('T-SEC-041 only a platform admin with step-up creates a platform-owned account; a replay answers the same', async ({
    assert,
  }) => {
    const path = '/api/v1/admin/logistics/accounts'
    const agent = await signIn(await staffUser('support_agent'), minutesAgo(1))
    assert.equal(
      await statusOf(send(agent, 'POST', path, createBody, { 'Idempotency-Key': key() })),
      403
    )
    const stale = await signIn(await staffUser('platform_admin'), minutesAgo(60))
    const noStepUp = await send(stale, 'POST', path, createBody, { 'Idempotency-Key': key() })
    assert.equal(noStepUp.status, 401)
    assert.equal(noStepUp.body.code, 'MFA_REQUIRED')

    const admin = await signIn(await staffUser('platform_admin'), minutesAgo(1))
    assert.equal(await statusOf(send(admin, 'POST', path, createBody)), 400, 'the key is required')
    const idempotencyKey = key()
    const created = await send(admin, 'POST', path, createBody, {
      'Idempotency-Key': idempotencyKey,
    })
    assert.equal(created.status, 201, created.text)
    assert.include(created.body.data, { owner_type: 'platform', status: 'pending' })
    assert.notInclude(created.text, NCM_TOKEN)
    const row = await db.from('logistics_accounts').where('id', created.body.data.id).first()
    assert.equal(row.owner_type, 'platform')
    assert.isNull(row.shop_id)
    assert.lengthOf(await queued('logistics.verify_account'), 1)
    const audit = await db
      .from('audit_logs')
      .where({ action: 'logistics_account.create', subject_id: row.id })
      .first()
    assert.isNotNull(audit)
    const replay = await send(admin, 'POST', path, createBody, {
      'Idempotency-Key': idempotencyKey,
    })
    assert.equal(replay.status, 201)
    assert.equal(replay.body.data.id, created.body.data.id)
    assert.lengthOf(await db.from('logistics_accounts').where('owner_type', 'platform'), 1)
  })

  test('T-SEC-041 re-keying a platform-owned account needs If-Match; a stale version gives 412; a shop-owned account answers 404', async ({
    assert,
  }) => {
    const accountId = await insertPlatformAccount()
    const admin = await signIn(await staffUser('platform_admin'), minutesAgo(1))
    const path = `/api/v1/admin/logistics/accounts/${accountId}/credentials`
    const body = { credentials: { token: `${NCM_TOKEN}-new` } }
    assert.equal(await statusOf(send(admin, 'POST', path, body)), 428)
    // An account starts at version 1 (docs/04a §9.9).
    const stale = await send(admin, 'POST', path, body, { 'If-Match': '"9"' })
    assert.equal(stale.status, 412)
    const done = await send(admin, 'POST', path, body, { 'If-Match': '"1"' })
    assert.equal(done.status, 200, done.text)
    assert.equal(done.body.data.status, 'pending')
    assert.equal(done.headers.get('etag'), '"2"')
    assert.lengthOf(await queued('logistics.verify_account'), 1)

    const { shopId } = await activeShop()
    const shopOwned = await insertNcmAccount(shopId)
    const notPlatform = await send(
      admin,
      'POST',
      `/api/v1/admin/logistics/accounts/${shopOwned}/credentials`,
      body,
      { 'If-Match': '"1"' }
    )
    assert.equal(notPlatform.status, 404)
    const disabled = await insertPlatformAccount({
      status: 'disabled',
      credentials_enc: null,
      disabled_at: db.raw('now()'),
    })
    const gone = await send(
      admin,
      'POST',
      `/api/v1/admin/logistics/accounts/${disabled}/credentials`,
      body,
      { 'If-Match': '"1"' }
    )
    assert.equal(gone.status, 409)
  })

  test('T-SEC-041 staff allow a shop on a platform-owned account and remove it; the shop returns to manual', async ({
    assert,
  }) => {
    const accountId = await insertPlatformAccount()
    const { shopId } = await activeShop()
    const admin = await signIn(await staffUser('platform_admin'), minutesAgo(1))
    const path = `/api/v1/admin/logistics/accounts/${accountId}/shops/${shopId}`
    const agent = await signIn(await staffUser('support_agent'), minutesAgo(1))
    assert.equal(await statusOf(send(agent, 'PUT', path)), 403)

    const allowed = await send(admin, 'PUT', path)
    assert.equal(allowed.status, 200, allowed.text)
    assert.include(allowed.body.data, { account_id: accountId, shop_id: shopId, is_active: true })
    assert.equal(await statusOf(send(admin, 'PUT', path)), 200, 'allowing twice changes nothing')
    const audits = await db
      .from('audit_logs')
      .where({ action: 'logistics_account_shop.allow', subject_id: accountId })
    assert.lengthOf(audits, 1)

    await db.table('shop_logistics_settings').insert({
      shop_id: shopId,
      fulfillment_mode: 'platform',
      default_account_id: accountId,
      default_account_owner_type: 'platform',
    })
    assert.equal(await statusOf(send(admin, 'DELETE', path)), 204)
    const link = await db
      .from('logistics_account_shops')
      .where({ account_id: accountId, shop_id: shopId })
      .first()
    assert.isFalse(link.is_active)
    const settings = await db.from('shop_logistics_settings').where('shop_id', shopId).first()
    assert.equal(settings.fulfillment_mode, 'manual')
    assert.isNull(settings.default_account_id)
    assert.equal(await statusOf(send(admin, 'DELETE', path)), 204, 'removing twice changes nothing')
    assert.lengthOf(
      await db
        .from('audit_logs')
        .where({ action: 'logistics_account_shop.remove', subject_id: accountId }),
      1
    )
    // Allowing again reactivates the row.
    const again = await send(admin, 'PUT', path)
    assert.isTrue(again.body.data.is_active)
  })

  test('T-SEC-041 a disabled account, a shop-owned account or an unknown shop is refused', async ({
    assert,
  }) => {
    const admin = await signIn(await staffUser('platform_admin'), minutesAgo(1))
    const { shopId } = await activeShop()
    const disabled = await insertPlatformAccount({
      status: 'disabled',
      credentials_enc: null,
      disabled_at: db.raw('now()'),
    })
    assert.equal(
      await statusOf(
        send(admin, 'PUT', `/api/v1/admin/logistics/accounts/${disabled}/shops/${shopId}`)
      ),
      409
    )
    const shopOwned = await insertNcmAccount(shopId)
    assert.equal(
      await statusOf(
        send(admin, 'PUT', `/api/v1/admin/logistics/accounts/${shopOwned}/shops/${shopId}`)
      ),
      404
    )
    const accountId = await insertPlatformAccount()
    const unknownShop = '00000000-0000-7000-8000-000000000000'
    assert.equal(
      await statusOf(
        send(admin, 'PUT', `/api/v1/admin/logistics/accounts/${accountId}/shops/${unknownShop}`)
      ),
      404
    )
  })
})
