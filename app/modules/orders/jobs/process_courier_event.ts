import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { raiseAlert } from '#modules/platform/alerts'
import { settingIn } from '#modules/platform/settings'
import { canTransition } from '#modules/platform/state_machine'
import { jobTx } from '#modules/platform/tx'
import {
  consumeForShipment,
  type ConsumeProblem,
} from '#modules/inventory/actions/consume_for_shipment'
import {
  eventKeys,
  hasHeldReading,
  openReadings,
  recordCourierEvents,
  setEventOutcome,
} from '#modules/logistics/actions/courier_events'
import {
  isReturnStage,
  mapCourierLabel,
  readParcelDetail,
  readParcelHistory,
  type CourierParcelDetail,
} from '#modules/logistics/actions/courier_calls'
import { COURIER_SHIPMENT, MAX_DELIVERY_ATTEMPTS } from '#modules/orders/domain/shipment_machine'
import type { ShipmentStatus } from '#modules/orders/domain/shipment_status'
import type { JobPayloads } from '#modules/platform/jobs'
import type { ShipmentRow } from '#modules/orders/queries'

/*
 * `orders.process_courier_event` (docs/05 §6.3, docs/04a §9.14; M6). NCM does
 * not sign its callbacks, so a callback or a poll answer is only a trigger:
 * this job reads the parcel's whole status history, stores each reading once
 * (`source = 'history'`), and replays the new ones in the courier's time
 * order through the pure mapping, in one transaction. A stage the callbacks
 * missed is still applied in its place (T-FUL-108). The trigger row ends
 * `looked_up`.
 *
 * Each reading ends `applied`, `ignored` or `held`. A held reading (a status
 * the machine refuses, an unknown label, a terminal shop order, a COD already
 * collected, a delivery the return check could not confirm) raises an admin
 * alert and stops the replay for that shipment until staff resolve it.
 *
 * Before a courier `delivered` is applied, the parcel's detail is read
 * outside the transaction: NCM ends a returned parcel as `Delivered` too, so
 * a detail that reports a return to the vendor, or a history with a return
 * stage, makes the reading the end of a return instead (`returning` and a
 * vendor notice to record `returned_to_origin`). When the detail cannot be
 * read the reading stays open and the job retries; after its retries it is
 * held (`return_check_failed`).
 *
 * A pickup consumes the reserved stock (docs/05 §5.6) and clears an open
 * cancellation request with an alert: the parcel has left. Customer and
 * vendor notices are logged until the M1 notification handler exists.
 */

type JobInfo = { retryCount: number; retryLimit: number; requestId: string | null }

class StockConsumptionFailed extends Error {
  constructor(readonly problems: ConsumeProblem[]) {
    super('the pickup could not consume the reserved stock')
    this.name = 'StockConsumptionFailed'
  }
}

type Reading = { id: string; event_key: string; raw_status: string; occurred_at: Date | null }

export async function processCourierEventJob(
  payload: JobPayloads['orders.process_courier_event'],
  job: JobInfo
) {
  const lastTry = job.retryCount >= job.retryLimit
  const loaded = await db
    .from('shipments as s')
    .join('logistics_accounts as la', 'la.id', 's.logistics_account_id')
    .where({ 's.id': payload.shipment_id, 's.shop_id': payload.shop_id })
    .select(
      's.id',
      's.shop_id',
      's.status',
      's.external_shipment_id',
      's.logistics_account_id',
      'la.provider_code'
    )
    .first()
  if (!loaded || !loaded.external_shipment_id) {
    if (payload.courier_event_id) {
      await jobTx((trx) => setEventOutcome(trx, payload.courier_event_id!, { status: 'ignored' }))
    }
    return 'not_booked'
  }

  const history = await readParcelHistory(loaded.logistics_account_id, loaded.external_shipment_id)
  if (!history.ok) {
    if (lastTry && payload.courier_event_id) {
      await jobTx((trx) =>
        setEventOutcome(trx, payload.courier_event_id!, {
          status: 'failed',
          error: history.error.code,
        })
      )
    }
    throw new Error(`courier history unavailable: ${history.error.code}`)
  }

  await jobTx(async (trx) => {
    await recordCourierEvents(
      trx,
      history.value.map((reading) => ({
        accountId: loaded.logistics_account_id,
        source: 'history' as const,
        eventKey: eventKeys.history(
          loaded.external_shipment_id,
          reading.rawStatus,
          reading.occurredAt
        ),
        externalShipmentId: loaded.external_shipment_id,
        shipmentId: loaded.id,
        shopId: loaded.shop_id,
        rawEvent: null,
        rawStatus: reading.rawStatus,
        occurredAt: reading.occurredAt,
        payload: {
          status: reading.rawStatus.slice(0, 256),
          ...(reading.occurredAt ? { timestamp: reading.occurredAt.toISOString() } : {}),
        },
        rawBodySha256: null,
        requestId: job.requestId,
      }))
    )
    if (payload.courier_event_id)
      await setEventOutcome(trx, payload.courier_event_id, { status: 'looked_up' })
  })

  // A delivery is checked against the parcel's detail, which is read outside the transaction.
  let detail: CourierParcelDetail | 'unavailable' | null = null
  if (await replayReachesDelivered(loaded.id, loaded.provider_code)) {
    const read = await readParcelDetail(loaded.logistics_account_id, loaded.external_shipment_id)
    detail = read.ok ? read.value : 'unavailable'
  }

  let outcome: string
  try {
    outcome = await jobTx((trx) =>
      replay(trx, loaded.id, loaded.provider_code, detail, lastTry, job.requestId)
    )
  } catch (error) {
    if (!(error instanceof StockConsumptionFailed)) throw error
    outcome = await jobTx(async (trx) => {
      const [first] = await openReadings(trx, loaded.id)
      if (first) {
        await setEventOutcome(trx, first.id, {
          status: 'failed',
          error: `stock: ${error.problems.map((p) => p.reason).join(',')}`,
        })
      }
      raiseAlert('courier.pickup_stock_failed', {
        shipment_id: loaded.id,
        problems: error.problems.length,
      })
      return 'stock_failed'
    })
  }
  if (outcome === 'detail_unavailable')
    throw new Error('courier parcel detail unavailable; retrying')
  return outcome
}

