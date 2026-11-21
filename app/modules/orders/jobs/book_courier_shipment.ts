import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { raiseAlert } from '#modules/platform/alerts'
import { jobTx } from '#modules/platform/tx'
import {
  claimBookingAttempt,
  finishBookingAttempt,
  hasDecidedBookAttempt,
  isClaimTaken,
  recordLateSuccess,
} from '#modules/logistics/actions/booking_attempts'
import {
  bookWithCourier,
  type CourierBookingOutcome,
} from '#modules/logistics/actions/courier_calls'
import { markAccountInvalid } from '#modules/logistics/actions/courier_accounts'
import type { JobPayloads } from '#modules/platform/jobs'
import type { ShipmentRow } from '#modules/orders/queries'

/*
 * `orders.book_courier_shipment` (docs/04a §9.13, docs/05 §6.3; M6). For a
 * shipment in `booking_requested`:
 *
 * 1. claim a `book` attempt in its own short transaction, before the call: a
 *    second worker's claim gets 23505 and stops, so one parcel is never sent
 *    twice at once (T-FUL-111);
 * 2. decrypt the delivery-address snapshot (the one place allowed to, docs/07
 *    §5.5) and call the courier outside any transaction;
 * 3. in one transaction, record the outcome on the attempt and apply the
 *    shipment's transition:
 *    - `succeeded` → `booked` with the courier's ID;
 *    - `refused` → `booking_failed` (an `auth_failed` also makes the account
 *      `invalid`); a retryable refusal (the request never reached the
 *      courier, or it asked us to slow down) is retried with a new attempt
 *      under the same reference, and only the last retry fails the booking;
 *    - `unknown` → `needs_reconciliation` at once with an admin alert: NCM has
 *      no lookup by reference, so the booking is never sent again by itself.
 *
 * A courier answer that arrives after the sweeper marked the claim `unknown`
 * still counts: the attempt becomes `succeeded` and a shipment still in
 * `needs_reconciliation` becomes `booked`; if staff already resolved it, an
 * admin alert says a parcel may now be booked twice.
 */

export class RetryableBookingRefusal extends Error {
  constructor(code: string) {
    super(`courier refused the booking for now (${code}); retrying`)
    this.name = 'RetryableBookingRefusal'
  }
}

type JobInfo = { retryCount: number; retryLimit: number; requestId: string | null }

type Snapshot = Record<string, unknown>

const member = (snapshot: Snapshot, name: string) => {
  const value = snapshot[name]
  return typeof value === 'string' && value.length > 0
    ? decryptField(value, `orders.shipping_address.${name}`)
    : null
}

// The recipient as the courier needs it, from the order's snapshot (schema 1).
function recipientFrom(snapshot: Snapshot) {
  const parts = [
    member(snapshot, 'area_tole_enc'),
    member(snapshot, 'street_landmark_enc'),
    snapshot.ward_no ? `Ward ${snapshot.ward_no}` : null,
    snapshot.local_level_name_en ?? null,
    snapshot.district_name_en ?? null,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0)
  return {
    name: member(snapshot, 'recipient_name_enc') ?? '',
    phone: member(snapshot, 'recipient_phone_enc') ?? '',
    secondaryPhone: null,
    address: parts.join(', '),
  }
}

async function loadBooking(shipmentId: string, shopId: string) {
  return jobTx(async (trx) => {
    const shipment = await trx.from('shipments').where({ id: shipmentId, shop_id: shopId }).first()
    if (!shipment || shipment.status !== 'booking_requested') return null
    const order = await trx
      .from('orders as o')
      .join('shop_orders as so', 'so.order_id', 'o.id')
      .where('so.id', shipment.shop_order_id)
      .select('o.shipping_address')
      .first()
    const branches = await trx
      .from('logistics_branches')
      .whereIn('id', [shipment.origin_branch_id, shipment.destination_branch_id].filter(Boolean))
      .select('id', 'name')
    const units = await trx
      .from('shipment_items')
      .where('shipment_id', shipmentId)
      .sum('quantity as n')
      .first()
    const name = (id: string | null) => branches.find((row) => row.id === id)?.name ?? null
    return {
      shipment,
      snapshot: (typeof order.shipping_address === 'string'
        ? JSON.parse(order.shipping_address)
        : order.shipping_address) as Snapshot,
      originName: name(shipment.origin_branch_id),
      destinationName: name(shipment.destination_branch_id),
      units: Number(units?.n ?? 0),
    }
  })
}

