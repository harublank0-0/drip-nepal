import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { bookCourierShipment } from '#modules/orders/actions/book_courier_shipment'
import { storeCourierCallback } from '#modules/orders/actions/receive_courier_callback'
import { bookCourierShipmentJob } from '#modules/orders/jobs/book_courier_shipment'
import { processCourierEventJob } from '#modules/orders/jobs/process_courier_event'
import type { Actor } from '#modules/platform/actor'
import {
  courierWorld,
  fakeCourier,
  NO_RETURN,
  reading,
  type CourierWorld,
  type FakeCourier,
} from '#tests/support/courier'
import { FIRST_TRY, useJobBoss } from '#tests/support/jobs'
import { JOB_SCHEMA } from '#modules/platform/jobs'

/*
 * The courier races, committed for real on separate connections (docs/10
 * §3.3): T-FUL-111 (one courier call per booking, whatever the jobs do),
 * T-FUL-110 (a repeated tracking update is applied once) and T-FUL-107 (two
 * writers of one shop order's `shipment_items`). Each round builds its own shop and order.
 */

const ROUNDS = 4

const vendor = (world: CourierWorld): Actor => ({
  type: 'shop_member',
  userId: world.ownerId,
  role: `shop:${world.shopId}:owner`,
  requestId: null,
})

function book(world: CourierWorld) {
  return bookCourierShipment(
    {
      shopId: world.shopId,
      shopOrderNumber: world.shopOrder.number,
      accountId: world.accountId,
      pickupAddressId: world.addressId,
      serviceCode: 'Door2Door',
      originBranchId: world.originBranchId,
      destinationBranchId: world.destinationBranchId,
    },
    { actor: vendor(world), idempotency: null, present: (shipment) => shipment }
  )
}

const bookingJob = (world: CourierWorld) =>
  bookCourierShipmentJob({ shipment_id: world.shipmentId, shop_id: world.shopId }, FIRST_TRY)

const bookCalls = (courier: FakeCourier) => courier.calls.filter((c) => c.method === 'book')

// A courier answer the test releases when it chooses.
function heldAnswer(externalShipmentId: string) {
  let release = () => {}
  let markReached = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const reached = new Promise<void>((resolve) => {
    markReached = resolve
  })
  return {
    reached,
    release: () => release(),
    call: async () => {
      markReached()
      await released
      return { outcome: 'succeeded' as const, externalShipmentId }
    },
  }
}

// Resolves each caller once `count` callers have arrived, or after `ms` for whoever is waiting.
function arrivals(count: number, ms: number) {
  let waiting: (() => void)[] = []
  return () =>
    new Promise<void>((resolve) => {
      waiting.push(resolve)
      if (waiting.length >= count) {
        for (const release of waiting) release()
        waiting = []
        return
      }
      setTimeout(resolve, ms)
    })
}

test.group('T-FUL-111 one courier call per booking', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  test('T-FUL-111 a second job while the first call is in flight stops at the claim', async ({
    assert,
  }) => {
    for (let round = 1; round <= ROUNDS; round++) {
      courier.calls.length = 0
      const world = await courierWorld()
      await book(world)
      const answer = heldAnswer(String(7000 + round))
      courier.script.book.push(() => answer.call())
      const first = bookingJob(world)
      await answer.reached
      // The first worker's claim is committed and its call is open.
      const second = await bookingJob(world)
      answer.release()
      assert.equal(await first, 'booked', `round ${round}`)
      assert.equal(second, 'claimed_elsewhere', `round ${round}`)
      assert.lengthOf(bookCalls(courier), 1, `round ${round}: one courier call`)
      const attempts = await db
        .from('shipment_booking_attempts')
        .where('shipment_id', world.shipmentId)
      assert.deepEqual(
        attempts.map((a) => a.outcome),
        ['succeeded'],
        `round ${round}`
      )
    }
  })

  test('T-FUL-111 jobs started together make one call and one attempt', async ({ assert }) => {
    for (let round = 1; round <= ROUNDS; round++) {
      courier.calls.length = 0
      const world = await courierWorld()
      await book(world)
      courier.script.book.push(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { outcome: 'succeeded', externalShipmentId: String(7100 + round) }
      })
      const results = await Promise.allSettled([
        bookingJob(world),
        bookingJob(world),
        bookingJob(world),
      ])
      const values = results.map((r) =>
        r.status === 'fulfilled' ? r.value : `rejected: ${r.reason}`
      )
      assert.lengthOf(
        values.filter((v) => v === 'booked'),
        1,
        `round ${round}: ${values.join(', ')}`
      )
      assert.isTrue(
        values.every((v) => ['booked', 'claimed_elsewhere', 'not_waiting'].includes(v)),
        `round ${round}: ${values.join(', ')}`
      )
      assert.lengthOf(bookCalls(courier), 1, `round ${round}`)
      const attempts = await db
        .from('shipment_booking_attempts')
        .where('shipment_id', world.shipmentId)
      assert.lengthOf(attempts, 1, `round ${round}`)
    }
  })

  test('T-FUL-107 two booking requests at once: one books and lists the kept units once, the other gives 409', async ({
    assert,
  }) => {
    for (let round = 1; round <= ROUNDS; round++) {
      const world = await courierWorld()
      const results = await Promise.allSettled([book(world), book(world)])
      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const codes = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason as { problemCode?: string }).problemCode ?? String(r.reason))
      assert.lengthOf(fulfilled, 1, `round ${round}: ${codes.join(', ')}`)
      assert.deepEqual(codes, ['INVALID_STATE_TRANSITION'], `round ${round}`)
      const items = await db.from('shipment_items').where('shipment_id', world.shipmentId)
      assert.lengthOf(items, 1, `round ${round}: the kept units are listed once`)
      const live = await db
        .from('shipments')
        .where('shop_order_id', world.shopOrder.id)
        .whereNot('status', 'cancelled')
      assert.lengthOf(live, 1, `round ${round}`)
    }
  })
})

