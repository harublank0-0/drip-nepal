import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { CourierBranch } from '#modules/logistics/providers/courier_provider'
import { syncBranches } from '#modules/logistics/jobs/sync_branches'
import { verifyAccount } from '#modules/logistics/jobs/verify_account'
import {
  rekeyShopCourierAccount,
  setLogisticsAccountStatus,
} from '#modules/logistics/actions/courier_accounts'
import { bookCourierShipment } from '#modules/orders/actions/book_courier_shipment'
import { accountHasUnfinishedShipments } from '#modules/orders/queries'
import { bookCourierShipmentJob } from '#modules/orders/jobs/book_courier_shipment'
import {
  pollCourierStatuses,
  sweepCourierBookings,
  sweepCourierEvents,
} from '#modules/orders/jobs/courier_schedules'
import { processCourierEventJob } from '#modules/orders/jobs/process_courier_event'
import { resolveCourierEvent } from '#modules/orders/actions/courier_bookings'
import { claimBookingAttempt } from '#modules/logistics/actions/booking_attempts'
import type { Actor } from '#modules/platform/actor'
import {
  activeShop,
  courierWorld,
  fakeCourier,
  insertNcmAccount,
  NCM_TOKEN,
  notOwnShop,
  type CourierWorld,
  type FakeCourier,
} from '#tests/support/courier'
import { FIRST_TRY, queued, useJobBoss } from '#tests/support/jobs'
import { insertLocation, insertUser } from '#tests/support/schema_rows'

/*
 * The M6 courier jobs one by one (docs/04a §9.9–§9.14, docs/05 §6.3):
 * T-SHOP-114 (branch sync), T-SHOP-116 (account verification and status, the
 * account side of an `auth_failed`) and T-FUL-113 (the booking and event
 * sweepers and the status poll). The courier is scripted.
 */

const branch = (name: string, values: Partial<CourierBranch> = {}): CourierBranch => ({
  name,
  externalBranchId: null,
  code: null,
  courierDistrict: null,
  coveredAreas: null,
  phone: null,
  ...values,
})

const branchRows = () => db.from('logistics_branches').where('provider_code', 'ncm').orderBy('name')

const owner = (shopId: string, userId: string): Actor => ({
  type: 'shop_member',
  userId,
  role: `shop:${shopId}:owner`,
  requestId: null,
})

const admin = async (): Promise<Actor> => ({
  type: 'platform_staff',
  userId: await insertUser(),
  role: 'platform:platform_admin',
  requestId: null,
})

// A member of a value read asynchronously (lint: no member access on an await expression).
async function pick<T, K extends keyof T>(value: Promise<T>, member: K) {
  const resolved = await value
  return resolved[member]
}

async function accountRow(id: string) {
  return db.from('logistics_accounts').where('id', id).first()
}