export async function bookCourierShipmentJob(
  payload: JobPayloads['orders.book_courier_shipment'],
  job: JobInfo
) {
  const booking = await loadBooking(payload.shipment_id, payload.shop_id)
  if (!booking) return 'not_waiting'
  const { shipment } = booking

  let attempt: { id: string; attemptNo: number } | null
  try {
    attempt = await jobTx(async (trx) => {
      // Under the shipment's lock the booking must still wait, with no attempt that succeeded or
      // may have: a job that read the shipment just before another job finished would otherwise
      // book the parcel a second time (T-FUL-111). Lock order: the shipment, then its attempts.
      const current = await trx
        .from('shipments')
        .where('id', shipment.id)
        .forUpdate()
        .select('status')
        .first()
      if (current?.status !== 'booking_requested') return null
      if (await hasDecidedBookAttempt(trx, shipment.id)) return null
      return claimBookingAttempt(trx, {
        shipmentId: shipment.id,
        shopId: shipment.shop_id,
        accountId: shipment.logistics_account_id,
        kind: 'book',
        requestId: job.requestId,
      })
    })
  } catch (error) {
    if (isClaimTaken(error)) return 'claimed_elsewhere'
    throw error
  }
  if (!attempt) return 'not_waiting'

  const outcome = await bookWithCourier(shipment.logistics_account_id, {
    merchantReference: shipment.merchant_reference,
    serviceCode: shipment.service_code,
    codAmountMinor: Number(shipment.cod_amount_minor),
    originBranchName: booking.originName,
    destinationBranchName: booking.destinationName,
    recipient: recipientFrom(booking.snapshot),
    packageDescription:
      booking.units > 0 ? `${booking.units} item${booking.units === 1 ? '' : 's'}` : null,
    instructions: null,
    weightGrams: null,
  })

  const lastTry = job.retryCount >= job.retryLimit
  const retry = outcome.outcome === 'refused' && outcome.error.retryable && !lastTry
  const claimed = attempt
  let result: string
  try {
    result = await jobTx((trx) => applyOutcome(trx, shipment, claimed.id, outcome, retry))
  } catch (error) {
    // The courier booked the parcel but its ID could not be saved: the sweeper moves the claim to
    // `needs_reconciliation`, and this alert names the courier's ID for staff.
    if (outcome.outcome === 'succeeded') {
      raiseAlert('courier.booking_outcome_unsaved', {
        shipment_id: shipment.id,
        external_shipment_id: outcome.externalShipmentId,
      })
    }
    throw error
  }
  if (retry) throw new RetryableBookingRefusal(outcome.error.code)
  return result
}

async function applyOutcome(
  trx: TransactionClientContract,
  shipment: ShipmentRow,
  attemptId: string,
  outcome: CourierBookingOutcome,
  retry: boolean
) {
  const succeeded = outcome.outcome === 'succeeded'
  const error = outcome.outcome === 'succeeded' ? null : outcome.error
  // Lock order: the shipment, then its attempt (as the claim and the sweeper take them).
  const current = await trx.from('shipments').where('id', shipment.id).forUpdate().first()
  const written = await finishBookingAttempt(trx, attemptId, {
    outcome: outcome.outcome,
    httpStatus: error?.httpStatus ?? null,
    errorCode: error?.code ?? null,
    errorFields: error?.fields ?? [],
    externalShipmentId: succeeded ? outcome.externalShipmentId : null,
  })
  if (!written) {
    // The sweeper gave up on this claim first; only a success still counts.
    if (!succeeded) return 'claim_already_closed'
    await recordLateSuccess(trx, attemptId, outcome.externalShipmentId, null)
  }
  if (succeeded) {
    if (current.status !== 'booking_requested' && current.status !== 'needs_reconciliation') {
      raiseAlert(
        'courier.late_booking_success',
        {
          shipment_id: shipment.id,
          status: current.status,
          external_shipment_id: outcome.externalShipmentId,
        },
        trx
      )
      return 'late_success_after_resolution'
    }
    await trx
      .from('shipments')
      .where({ id: shipment.id, status: current.status })
      .update({
        status: 'booked',
        external_shipment_id: outcome.externalShipmentId,
        tracking_number: outcome.externalShipmentId.slice(0, 64),
        booked_at: trx.raw('now()'),
        version: trx.raw('version + 1'),
        updated_at: trx.raw('now()'),
      })
    await event(trx, shipment, 'booked')
    return 'booked'
  }
  if (current.status !== 'booking_requested') return 'not_waiting'
  if (outcome.outcome === 'refused') {
    if (retry) return 'retrying'
    await trx
      .from('shipments')
      .where({ id: shipment.id, status: 'booking_requested' })
      .update({
        status: 'booking_failed',
        version: trx.raw('version + 1'),
        updated_at: trx.raw('now()'),
      })
    await event(trx, shipment, 'booking_failed')
    if (outcome.error.code === 'auth_failed' && shipment.logistics_account_id) {
      await markAccountInvalid(trx, shipment.logistics_account_id)
    }
    // The seller notice with the courier's reason waits for the M1 notification handler.
    logger.info(
      { event: 'courier.booking_failed', shipment_id: shipment.id, code: outcome.error.code },
      'courier refused the booking'
    )
    return 'booking_failed'
  }
  await trx
    .from('shipments')
    .where({ id: shipment.id, status: 'booking_requested' })
    .update({
      status: 'needs_reconciliation',
      version: trx.raw('version + 1'),
      updated_at: trx.raw('now()'),
    })
  await event(trx, shipment, 'needs_reconciliation')
  raiseAlert('courier.booking_unknown', { shipment_id: shipment.id, code: outcome.error.code }, trx)
  return 'needs_reconciliation'
}

// Booking-job rows are the system's: a booking answer carries no courier status label (2026-11-21).
async function event(trx: TransactionClientContract, shipment: ShipmentRow, status: string) {
  await trx.table('shipment_events').insert({
    shipment_id: shipment.id,
    shop_id: shipment.shop_id,
    event: status,
    status,
    actor_type: 'system',
  })
}
