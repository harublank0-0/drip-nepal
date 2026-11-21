import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { bookCourierShipment } from '#modules/orders/actions/book_courier_shipment'
import {
  cancelCourierBooking,
  recordOrderVerification,
  resolveCourierBooking,
  resolveCourierEvent,
} from '#modules/orders/actions/courier_bookings'
import { storeCourierCallback } from '#modules/orders/actions/receive_courier_callback'
import {
  bookCourierShipmentJob,
  RetryableBookingRefusal,
} from '#modules/orders/jobs/book_courier_shipment'
import { processCourierEventJob } from '#modules/orders/jobs/process_courier_event'
import { sweepCourierBookings } from '#modules/orders/jobs/courier_schedules'
import type { Actor } from '#modules/platform/actor'
import {
  courierWorld,
  fakeCourier,
  NCM_TOKEN,
  NO_RETURN,
  reading,
  RECIPIENT,
  type CourierWorld,
  type FakeCourier,
} from '#tests/support/courier'
import { FIRST_TRY, LAST_TRY, queued, useJobBoss } from '#tests/support/jobs'
import { captureLogs } from '#tests/support/logs'

/*
 * The courier path end to end on the job level (docs/05 §6.3, docs/04a
 * §9.13–§9.14; M6), from a verified COD order through booking, pickup and
 * delivery, with the courier scripted (nothing leaves the process):
 * T-FUL-006 (the courier path state table), T-ORD-011 (the dispatch rule),
 * T-FUL-111 (an unknown outcome is never resent; a late success), T-FUL-108
 * (replay, the return check, the two-step return) and T-FUL-110 (a repeated
 * callback adds nothing). The concurrency halves of T-FUL-110 and T-FUL-111
 * are in tests/concurrency/orders/courier_races.spec.ts.
 */

const vendor = (world: CourierWorld): Actor => ({
  type: 'shop_member',
  userId: world.ownerId,
  role: `shop:${world.shopId}:owner`,
  requestId: null,
})
const staff = (userId: string): Actor => ({
  type: 'platform_staff',
  userId,
  role: 'platform:support_agent',
  requestId: null,
})

async function book(
  world: CourierWorld,
  overrides: Partial<Parameters<typeof bookCourierShipment>[0]> = {}
) {
  return bookCourierShipment(
    {
      shopId: world.shopId,
      shopOrderNumber: world.shopOrder.number,
      accountId: world.accountId,
      pickupAddressId: world.addressId,
      serviceCode: 'Door2Door',
      originBranchId: world.originBranchId,
      destinationBranchId: world.destinationBranchId,
      ...overrides,
    },
    { actor: vendor(world), idempotency: null, present: (shipment) => shipment }
  )
}

// A column of a row read asynchronously (lint: no member access on an await expression).
async function pick<T extends Record<string, unknown>>(row: Promise<T>, column: string) {
  const value = await row
  return value[column] as unknown
}

const shipment = (id: string) => db.from('shipments').where('id', id).first()
const liveShipment = (world: CourierWorld) =>
  db
    .from('shipments')
    .where('shop_order_id', world.shopOrder.id)
    .whereNot('status', 'cancelled')
    .first()

async function runBookingJob(world: CourierWorld, attempt = FIRST_TRY) {
  const live = await liveShipment(world)
  return bookCourierShipmentJob({ shipment_id: live.id, shop_id: world.shopId }, attempt)
}

async function bookedWorld(courier: FakeCourier, options: Parameters<typeof courierWorld>[0] = {}) {
  const world = await courierWorld(options)
  await book(world)
  await runBookingJob(world)
  const booked = await shipment(world.shipmentId)
  return { world, externalId: booked.external_shipment_id as string, courier }
}

async function deliverCallback(world: CourierWorld, externalId: string, event: string) {
  return storeCourierCallback({
    providerCode: 'ncm',
    accountId: world.accountId,
    accountStatus: 'active',
    rawBody: JSON.stringify({
      event,
      order_id: Number(externalId),
      status: event,
      timestamp: new Date().toISOString(),
    }),
    requestId: null,
  })
}