test.group('T-SHOP-114 logistics_branches sync', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SHOP-114 syncing the same list twice changes nothing', async ({ assert }) => {
    const { shopId } = await activeShop()
    await insertNcmAccount(shopId)
    courier.script.branches = [
      branch('TINKUNE', { externalBranchId: '101', code: 'TINK1' }),
      branch('POKHARA', { externalBranchId: '102', code: 'PKR1' }),
    ]
    const first = await syncBranches({ provider_code: 'ncm' })
    assert.deepEqual(first, {
      kind: 'synced',
      inserted: 2,
      updated: 0,
      deactivated: 0,
      reactivated: 0,
    })
    const before = await branchRows()
    const second = await syncBranches({ provider_code: 'ncm' })
    assert.deepEqual(second, {
      kind: 'synced',
      inserted: 0,
      updated: 0,
      deactivated: 0,
      reactivated: 0,
    })
    const after = await branchRows()
    assert.deepEqual(
      after.map((row) => [row.id, row.name, row.external_branch_id, row.is_active]),
      before.map((row) => [row.id, row.name, row.external_branch_id, row.is_active])
    )
  })

  test('T-SHOP-114 a missing branch becomes inactive and is reactivated when it returns', async ({
    assert,
  }) => {
    const { shopId } = await activeShop()
    await insertNcmAccount(shopId)
    const all = ['A', 'B', 'C'].map((name, i) =>
      branch(`BRANCH ${name}`, { externalBranchId: `${200 + i}` })
    )
    courier.script.branches = all
    await syncBranches({ provider_code: 'ncm' })
    courier.script.branches = all.slice(0, 2)
    const without = await syncBranches({ provider_code: 'ncm' })
    assert.equal(without.kind === 'synced' && without.deactivated, 1)
    const inactive = await db.from('logistics_branches').where('name', 'BRANCH C').first()
    assert.isFalse(inactive.is_active)
    courier.script.branches = all
    const back = await syncBranches({ provider_code: 'ncm' })
    assert.equal(back.kind === 'synced' && back.reactivated, 1)
    const active = await db.from('logistics_branches').where('name', 'BRANCH C').first()
    assert.equal(active.id, inactive.id, 'the same row returns')
    assert.isTrue(active.is_active)
  })

  test('T-SHOP-114 a failed call, an empty list, a mass deactivation or a name clash changes nothing', async ({
    assert,
  }) => {
    const { shopId } = await activeShop()
    await insertNcmAccount(shopId)
    const all = ['A', 'B', 'C', 'D'].map((name, i) =>
      branch(`BRANCH ${name}`, { externalBranchId: `${300 + i}` })
    )
    courier.script.branches = all
    await syncBranches({ provider_code: 'ncm' })
    const before = await branchRows()
    courier.script.branchesResult = {
      ok: false,
      error: { code: 'timeout', httpStatus: null, fields: [], retryable: false },
    }
    assert.deepEqual(await syncBranches({ provider_code: 'ncm' }), {
      kind: 'refused',
      reason: 'call_failed',
    })
    courier.script.branchesResult = null
    courier.script.branches = []
    assert.deepEqual(await syncBranches({ provider_code: 'ncm' }), {
      kind: 'refused',
      reason: 'empty_list',
    })
    courier.script.branches = all.slice(0, 1)
    assert.deepEqual(await syncBranches({ provider_code: 'ncm' }), {
      kind: 'refused',
      reason: 'mass_deactivation',
    })
    courier.script.branches = [...all.slice(0, 3), branch('BRANCH D', { externalBranchId: '999' })]
    assert.deepEqual(await syncBranches({ provider_code: 'ncm' }), {
      kind: 'refused',
      reason: 'name_clash',
    })
    const after = await branchRows()
    assert.deepEqual(
      after.map((row) => [row.name, row.external_branch_id, row.is_active]),
      before.map((row) => [row.name, row.external_branch_id, row.is_active])
    )
  })

  test('T-SHOP-114 with no active account the sync stops; district_code is filled only while null', async ({
    assert,
  }) => {
    courier.script.branches = [branch('TINKUNE', { courierDistrict: 'Kathmandu' })]
    assert.deepEqual(await syncBranches({ provider_code: 'ncm' }), {
      kind: 'refused',
      reason: 'no_active_account',
    })
    const { shopId } = await activeShop()
    await insertNcmAccount(shopId)
    await insertLocation()
    await syncBranches({ provider_code: 'ncm' })
    const filled = await db.from('logistics_branches').where('name', 'TINKUNE').first()
    assert.equal(filled.district_code, '306')
    // Staff set another district by hand: the sync leaves a set value.
    await db
      .table('districts')
      .insert({ code: '399', province_code: '3', name_en: 'Elsewhere', name_ne: 'अन्यत्र' })
    await db.from('logistics_branches').where('id', filled.id).update({ district_code: '399' })
    await syncBranches({ provider_code: 'ncm' })
    const kept = await db.from('logistics_branches').where('id', filled.id).first()
    assert.equal(kept.district_code, '399')
  })

  test("T-SHOP-114 a shipment cannot name another courier's branch", async ({ assert }) => {
    const world: CourierWorld = await courierWorld()
    await db
      .table('logistics_providers')
      .insert({ code: 'test_courier', name: 'Test Courier', is_active: true })
      .onConflict('code')
      .ignore()
    const [foreign] = await db
      .table('logistics_branches')
      .insert({ provider_code: 'test_courier', name: 'FOREIGN BRANCH' })
      .returning('id')
    const error = await bookCourierShipment(
      {
        shopId: world.shopId,
        shopOrderNumber: world.shopOrder.number,
        accountId: world.accountId,
        pickupAddressId: world.addressId,
        serviceCode: 'Door2Door',
        originBranchId: foreign.id,
        destinationBranchId: world.destinationBranchId,
      },
      { actor: owner(world.shopId, world.ownerId), idempotency: null, present: (s) => s }
    ).then(
      () => null,
      (e) => e
    )
    assert.equal(error?.problemCode, 'VALIDATION_FAILED')
    assert.equal(error?.options.errors?.[0]?.code, 'branch_not_usable')
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(shipment.status, 'pending')
  })
})