test.group('T-FUL-110 a repeated tracking update is applied once', (group) => {
  let courier: FakeCourier
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    courier = fakeCourier()
    return () => courier.restore()
  })

  async function bookedWorld(externalId: string) {
    const world = await courierWorld()
    await book(world)
    courier.script.book.push({ outcome: 'succeeded', externalShipmentId: externalId })
    await bookingJob(world)
    return world
  }

  const callback = (world: CourierWorld, externalId: string, event: string) =>
    storeCourierCallback({
      providerCode: 'ncm',
      accountId: world.accountId,
      accountStatus: 'active',
      rawBody: JSON.stringify({ event, order_id: Number(externalId), status: event }),
      requestId: null,
    })

  test('T-FUL-110 five identical callbacks at once store one row and send one job', async ({
    assert,
  }) => {
    for (let round = 1; round <= ROUNDS; round++) {
      const externalId = String(7200 + round)
      const world = await bookedWorld(externalId)
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => callback(world, externalId, 'pickup_completed'))
      )
      const errors = results
        .filter((r) => r.status === 'rejected')
        .map((r) => String((r as PromiseRejectedResult).reason))
      assert.deepEqual(errors, [], `round ${round}`)
      const stored = results.map((r) => (r.status === 'fulfilled' ? r.value.stored : 0))
      assert.equal(
        stored.reduce((a, b) => a + b, 0),
        1,
        `round ${round}: ${stored.join(', ')}`
      )
      const rows = await db
        .from('courier_events')
        .where({ shipment_id: world.shipmentId, source: 'callback' })
      assert.lengthOf(rows, 1, `round ${round}`)
      const jobs = await db
        .from(`${JOB_SCHEMA}.job`)
        .where('name', 'orders.process_courier_event')
        .whereRaw(`data->>'shipment_id' = ?`, [world.shipmentId])
      assert.lengthOf(jobs, 1, `round ${round}`)
    }
  })

  test('T-FUL-110 two event jobs replaying the same history at once apply each reading once', async ({
    assert,
  }) => {
    for (let round = 1; round <= ROUNDS; round++) {
      const externalId = String(7300 + round)
      const world = await bookedWorld(externalId)
      courier.script.history.set(externalId, [
        reading(externalId, 'Pickup Complete', 30),
        reading(externalId, 'Sent for Delivery', 20),
        reading(externalId, 'Delivered', 10),
      ])
      courier.script.detail.set(externalId, { externalShipmentId: externalId, ...NO_RETURN })
      // Both jobs wait at the detail read, so their replays start together (or after 1 s alone).
      courier.script.beforeDetail = arrivals(2, 1000)
      const payload = {
        shipment_id: world.shipmentId,
        shop_id: world.shopId,
        courier_event_id: null,
      }
      const results = await Promise.allSettled([
        processCourierEventJob(payload, FIRST_TRY),
        processCourierEventJob(payload, FIRST_TRY),
      ])
      const errors = results
        .filter((r) => r.status === 'rejected')
        .map((r) => String((r as PromiseRejectedResult).reason))
      assert.deepEqual(errors, [], `round ${round}`)
      // A job that lost the race must find the readings applied, not fail on the consumed stock.
      const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : null))
      assert.notInclude(outcomes, 'stock_failed', `round ${round}: ${outcomes.join(', ')}`)
      const troubled = await db
        .from('courier_events')
        .where('shipment_id', world.shipmentId)
        .whereIn('processing_status', ['failed', 'held'])
      assert.lengthOf(troubled, 0, `round ${round}`)
      const events = await db
        .from('shipment_events')
        .where('shipment_id', world.shipmentId)
        .whereIn('event', ['picked_up', 'out_for_delivery', 'delivered'])
      assert.deepEqual(
        events.map((e) => e.event).sort(),
        ['delivered', 'out_for_delivery', 'picked_up'],
        `round ${round}`
      )
      const movements = await db
        .from('inventory_movements')
        .where({ reference_id: world.shipmentId, kind: 'ship' })
      assert.lengthOf(movements, 1, `round ${round}: stock consumed once`)
      const stock = await db.from('inventory_items').where('variant_id', world.variantId).first()
      assert.deepEqual([stock.on_hand, stock.reserved], [3, 0], `round ${round}`)
      const shipment = await db.from('shipments').where('id', world.shipmentId).first()
      assert.equal(shipment.status, 'delivered', `round ${round}`)
    }
  })
})