// A dry run of the mapping over the open readings, without locks: does it reach `delivered`?
async function replayReachesDelivered(shipmentId: string, providerCode: string) {
  const shipment = await db.from('shipments').where('id', shipmentId).select('status').first()
  const readings = await db
    .from('courier_events')
    .where({ shipment_id: shipmentId, source: 'history' })
    .whereIn('processing_status', ['pending', 'failed'])
    .orderByRaw('occurred_at ASC NULLS FIRST, received_at ASC, id ASC')
    .select('raw_status')
  let status = shipment?.status as string
  for (const reading of readings) {
    const mapping = mapCourierLabel(providerCode, reading.raw_status, status)
    if (mapping.kind !== 'transition') continue
    for (const next of mapping.statuses) {
      if (next === 'delivered') return true
      if (canTransition(COURIER_SHIPMENT, status as ShipmentStatus, next as ShipmentStatus))
        status = next
    }
  }
  return false
}

const TERMINAL_SHOP_ORDER = new Set(['cancelled', 'rejected', 'completed'])

async function replay(
  trx: TransactionClientContract,
  shipmentId: string,
  providerCode: string,
  detail: CourierParcelDetail | 'unavailable' | null,
  lastTry: boolean,
  requestId: string | null
) {
  const head = await trx.from('shipments').where('id', shipmentId).select('shop_order_id').first()
  const shopOrderRow = await trx
    .from('shop_orders')
    .where('id', head.shop_order_id)
    .select('order_id')
    .first()
  await trx.from('orders').where('id', shopOrderRow.order_id).forUpdate().select('id').first()
  const shopOrder = await trx
    .from('shop_orders')
    .where('id', head.shop_order_id)
    .forUpdate()
    .first()
  let current = await trx.from('shipments').where('id', shipmentId).forUpdate().first()
  if (await hasHeldReading(trx, shipmentId)) return 'held_earlier'
  const cod = await trx
    .from('payments')
    .where({ shop_order_id: shopOrder.id, method: 'cod' })
    .select('status')
    .first()
  const codCollected = cod?.status === 'collected'

  const hold = async (reading: Reading, reason: string) => {
    await setEventOutcome(trx, reading.id, { status: 'held', holdReason: reason })
    raiseAlert('courier.reading_held', {
      shipment_id: shipmentId,
      courier_event_id: reading.id,
      reason,
    })
    return 'held'
  }

  const readings = (await openReadings(trx, shipmentId)) as Reading[]
  for (const reading of readings) {
    if (TERMINAL_SHOP_ORDER.has(shopOrder.status)) return hold(reading, 'terminal_shop_order')
    if (current.status === 'cancelled') return hold(reading, 'not_allowed')
    const mapping = mapCourierLabel(providerCode, reading.raw_status, current.status)
    if (mapping.kind === 'unmapped') return hold(reading, 'unmapped_status')
    if (mapping.kind === 'none') {
      await setEventOutcome(trx, reading.id, { status: 'ignored' })
      notice(mapping.notice, shipmentId)
      continue
    }
    let statuses = [...mapping.statuses]
    if (statuses.includes('delivered')) {
      if (detail === null || detail === 'unavailable') {
        if (lastTry) return hold(reading, 'return_check_failed')
        return 'detail_unavailable'
      }
      const returned =
        detail.returnedToVendor === true ||
        (await historyHasReturnStage(trx, shipmentId, providerCode))
      if (returned) {
        notice('record_returned_to_origin', shipmentId)
        statuses =
          current.status === 'returning'
            ? []
            : current.status === 'delivery_failed'
              ? ['returning']
              : ['delivery_failed', 'returning']
      }
    }
    if (statuses.length === 0) {
      await setEventOutcome(trx, reading.id, { status: 'ignored' })
      continue
    }
    for (const [index, next] of statuses.entries()) {
      const to = next as ShipmentStatus
      if (!canTransition(COURIER_SHIPMENT, current.status, to)) return hold(reading, 'not_allowed')
      if (
        to === 'out_for_delivery' &&
        current.status === 'delivery_failed' &&
        current.attempt_count >= MAX_DELIVERY_ATTEMPTS
      ) {
        return hold(reading, 'not_allowed')
      }
      if (codCollected && (to === 'delivery_failed' || to === 'returning'))
        return hold(reading, 'cod_collected')
      const key = statuses.length > 1 ? `${reading.event_key}#${index + 1}` : reading.event_key
      current = await applyStatus(trx, current, to, reading, key, requestId)
    }
    await setEventOutcome(trx, reading.id, {
      status: 'applied',
      mappedStatus: statuses[statuses.length - 1],
    })
  }
  return 'replayed'
}