test.group('T-SHOP-116 courier account verification and status', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-SHOP-116 the test call activates a pending account; refused credentials make it invalid', async ({
    assert,
  }) => {
    const { shopId } = await activeShop()
    const good = await insertNcmAccount(shopId, { status: 'pending', verified_at: null })
    assert.equal(await verifyAccount({ account_id: good, version: 1 }), 'active')
    const activated = await accountRow(good)
    assert.isNotNull(activated.verified_at)
    assert.equal(activated.version, 2)
    const listCall = courier.calls.find((c) => c.method === 'listAssignedBranches')
    assert.equal(listCall?.token, NCM_TOKEN)

    const other = await activeShop()
    const bad = await insertNcmAccount(other.shopId, { status: 'pending', verified_at: null })
    courier.script.assignedError = 'auth_failed'
    assert.equal(await verifyAccount({ account_id: bad, version: 1 }), 'invalid')
    assert.equal(await pick(accountRow(bad), 'status'), 'invalid')
  })

  test('T-SHOP-116 a timeout leaves the account pending for a retry; a stale version changes nothing', async ({
    assert,
  }) => {
    const { shopId } = await activeShop()
    const id = await insertNcmAccount(shopId, { status: 'pending', verified_at: null })
    courier.script.assignedError = 'timeout'
    await assert.rejects(() => verifyAccount({ account_id: id, version: 1 }))
    assert.equal(await pick(accountRow(id), 'status'), 'pending')
    courier.script.assignedError = null
    assert.equal(await verifyAccount({ account_id: id, version: 7 }), 'stale')
    assert.equal(await pick(accountRow(id), 'status'), 'pending')
  })

  test('T-SHOP-116 a booking refused for its credentials makes the account invalid', async ({
    assert,
  }) => {
    const world = await courierWorld()
    courier.script.book.push({
      outcome: 'refused',
      error: { code: 'auth_failed', httpStatus: 401, fields: [], retryable: false },
    })
    await bookCourierShipment(
      {
        shopId: world.shopId,
        shopOrderNumber: world.shopOrder.number,
        accountId: world.accountId,
        pickupAddressId: world.addressId,
        serviceCode: 'Door2Door',
        originBranchId: world.originBranchId,
        destinationBranchId: world.destinationBranchId,
      },
      { actor: owner(world.shopId, world.ownerId), idempotency: null, present: (s) => s }
    )
    const outcome = await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    assert.equal(outcome, 'booking_failed')
    assert.equal(await pick(accountRow(world.accountId), 'status'), 'invalid')
  })

  test('T-SHOP-116 a re-key sends an invalid account back to pending, but a suspended one stays suspended', async ({
    assert,
  }) => {
    const { shopId, ownerId } = await activeShop()
    const invalid = await insertNcmAccount(shopId, { status: 'invalid' })
    const rekeyed = await rekeyShopCourierAccount(
      {
        shopId,
        accountId: invalid,
        credentials: { token: 'a-new-token-123456' },
        expectedVersion: 1,
      },
      { actor: owner(shopId, ownerId), present: (a) => a }
    )
    assert.equal(rekeyed.status, 'pending')
    const jobs = await queued<{ account_id: string }>('logistics.verify_account')
    assert.isTrue(jobs.some((job) => job.data.account_id === invalid))

    const other = await activeShop()
    const suspended = await insertNcmAccount(other.shopId)
    await setLogisticsAccountStatus(
      { accountId: suspended, status: 'suspended', reason: 'Reported leaked' },
      {
        actor: await admin(),
        ownShop: notOwnShop,
        unfinishedShipments: accountHasUnfinishedShipments,
        present: (a) => a,
      }
    )
    const version = await pick(accountRow(suspended), 'version')
    const kept = await rekeyShopCourierAccount(
      {
        shopId: other.shopId,
        accountId: suspended,
        credentials: { token: 'another-token-12345' },
        expectedVersion: version,
      },
      { actor: owner(other.shopId, other.ownerId), present: (a) => a }
    )
    assert.equal(kept.status, 'suspended')
    const after = await queued<{ account_id: string }>('logistics.verify_account')
    assert.isFalse(
      after.some((job) => job.data.account_id === suspended),
      'no test call for a suspended account'
    )
  })

  test('T-SHOP-116 staff suspend an account, which then cannot book, and send it back to pending for a new test call', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const actor = await admin()
    const context = {
      actor,
      ownShop: notOwnShop,
      unfinishedShipments: accountHasUnfinishedShipments,
      present: (a: unknown) => a,
    }
    await setLogisticsAccountStatus(
      { accountId: world.accountId, status: 'suspended', reason: 'Investigating' },
      context
    )
    assert.equal(await pick(accountRow(world.accountId), 'status'), 'suspended')
    // 04a §9.9: a suspended account keeps its rows and the shop's default; the booking refuses it.
    const settings = await db.from('shop_logistics_settings').where('shop_id', world.shopId).first()
    assert.deepEqual(
      [settings.fulfillment_mode, settings.default_account_id],
      ['vendor', world.accountId]
    )
    const refusal = await bookCourierShipment(
      {
        shopId: world.shopId,
        shopOrderNumber: world.shopOrder.number,
        accountId: world.accountId,
        pickupAddressId: world.addressId,
        serviceCode: 'Door2Door',
        originBranchId: world.originBranchId,
        destinationBranchId: world.destinationBranchId,
      },
      { actor: owner(world.shopId, world.ownerId), idempotency: null, present: (s) => s }
    ).then(
      () => null,
      (e) => e
    )
    assert.equal(refusal?.options.errors?.[0]?.code, 'account_not_usable')
    await setLogisticsAccountStatus(
      { accountId: world.accountId, status: 'pending', reason: 'Cleared' },
      context
    )
    const row = await accountRow(world.accountId)
    assert.equal(row.status, 'pending')
    const jobs = await queued<{ account_id: string; version: number }>('logistics.verify_account')
    assert.isTrue(
      jobs.some(
        (job) => job.data.account_id === world.accountId && job.data.version === row.version
      )
    )
    const audit = await db.from('audit_logs').where({ subject_id: world.accountId }).orderBy('id')
    assert.deepEqual(
      audit.map((entry) => entry.action),
      ['logistics_account.status_change', 'logistics_account.status_change']
    )
  })
})