async function processLatest(world: CourierWorld, attempt = FIRST_TRY) {
  const jobs = await queued<{ courier_event_id: string | null }>('orders.process_courier_event')
  const job = jobs[jobs.length - 1]
  return processCourierEventJob(
    {
      shipment_id: world.shipmentId,
      shop_id: world.shopId,
      courier_event_id: job?.data.courier_event_id ?? null,
    },
    attempt
  )
}

test.group('T-FUL-006 courier path: a verified COD order from booking to delivery', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-FUL-006 booking fixes the terms, lists the kept units and sends the job (AC-J12-18)', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const result = await book(world)
    const row = await shipment(world.shipmentId)
    assert.equal(result.body.status, 'booking_requested')
    assert.equal(row.merchant_reference, `${world.shopOrder.number}-S1`)
    assert.equal(Number(row.cod_amount_minor), 110000, 'the COD payment amount')
    assert.equal(row.logistics_account_id, world.accountId)
    assert.equal(row.pickup_address_id, world.addressId)
    assert.equal(row.origin_branch_id, world.originBranchId)
    assert.equal(row.courier_name, 'Nepal Can Move')
    const items = await db.from('shipment_items').where('shipment_id', world.shipmentId)
    assert.deepEqual(
      items.map((item) => [item.order_item_id, item.quantity]),
      [[world.itemId, 2]]
    )
    const reservation = await db
      .from('inventory_reservations')
      .where('order_item_id', world.itemId)
      .first()
    assert.equal(reservation.status, 'committed', 'booking does not touch stock')
    assert.lengthOf(await queued('orders.book_courier_shipment'), 1)
  })

  test('T-FUL-006 the courier confirms, picks up and delivers; stock is consumed once (AC-J13-16)', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    const booked = await shipment(world.shipmentId)
    assert.equal(booked.status, 'booked')
    assert.match(externalId, /^\d+$/)
    const call = courier.calls.find((c) => c.method === 'book')!
    assert.equal(call.token, NCM_TOKEN, 'the worker decrypted the account credentials')
    const request = call.args as {
      merchantReference: string
      recipient: Record<string, string>
      codAmountMinor: number
    }
    assert.equal(request.merchantReference, `${world.shopOrder.number}-S1`)
    assert.equal(request.recipient.name, RECIPIENT.name)
    assert.equal(request.recipient.phone, RECIPIENT.phone)
    assert.include(request.recipient.address, RECIPIENT.area)
    assert.equal(request.codAmountMinor, 110000)

    courier.script.history.set(externalId, [
      reading(externalId, 'Pickup Order Created', 40),
      reading(externalId, 'Pickup Complete', 30),
      reading(externalId, 'Dispatched to POKHARA', 20),
      reading(externalId, 'Sent for Delivery', 10),
      reading(externalId, 'Delivered', 5),
    ])
    courier.script.detail.set(externalId, { externalShipmentId: externalId, ...NO_RETURN })
    const stored = await deliverCallback(world, externalId, 'delivery_completed')
    assert.equal(stored.stored, 1)
    assert.equal(await processLatest(world), 'replayed')

    const delivered = await shipment(world.shipmentId)
    assert.equal(delivered.status, 'delivered')
    assert.isNotNull(delivered.shipped_at)
    assert.isNotNull(delivered.return_window_ends_at)
    const events = await db
      .from('shipment_events')
      .where('shipment_id', world.shipmentId)
      .orderBy('id')
    assert.deepEqual(
      events.map((e) => `${e.event}:${e.actor_type}`),
      [
        'booking_requested:shop_member',
        'booked:system',
        'picked_up:provider',
        'out_for_delivery:provider',
        'delivered:provider',
      ]
    )
    assert.isTrue(
      events
        .filter((e) => e.actor_type === 'provider')
        .every((e) => e.raw_status && e.provider_event_key)
    )
    const stock = await db.from('inventory_items').where('variant_id', world.variantId).first()
    assert.deepEqual([stock.on_hand, stock.reserved], [3, 0])
    const reservation = await db
      .from('inventory_reservations')
      .where('order_item_id', world.itemId)
      .first()
    assert.equal(reservation.status, 'consumed')
    const movements = await db
      .from('inventory_movements')
      .where({ reference_id: world.shipmentId, kind: 'ship' })
    assert.lengthOf(movements, 1)
    const trigger = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, source: 'callback' })
      .first()
    assert.equal(trigger.processing_status, 'looked_up')
  })

  test('T-FUL-110 the same callback twice stores one row, sends one job and moves nothing again', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    courier.script.history.set(externalId, [reading(externalId, 'Pickup Complete', 10)])
    await deliverCallback(world, externalId, 'pickup_completed')
    await processLatest(world)
    const again = await deliverCallback(world, externalId, 'pickup_completed')
    assert.deepEqual([again.stored, again.duplicates], [0, 1])
    assert.lengthOf(
      await db.from('courier_events').where({ shipment_id: world.shipmentId, source: 'callback' }),
      1
    )
    assert.lengthOf(await queued('orders.process_courier_event'), 1)
    // A replay of the same history applies nothing new.
    await processLatest(world)
    const pickups = await db
      .from('shipment_events')
      .where({ shipment_id: world.shipmentId, event: 'picked_up' })
    assert.lengthOf(pickups, 1)
    const movements = await db
      .from('inventory_movements')
      .where({ reference_id: world.shipmentId, kind: 'ship' })
    assert.lengthOf(movements, 1)
  })

  test('T-FUL-006 a refusal is booking_failed; the vendor cancels and books again under -S2 (AC-J12-20)', async ({
    assert,
  }) => {
    const world = await courierWorld()
    courier.script.book.push({
      outcome: 'refused',
      error: { code: 'invalid_phone', httpStatus: 400, fields: ['phone'], retryable: false },
    })
    await book(world)
    assert.equal(await runBookingJob(world), 'booking_failed')
    const attempt = await db
      .from('shipment_booking_attempts')
      .where('shipment_id', world.shipmentId)
      .first()
    assert.deepEqual(
      [attempt.outcome, attempt.error_code, attempt.error_fields],
      ['refused', 'invalid_phone', 'phone']
    )
    await cancelCourierBooking(
      { shopId: world.shopId, shopOrderNumber: world.shopOrder.number, reason: null },
      { actor: vendor(world), idempotency: null, present: (s) => s }
    )
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'cancelled')
    const fresh = await liveShipment(world)
    assert.equal(fresh.status, 'pending')
    await book(world)
    assert.equal(
      await pick(liveShipment(world), 'merchant_reference'),
      `${world.shopOrder.number}-S2`
    )
  })

  test('T-FUL-006 a retryable refusal retries under the same reference, and the last try fails the booking', async ({
    assert,
  }) => {
    const world = await courierWorld()
    const busy = {
      outcome: 'refused' as const,
      error: { code: 'rate_limited' as const, httpStatus: 429, fields: [], retryable: true },
    }
    courier.script.book.push(busy, busy)
    await book(world)
    await assert.rejects(
      () => runBookingJob(world),
      RetryableBookingRefusal as unknown as ErrorConstructor
    )
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'booking_requested')
    assert.equal(await runBookingJob(world, LAST_TRY), 'booking_failed')
    const attempts = await db
      .from('shipment_booking_attempts')
      .where('shipment_id', world.shipmentId)
      .orderBy('attempt_no')
    assert.deepEqual(
      attempts.map((a) => [a.attempt_no, a.outcome]),
      [
        [1, 'refused'],
        [2, 'refused'],
      ]
    )
    const references = courier.calls
      .filter((c) => c.method === 'book')
      .map((c) => (c.args as { merchantReference: string }).merchantReference)
    assert.deepEqual(references, [`${world.shopOrder.number}-S1`, `${world.shopOrder.number}-S1`])
  })
})

