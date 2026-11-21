import db from '@adonisjs/lucid/services/db'
import { raiseAlert } from '#modules/platform/alerts'
import { sendJob } from '#modules/platform/jobs'
import { jobTx } from '#modules/platform/tx'
import {
  markStaleClaimsUnknown,
  staleClaimShipments,
} from '#modules/logistics/actions/booking_attempts'
import {
  eventKeys,
  recordCourierEvents,
  staleOpenEvents,
} from '#modules/logistics/actions/courier_events'
import { readParcelStatuses } from '#modules/logistics/actions/courier_calls'
import { MOVING_COURIER_STATUSES } from '#modules/orders/domain/shipment_machine'

/*
 * The scheduled courier jobs (docs/04a §9.13, §9.14, §11.5; M6). Schedules
 * and limits were set with the M6 code (docs/03 §9 rows, 2026-11-21):
 *
 * - `orders.poll_courier_statuses`, every 30 minutes: reads the current label
 *   of every parcel still moving, at most 100 per call (NCM's advice). Each
 *   answer is a trigger row keyed by parcel and label, so the same label
 *   polled again is the same row; a new label sends the status job, which
 *   finds what a lost callback missed.
 * - `orders.sweep_courier_bookings`, every 5 minutes: a booking claim older
 *   than the call's timeout plus a margin belongs to a worker that died, so
 *   its outcome is unknown and its shipment goes to `needs_reconciliation`;
 *   a `booking_requested` shipment with no attempt for 15 minutes lost its job
 *   before any call, so the job is sent again (nothing reached the courier).
 * - `orders.sweep_courier_events`, every 15 minutes: re-sends the status job
 *   for readings left `pending` or `failed` for 10 minutes.
 */

export const POLL_BATCH = 100
// The booking call's 10 s timeout (A-51) plus a margin.
export const STALE_CLAIM_SECONDS = 300
export const LOST_BOOKING_JOB_SECONDS = 900
export const STALE_EVENT_SECONDS = 600

export async function pollCourierStatuses(requestId: string | null) {
  const moving = await db
    .from('shipments')
    .whereNotNull('logistics_account_id')
    .whereNotNull('external_shipment_id')
    .whereIn('status', [...MOVING_COURIER_STATUSES])
    .select('id', 'shop_id', 'logistics_account_id', 'external_shipment_id')
  const byAccount = new Map<string, typeof moving>()
  for (const row of moving) {
    byAccount.set(row.logistics_account_id, [
      ...(byAccount.get(row.logistics_account_id) ?? []),
      row,
    ])
  }
  let triggered = 0
  for (const [accountId, rows] of byAccount) {
    for (let start = 0; start < rows.length; start += POLL_BATCH) {
      const batch = rows.slice(start, start + POLL_BATCH)
      const answer = await readParcelStatuses(
        accountId,
        batch.map((row) => row.external_shipment_id)
      )
      if (!answer.ok) continue
      await jobTx(async (trx) => {
        for (const row of batch) {
          const label = answer.value.statuses.get(row.external_shipment_id)
          if (!label) continue
          const inserted = await recordCourierEvents(trx, [
            {
              accountId,
              source: 'poll',
              eventKey: eventKeys.poll(row.external_shipment_id, label),
              externalShipmentId: row.external_shipment_id,
              shipmentId: row.id,
              shopId: row.shop_id,
              rawEvent: null,
              rawStatus: label,
              occurredAt: null,
              payload: { status: label.slice(0, 256) },
              rawBodySha256: null,
              requestId,
            },
          ])
          if (inserted.length === 0) continue
          triggered++
          await sendJob(trx, 'orders.process_courier_event', {
            shipment_id: row.id,
            shop_id: row.shop_id,
            courier_event_id: inserted[0].id,
            request_id: requestId,
            causation_id: null,
          })
        }
      })
    }
  }
  return { moving: moving.length, triggered }
}

// The ages are parameters for tests, whose transaction holds now() still; the jobs use the defaults.
export async function sweepCourierBookings(
  requestId: string | null,
  staleSeconds = STALE_CLAIM_SECONDS,
  lostSeconds = LOST_BOOKING_JOB_SECONDS
) {
  return jobTx(async (trx) => {
    // Lock order: the shipments first, then their attempts (as the booking job takes them).
    const shipmentIds = await staleClaimShipments(trx, staleSeconds)
    if (shipmentIds.length > 0) {
      await trx.from('shipments').whereIn('id', shipmentIds).orderBy('id').forUpdate().select('id')
    }
    const stale = await markStaleClaimsUnknown(trx, staleSeconds, shipmentIds)
    let unresolved = 0
    for (const claim of stale.filter((row) => row.kind === 'book')) {
      const moved = await trx
        .from('shipments')
        .where({ id: claim.shipment_id, status: 'booking_requested' })
        .update({
          status: 'needs_reconciliation',
          version: trx.raw('version + 1'),
          updated_at: trx.raw('now()'),
        })
        .returning(['id', 'shop_id'])
      if (moved.length === 0) continue
      unresolved++
      await trx.table('shipment_events').insert({
        shipment_id: claim.shipment_id,
        shop_id: claim.shop_id,
        event: 'needs_reconciliation',
        status: 'needs_reconciliation',
        actor_type: 'system',
      })
      raiseAlert(
        'courier.booking_unknown',
        { shipment_id: claim.shipment_id, code: 'worker_lost' },
        trx
      )
    }
    const lost = await trx
      .from('shipments as s')
      .where('s.status', 'booking_requested')
      .where('s.updated_at', '<', trx.raw(`now() - make_interval(secs => ?)`, [lostSeconds]))
      // No attempt in flight or decided: a lost job, or retries that died after a retryable
      // refusal (a refusal for good would have moved the shipment to `booking_failed`).
      .whereNotExists((q) =>
        q
          .from('shipment_booking_attempts as a')
          .whereRaw('a.shipment_id = s.id')
          .whereIn('a.outcome', ['pending', 'succeeded', 'unknown'])
      )
      .select('s.id', 's.shop_id')
    for (const row of lost) {
      await sendJob(trx, 'orders.book_courier_shipment', {
        shipment_id: row.id,
        shop_id: row.shop_id,
        request_id: requestId,
        causation_id: null,
      })
    }
    return { unresolved, resent: lost.length }
  })
}

export async function sweepCourierEvents(
  requestId: string | null,
  staleSeconds = STALE_EVENT_SECONDS
) {
  const open = await staleOpenEvents(staleSeconds, 500)
  const shipments = new Map<string, string>()
  for (const row of open) shipments.set(row.shipment_id, row.shop_id)
  await jobTx(async (trx) => {
    for (const [shipmentId, shopId] of shipments) {
      await sendJob(trx, 'orders.process_courier_event', {
        shipment_id: shipmentId,
        shop_id: shopId,
        courier_event_id: null,
        request_id: requestId,
        causation_id: null,
      })
    }
  })
  return { resent: shipments.size }
}