test.group('T-FUL-113 the courier sweepers and the status poll', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  async function requested() {
    const world = await courierWorld()
    await bookCourierShipment(
      {
        shopId: world.shopId,
        shopOrderNumber: world.shopOrder.number,
        accountId: world.accountId,
        pickupAddressId: world.addressId,
        serviceCode: 'Door2Door',
        originBranchId: world.originBranchId,
        destinationBranchId: world.destinationBranchId,
      },
      { actor: owner(world.shopId, world.ownerId), idempotency: null, present: (s) => s }
    )
    return world
  }

  // In the test's transaction now() stands still: an age of -1 s makes every row old enough.
  const OLD = -1

  test('T-FUL-113 a claim whose worker vanished becomes unknown and the shipment needs reconciliation', async ({
    assert,
  }) => {
    const world = await requested()
    await db.transaction((trx) =>
      claimBookingAttempt(trx, {
        shipmentId: world.shipmentId,
        shopId: world.shopId,
        accountId: world.accountId,
        kind: 'book',
        requestId: null,
      })
    )
    const fresh = await sweepCourierBookings(null)
    assert.equal(fresh.unresolved, 0, 'a young claim is left alone')
    const swept = await sweepCourierBookings(null, OLD)
    assert.equal(swept.unresolved, 1)
    const attempt = await db
      .from('shipment_booking_attempts')
      .where('shipment_id', world.shipmentId)
      .first()
    assert.equal(attempt.outcome, 'unknown')
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(shipment.status, 'needs_reconciliation')
    assert.lengthOf(
      courier.calls.filter((c) => c.method === 'book'),
      0,
      'the sweeper never calls the courier'
    )
  })

  test('T-FUL-113 a booking whose job was lost, or whose retries died after a retryable refusal, is sent again', async ({
    assert,
  }) => {
    const world = await requested()
    const before = await queued('orders.book_courier_shipment')
    const young = await sweepCourierBookings(null)
    assert.equal(young.resent, 0)
    const swept = await sweepCourierBookings(null, undefined, OLD)
    assert.equal(swept.resent, 1)
    assert.lengthOf(await queued('orders.book_courier_shipment'), before.length + 1)
    // A retryable refusal leaves it waiting with a finished attempt; if the queue's retries die
    // too, the sweeper is its way out, so it sends the job again.
    courier.script.book.push({
      outcome: 'refused',
      error: { code: 'rate_limited', httpStatus: 429, fields: [], retryable: true },
    })
    await assert.rejects(() =>
      bookCourierShipmentJob({ shipment_id: world.shipmentId, shop_id: world.shopId }, FIRST_TRY)
    )
    const waiting = await db.from('shipments').where('id', world.shipmentId).first()
    assert.equal(waiting.status, 'booking_requested')
    const afterRefusal = await sweepCourierBookings(null, undefined, OLD)
    assert.equal(afterRefusal.resent, 1)
  })

  test('T-FUL-113 a booking with a claim in flight is not sent again', async ({ assert }) => {
    const world = await requested()
    await db.transaction((trx) =>
      claimBookingAttempt(trx, {
        shipmentId: world.shipmentId,
        shopId: world.shopId,
        accountId: world.accountId,
        kind: 'book',
        requestId: null,
      })
    )
    const swept = await sweepCourierBookings(null, undefined, OLD)
    assert.equal(swept.resent, 0)
  })

  test('T-FUL-111 a job that finds an earlier attempt succeeded makes no courier call', async ({
    assert,
  }) => {
    // The state a second job meets when it read the shipment just before the first job finished.
    const world = await requested()
    await db.table('shipment_booking_attempts').insert({
      shipment_id: world.shipmentId,
      shop_id: world.shopId,
      logistics_account_id: world.accountId,
      kind: 'book',
      attempt_no: 1,
      outcome: 'succeeded',
      external_shipment_id: '7777',
      finished_at: db.raw('now()'),
    })
    const outcome = await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    assert.equal(outcome, 'not_waiting')
    assert.lengthOf(
      courier.calls.filter((c) => c.method === 'book'),
      0
    )
    assert.lengthOf(
      await db.from('shipment_booking_attempts').where('shipment_id', world.shipmentId),
      1
    )
  })

  test('T-FUL-113 a job the sweeper sends closes every open trigger of the shipment', async ({
    assert,
  }) => {
    const world = await requested()
    await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    const { external_shipment_id: externalId } = await db
      .from('shipments')
      .where('id', world.shipmentId)
      .first()
    courier.script.statuses.set(externalId, 'Pickup Order Created')
    await pollCourierStatuses(null)
    courier.script.history.set(externalId, [])
    await processCourierEventJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId, courier_event_id: null },
      FIRST_TRY
    )
    const open = await db
      .from('courier_events')
      .where('shipment_id', world.shipmentId)
      .whereIn('processing_status', ['pending', 'failed'])
    assert.lengthOf(open, 0, 'the poll trigger was answered by the history read')
    assert.equal(await pick(sweepCourierEvents(null, OLD), 'resent'), 0)
  })

  test('T-FUL-113 a shipment with a held reading is not swept and its job reads no history; after the hold it is swept again', async ({
    assert,
  }) => {
    const world = await requested()
    await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    const { external_shipment_id: externalId } = await db
      .from('shipments')
      .where('id', world.shipmentId)
      .first()
    const base = {
      logistics_account_id: world.accountId,
      external_shipment_id: externalId,
      shipment_id: world.shipmentId,
      shop_id: world.shopId,
      source: 'history',
      payload: { status: 'x' },
    }
    await db.table('courier_events').insert([
      {
        ...base,
        event_key: `history:${externalId}:held`,
        raw_status: 'Teleported',
        processing_status: 'held',
        processed_at: db.raw('now()'),
        hold_reason: 'unmapped_status',
      },
      { ...base, event_key: `history:${externalId}:later`, raw_status: 'Pickup Complete' },
      {
        ...base,
        source: 'poll',
        event_key: `poll:${externalId}:during-hold`,
        raw_status: 'Delivered',
      },
    ])
    assert.equal(await pick(sweepCourierEvents(null, OLD), 'resent'), 0)
    const historyCalls = () => courier.calls.filter((c) => c.method === 'getStatusHistory').length
    const before = historyCalls()
    const outcome = await processCourierEventJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId, courier_event_id: null },
      FIRST_TRY
    )
    assert.equal(outcome, 'held_earlier')
    assert.equal(historyCalls(), before, 'no courier call while held')
    // The trigger that arrived during the hold stays open, so once staff resolve the hold the
    // sweeper keeps the shipment moving even if the resolution's own job fails.
    const trigger = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, source: 'poll' })
      .first()
    assert.equal(trigger.processing_status, 'pending')
    const held = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, processing_status: 'held' })
      .first()
    await resolveCourierEvent(
      { eventId: held.id, status: 'ignored', note: 'NCM internal label' },
      { actor: await admin(), ownShop: notOwnShop }
    )
    assert.equal(await pick(sweepCourierEvents(null, OLD), 'resent'), 1)
  })

  test('T-FUL-113 an open courier event gets its job sent again once it is old', async ({
    assert,
  }) => {
    const world = await requested()
    await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    const shipment = await db.from('shipments').where('id', world.shipmentId).first()
    await db.table('courier_events').insert({
      logistics_account_id: world.accountId,
      source: 'poll',
      event_key: `poll:${shipment.external_shipment_id}:test`,
      external_shipment_id: shipment.external_shipment_id,
      shipment_id: world.shipmentId,
      shop_id: world.shopId,
      raw_status: 'Pickup Complete',
      payload: { status: 'Pickup Complete' },
    })
    assert.equal(await pick(sweepCourierEvents(null), 'resent'), 0)
    assert.equal(await pick(sweepCourierEvents(null, OLD), 'resent'), 1)
    const jobs = await queued<{ shipment_id: string }>('orders.process_courier_event')
    assert.isTrue(jobs.some((job) => job.data.shipment_id === world.shipmentId))
  })

  test('T-FUL-113 the poll sends a job only for a label it has not seen', async ({ assert }) => {
    const world = await requested()
    await bookCourierShipmentJob(
      { shipment_id: world.shipmentId, shop_id: world.shopId },
      FIRST_TRY
    )
    const { external_shipment_id: externalId } = await db
      .from('shipments')
      .where('id', world.shipmentId)
      .first()
    courier.script.statuses.set(externalId, 'Pickup Order Created')
    const first = await pollCourierStatuses(null)
    assert.equal(first.triggered, 1)
    const again = await pollCourierStatuses(null)
    assert.equal(again.triggered, 0, 'the same label again')
    courier.script.statuses.set(externalId, 'Pickup Complete')
    const moved = await pollCourierStatuses(null)
    assert.equal(moved.triggered, 1)
    const polls = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, source: 'poll' })
    assert.lengthOf(polls, 2)
    const jobs = await queued<{ shipment_id: string }>('orders.process_courier_event')
    assert.lengthOf(
      jobs.filter((job) => job.data.shipment_id === world.shipmentId),
      2
    )
  })
})