test.group('T-ORD-011 the dispatch rule (OD-57)', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test(
    'T-ORD-011 booking an order whose verification is {verification} answers 409 and changes nothing (AC-J12-21)'
  )
    .with([{ verification: 'review_required' as const }, { verification: 'failed' as const }])
    .run(async ({ assert }, { verification }) => {
      const world = await courierWorld({ verification })
      const error = await book(world).then(
        () => null,
        (e) => e
      )
      assert.equal(error?.problemCode, 'INVALID_STATE_TRANSITION')
      assert.equal(await pick(shipment(world.shipmentId), 'status'), 'pending')
      assert.lengthOf(await db.from('shipment_items').where('shipment_id', world.shipmentId), 0)
      assert.lengthOf(await queued('orders.book_courier_shipment'), 0)
    })

  test('T-ORD-011 an order still pending verification is dispatched normally', async ({
    assert,
  }) => {
    const world = await courierWorld({ verification: 'pending' })
    const result = await book(world)
    assert.equal(result.body.status, 'booking_requested')
  })
})

test.group('T-FUL-111 an unknown booking outcome is never sent again by itself', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-FUL-111 a lost answer moves the shipment to needs_reconciliation; a rerun calls nothing; staff resolve it', async ({
    assert,
  }) => {
    const world = await courierWorld()
    courier.script.book.push({
      outcome: 'unknown',
      error: { code: 'timeout', httpStatus: null, fields: [], retryable: false },
    })
    await book(world)
    assert.equal(await runBookingJob(world), 'needs_reconciliation')
    assert.equal(await runBookingJob(world), 'not_waiting')
    assert.lengthOf(
      courier.calls.filter((c) => c.method === 'book'),
      1,
      'one courier call only'
    )
    const attempt = await db
      .from('shipment_booking_attempts')
      .where('shipment_id', world.shipmentId)
      .first()
    assert.equal(attempt.outcome, 'unknown')

    const staffUser = await db
      .table('users')
      .insert({ email: `staff-${Date.now()}@example.com`, full_name: 'Staff', password_hash: 'x' })
      .returning('id')
    await resolveCourierBooking(
      {
        shopOrderNumber: world.shopOrder.number,
        outcome: 'booked',
        externalShipmentId: '9001',
        note: 'Found on the NCM portal',
      },
      { actor: staff(staffUser[0].id), idempotency: null, present: (s) => s }
    )
    const resolved = await shipment(world.shipmentId)
    assert.deepEqual([resolved.status, resolved.external_shipment_id], ['booked', '9001'])
  })

  test('T-FUL-111 a late success after the sweeper gave up books the shipment and upgrades the attempt', async ({
    assert,
  }) => {
    const world = await courierWorld()
    courier.script.book.push(async () => {
      // The worker hangs past the timeout: the sweeper marks its claim unknown meanwhile.
      // Inside the test's transaction now() does not move, so the sweeper is told any claim is stale.
      await sweepCourierBookings(null, -1)
      return { outcome: 'succeeded', externalShipmentId: '9002' }
    })
    await book(world)
    await runBookingJob(world)
    const row = await shipment(world.shipmentId)
    assert.deepEqual([row.status, row.external_shipment_id], ['booked', '9002'])
    const attempt = await db
      .from('shipment_booking_attempts')
      .where('shipment_id', world.shipmentId)
      .first()
    assert.deepEqual([attempt.outcome, attempt.external_shipment_id], ['succeeded', '9002'])
    const events = await db
      .from('shipment_events')
      .where('shipment_id', world.shipmentId)
      .orderBy('id')
    assert.deepEqual(
      events.map((e) => e.event),
      ['booking_requested', 'needs_reconciliation', 'booked']
    )
  })

  test('T-FUL-111 a vendor cancellation of a booked parcel is a request until staff record it', async ({
    assert,
  }) => {
    const { world } = await bookedWorld(courier)
    await cancelCourierBooking(
      { shopId: world.shopId, shopOrderNumber: world.shopOrder.number, reason: 'Customer moved' },
      { actor: vendor(world), idempotency: null, present: (s) => s }
    )
    const requested = await shipment(world.shipmentId)
    assert.deepEqual([requested.status, requested.cancel_requested_by], ['booked', 'vendor'])
    const second = await cancelCourierBooking(
      { shopId: world.shopId, shopOrderNumber: world.shopOrder.number, reason: null },
      { actor: vendor(world), idempotency: null, present: (s) => s }
    ).then(
      () => null,
      (e) => e
    )
    assert.equal(second?.problemCode, 'INVALID_STATE_TRANSITION')
    const staffUser = await db
      .table('users')
      .insert({ email: `staff-${Date.now()}@example.com`, full_name: 'Staff', password_hash: 'x' })
      .returning('id')
    await resolveCourierBooking(
      {
        shopOrderNumber: world.shopOrder.number,
        outcome: 'cancelled',
        externalShipmentId: null,
        note: 'Cancelled by NCM support',
      },
      { actor: staff(staffUser[0].id), idempotency: null, present: (s) => s }
    )
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'cancelled')
    assert.equal(await pick(liveShipment(world), 'status'), 'pending')
    const shopOrder = await db.from('shop_orders').where('id', world.shopOrder.id).first()
    assert.equal(shopOrder.status, 'accepted', 'a vendor request does not end the shop order')
  })
})