async function historyHasReturnStage(
  trx: TransactionClientContract,
  shipmentId: string,
  providerCode: string
) {
  const labels = await trx
    .from('courier_events')
    .where('shipment_id', shipmentId)
    .select('raw_status')
  return labels.some((row) => isReturnStage(providerCode, row.raw_status))
}

function notice(kind: 'record_returned_to_origin' | 'courier_refund' | null, shipmentId: string) {
  if (kind === 'courier_refund') raiseAlert('courier.refund_initiated', { shipment_id: shipmentId })
  else if (kind === 'record_returned_to_origin') {
    logger.info(
      { event: 'courier.vendor_notice', notice: kind, shipment_id: shipmentId },
      'vendor notice'
    )
  }
}

async function applyStatus(
  trx: TransactionClientContract,
  current: ShipmentRow,
  to: ShipmentStatus,
  reading: Reading,
  key: string,
  requestId: string | null
) {
  const occurred = reading.occurred_at ? new Date(reading.occurred_at) : new Date()
  const patch: Record<string, unknown> = {}
  if (to === 'shipped') {
    const lines = await trx
      .from('shipment_items')
      .where('shipment_id', current.id)
      .select('order_item_id', 'quantity')
    const problems = await consumeForShipment(trx, {
      shopId: current.shop_id,
      shipmentId: current.id,
      lines: lines.map((line) => ({
        orderItemId: line.order_item_id,
        quantity: Number(line.quantity),
      })),
      requestId,
    })
    if (problems.length > 0) throw new StockConsumptionFailed(problems)
    patch.shipped_at = occurred
    patch.attempt_count = 1
    if (current.cancel_requested_at) {
      patch.cancel_requested_at = null
      patch.cancel_requested_by = null
      raiseAlert('courier.pickup_after_cancel_request', {
        shipment_id: current.id,
        requested_by: current.cancel_requested_by,
      })
    }
  } else if (to === 'out_for_delivery' && current.status === 'delivery_failed') {
    patch.attempt_count = current.attempt_count + 1
  } else if (to === 'delivered') {
    const days = Number(await settingIn(trx, 'return_window_days', 7))
    const shippedAt = current.shipped_at ? new Date(current.shipped_at) : occurred
    const deliveredAt = occurred < shippedAt ? shippedAt : occurred
    patch.delivered_at = deliveredAt
    patch.return_window_ends_at = new Date(deliveredAt.getTime() + days * 86_400_000)
  }
  const [updated] = await trx
    .from('shipments')
    .where({ id: current.id, status: current.status })
    .update({ ...patch, status: to, version: trx.raw('version + 1'), updated_at: trx.raw('now()') })
    .returning('*')
  await trx.rawQuery(
    `INSERT INTO shipment_events (shipment_id, shop_id, event, status, reason_code, actor_type, raw_status,
       provider_event_key, occurred_at)
     VALUES (?, ?, ?, ?, CASE WHEN ? = 'delivery_failed' THEN 'other' END, 'provider', ?, ?, ?)
     ON CONFLICT (shipment_id, provider_event_key) WHERE provider_event_key IS NOT NULL DO NOTHING`,
    [
      current.id,
      current.shop_id,
      to === 'shipped' ? 'picked_up' : to,
      to,
      to,
      reading.raw_status.slice(0, 100),
      key,
      occurred,
    ]
  )
  if (to === 'delivered' || to === 'shipped' || to === 'returning' || to === 'delivery_failed') {
    logger.info(
      { event: 'courier.customer_notice', status: to, shipment_id: current.id },
      'customer notice'
    )
  }
  return updated
}
