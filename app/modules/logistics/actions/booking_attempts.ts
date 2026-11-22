import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * `shipment_booking_attempts` (docs/04a §9.13), written only by this module
 * (docs/09 §2.1); the `orders` jobs call these step actions. The job claims
 * an attempt in its own short transaction **before** the courier call, so a
 * timeout leaves evidence and two workers cannot both call: the second claim
 * gets 23505 on `shipment_booking_attempts_in_flight_key` (T-FUL-111). The
 * outcome is written once, in the transaction that applies the shipment's
 * transition; the one later change is a late success.
 */

export const IN_FLIGHT_CONSTRAINT = 'shipment_booking_attempts_in_flight_key'

export function isClaimTaken(error: unknown) {
  const e = error as { code?: string; constraint?: string }
  return (
    e.code === '23505' &&
    (e.constraint === IN_FLIGHT_CONSTRAINT || e.constraint === 'shipment_booking_attempts_no_key')
  )
}

export async function claimBookingAttempt(
  trx: TransactionClientContract,
  command: {
    shipmentId: string
    shopId: string
    accountId: string
    kind: 'book' | 'cancel' | 'reference_lookup'
    requestId: string | null
  }
) {
  const last = await trx
    .from('shipment_booking_attempts')
    .where({ shipment_id: command.shipmentId, kind: command.kind })
    .max('attempt_no as n')
    .first()
  const attemptNo = Number(last?.n ?? 0) + 1
  const [row] = await trx
    .table('shipment_booking_attempts')
    .insert({
      shipment_id: command.shipmentId,
      shop_id: command.shopId,
      logistics_account_id: command.accountId,
      kind: command.kind,
      attempt_no: attemptNo,
      request_id: command.requestId,
    })
    .returning(['id'])
  return { id: row.id as string, attemptNo }
}

export type AttemptResult = {
  outcome: 'succeeded' | 'refused' | 'unknown'
  httpStatus: number | null
  errorCode: string | null
  errorFields: string[]
  externalShipmentId: string | null
}

// Writes the outcome of a claimed attempt; false when it was already written (the sweeper won).
export async function finishBookingAttempt(
  trx: TransactionClientContract,
  attemptId: string,
  result: AttemptResult
) {
  const rows = await trx
    .from('shipment_booking_attempts')
    .where({ id: attemptId, outcome: 'pending' })
    .update({
      outcome: result.outcome,
      http_status: result.httpStatus,
      error_code: result.errorCode,
      error_fields:
        result.errorFields.length > 0 ? result.errorFields.slice(0, 10).join(',') : null,
      external_shipment_id: result.externalShipmentId,
      finished_at: trx.raw('now()'),
    })
    .returning('id')
  return rows.length === 1
}

// A courier answer after the sweeper marked the claim `unknown` still counts (docs/05 §6.3).
export async function recordLateSuccess(
  trx: TransactionClientContract,
  attemptId: string,
  externalShipmentId: string,
  httpStatus: number | null
) {
  const rows = await trx
    .from('shipment_booking_attempts')
    .where({ id: attemptId, outcome: 'unknown', kind: 'book' })
    .update({
      outcome: 'succeeded',
      external_shipment_id: externalShipmentId,
      http_status: httpStatus,
    })
    .returning('id')
  return rows.length === 1
}

/*
 * The sweeper's half: claims older than the call's timeout plus a margin
 * belong to a worker that died during the call, so their outcome is unknown
 * (docs/03 §11.4). Returns the shipments whose booking is now unresolved.
 */
// The shipments whose claim is older than the age, for the caller to lock before
// `markStaleClaimsUnknown` (lock order: shipments, then their attempts).
export async function staleClaimShipments(
  trx: TransactionClientContract,
  olderThanSeconds: number
) {
  const rows = await trx
    .from('shipment_booking_attempts')
    .where('outcome', 'pending')
    .where('started_at', '<', trx.raw(`now() - make_interval(secs => ?)`, [olderThanSeconds]))
    .distinct('shipment_id')
  return rows.map((row) => row.shipment_id as string)
}

export async function markStaleClaimsUnknown(
  trx: TransactionClientContract,
  olderThanSeconds: number,
  shipmentIds: string[]
) {
  if (shipmentIds.length === 0) return []
  return trx
    .from('shipment_booking_attempts')
    .whereIn('shipment_id', shipmentIds)
    .where('outcome', 'pending')
    .where('started_at', '<', trx.raw(`now() - make_interval(secs => ?)`, [olderThanSeconds]))
    .update({ outcome: 'unknown', error_code: 'timeout', finished_at: trx.raw('now()') })
    .returning(['id', 'shipment_id', 'shop_id', 'kind'])
}

// A `book` attempt that succeeded, or may have: the parcel may exist at the courier.
export async function hasDecidedBookAttempt(trx: TransactionClientContract, shipmentId: string) {
  const row = await trx
    .from('shipment_booking_attempts')
    .where({ shipment_id: shipmentId, kind: 'book' })
    .whereIn('outcome', ['succeeded', 'unknown'])
    .first()
  return Boolean(row)
}

export async function attemptsOf(shipmentIds: string[]) {
  if (shipmentIds.length === 0) return []
  return db
    .from('shipment_booking_attempts')
    .whereIn('shipment_id', shipmentIds)
    .orderBy('started_at', 'asc')
    .select(
      'id',
      'shipment_id',
      'kind',
      'attempt_no',
      'outcome',
      'http_status',
      'error_code',
      'error_fields',
      'external_shipment_id',
      'started_at',
      'finished_at'
    )
}