test.group('T-FUL-108 replay, the return check and holds', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-FUL-108 a return marked in transit applies delivery_failed then returning with #1 and #2 keys', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    courier.script.history.set(externalId, [
      reading(externalId, 'Pickup Complete', 20),
      reading(externalId, 'Order Marked Return', 10),
    ])
    await deliverCallback(world, externalId, 'order_marked_rtv')
    await processLatest(world)
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'returning')
    const rows = await db
      .from('shipment_events')
      .where('shipment_id', world.shipmentId)
      .whereNotNull('provider_event_key')
      .orderBy('id')
    const keys = rows.map((e) => `${e.event}:${String(e.provider_event_key).slice(-2)}`)
    assert.deepEqual(keys.slice(1), ['delivery_failed:#1', 'returning:#2'])
  })

  test('T-FUL-108 a Delivered with the return flag is the end of a return, not a delivery', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    courier.script.history.set(externalId, [
      reading(externalId, 'Pickup Complete', 20),
      reading(externalId, 'Delivered', 10),
    ])
    courier.script.detail.set(externalId, {
      externalShipmentId: externalId,
      ...NO_RETURN,
      returnedToVendor: true,
    })
    await deliverCallback(world, externalId, 'delivery_completed')
    await processLatest(world)
    const row = await shipment(world.shipmentId)
    assert.equal(row.status, 'returning')
    assert.isNull(row.delivered_at, 'no return window, no delivery')
  })

  test('T-FUL-108 an unreadable detail keeps the delivery open; after the retries it is held', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    courier.script.history.set(externalId, [
      reading(externalId, 'Pickup Complete', 20),
      reading(externalId, 'Delivered', 10),
    ])
    courier.script.detailFails = 2
    await deliverCallback(world, externalId, 'delivery_completed')
    await assert.rejects(() => processLatest(world))
    assert.equal(
      await pick(shipment(world.shipmentId), 'status'),
      'shipped',
      'the pickup before it is applied'
    )
    await processLatest(world, LAST_TRY)
    const held = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, processing_status: 'held' })
      .first()
    assert.equal(held.hold_reason, 'return_check_failed')
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'shipped')
  })

  test('T-FUL-108 an unknown label is held and stops the replay until staff close it', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    courier.script.history.set(externalId, [
      reading(externalId, 'Teleported', 20),
      reading(externalId, 'Pickup Complete', 10),
    ])
    await deliverCallback(world, externalId, 'pickup_completed')
    assert.equal(await processLatest(world), 'held')
    assert.equal(
      await pick(shipment(world.shipmentId), 'status'),
      'booked',
      'the replay stopped at the held reading'
    )
    const held = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, processing_status: 'held' })
      .first()
    assert.equal(held.hold_reason, 'unmapped_status')
    const staffUser = await db
      .table('users')
      .insert({ email: `staff-${Date.now()}@example.com`, full_name: 'Staff', password_hash: 'x' })
      .returning('id')
    await resolveCourierEvent(
      { eventId: held.id, status: 'ignored', note: 'NCM internal label' },
      staff(staffUser[0].id)
    )
    await processLatest(world)
    assert.equal(
      await pick(shipment(world.shipmentId), 'status'),
      'shipped',
      'the replay continued'
    )
  })

  test('T-FUL-006 an update for a terminal shop order goes to the inbox', async ({ assert }) => {
    const { world, externalId } = await bookedWorld(courier)
    await db
      .from('shop_orders')
      .where('id', world.shopOrder.id)
      .update({
        status: 'cancelled',
        cancel_reason: 'admin_cancelled',
        cancelled_at: db.raw('now()'),
      })
    courier.script.history.set(externalId, [reading(externalId, 'Pickup Complete', 10)])
    await deliverCallback(world, externalId, 'pickup_completed')
    await processLatest(world)
    const held = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, processing_status: 'held' })
      .first()
    assert.equal(held.hold_reason, 'terminal_shop_order')
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'booked')
  })

  test('T-FUL-006 with the COD collected, a courier return is held, not applied', async ({
    assert,
  }) => {
    const { world, externalId } = await bookedWorld(courier)
    // The courier's history is stable: the same reading keeps its time.
    const pickup = reading(externalId, 'Pickup Complete', 20)
    courier.script.history.set(externalId, [pickup])
    await deliverCallback(world, externalId, 'pickup_completed')
    await processLatest(world)
    await db
      .from('payments')
      .where('id', world.paymentId)
      .update({ status: 'collected', captured_minor: 110000, captured_at: db.raw('now()') })
    courier.script.history.set(externalId, [pickup, reading(externalId, 'Order Marked Return', 10)])
    await deliverCallback(world, externalId, 'order_marked_rtv')
    await processLatest(world)
    const held = await db
      .from('courier_events')
      .where({ shipment_id: world.shipmentId, processing_status: 'held' })
      .first()
    assert.equal(held.hold_reason, 'cod_collected')
    assert.equal(await pick(shipment(world.shipmentId), 'status'), 'shipped')
  })
})

test.group('T-ORD-012 staff record an order verification', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  const staffActor = async () => {
    const [row] = await db
      .table('users')
      .insert({
        email: `staff-${Date.now()}-${Math.random()}@example.com`,
        full_name: 'Staff',
        password_hash: 'x',
      })
      .returning('id')
    return staff(row.id)
  }

  test('T-ORD-012 recording verified lifts the dispatch rule and writes one audit row', async ({
    assert,
  }) => {
    const world = await courierWorld({ verification: 'review_required' })
    const order = await db
      .from('shop_orders')
      .where('id', world.shopOrder.id)
      .select('order_id')
      .first()
    const { number } = await db.from('orders').where('id', order.order_id).select('number').first()
    const recorded = await recordOrderVerification(
      {
        orderNumber: number,
        status: 'verified',
        method: 'phone_call',
        notes: 'Customer confirmed',
      },
      await staffActor()
    )
    assert.equal(recorded.verification_status, 'verified')
    const result = await book(world)
    assert.equal(result.body.status, 'booking_requested')
    const audits = await db
      .from('audit_logs')
      .where({ subject_id: order.order_id, action: 'order.verify' })
    assert.lengthOf(audits, 1)
  })

  test('T-ORD-012 a doubt recorded after booking raises an alert and leaves the parcel alone', async ({
    assert,
  }) => {
    const { world } = await bookedWorld(courier)
    const order = await db
      .from('shop_orders')
      .where('id', world.shopOrder.id)
      .select('order_id')
      .first()
    const { number } = await db.from('orders').where('id', order.order_id).select('number').first()
    const actor = await staffActor()
    const lines = await captureLogs(async () => {
      await recordOrderVerification(
        { orderNumber: number, status: 'failed', method: 'manual', notes: null },
        actor
      )
    })
    const alerts = lines.filter((line) => line.fields.alert === 'order.verification_after_booking')
    assert.lengthOf(alerts, 1)
    assert.equal(alerts[0].fields.shipment_id, world.shipmentId)
    const row = await shipment(world.shipmentId)
    assert.equal(row.status, 'booked')
  })

  test('T-ORD-012 an unknown order number answers 404', async ({ assert }) => {
    const error = await recordOrderVerification(
      { orderNumber: 'DN-ZZZZZZZ', status: 'verified', method: 'manual', notes: null },
      await staffActor()
    ).then(
      () => null,
      (e) => e
    )
    assert.equal(error?.problemCode, 'NOT_FOUND')
  })
})
