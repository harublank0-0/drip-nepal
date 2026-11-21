import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { UNFINISHED_COURIER_STATUSES } from '#modules/orders/domain/shipment_machine'

/*
 * Reads of the `orders` tables for the HTTP layer and the modules that pass
 * checks into `logistics` and `shops` (docs/09 §3.9). Seller reads take the
 * resolved shop ID and only see a shop order once `acceptance_due_at` is set
 * (docs/04a §11 "Access"): anything else is simply not found (T-SEC-001).
 */

export type ShipmentView = {
  id: string
  shopOrderId: string
  shopOrderNumber: string
  shopId: string
  status: string
  logisticsAccountId: string | null
  pickupAddressId: string | null
  merchantReference: string | null
  externalShipmentId: string | null
  serviceCode: string | null
  originBranchId: string | null
  destinationBranchId: string | null
  cancelRequestedAt: Date | null
  cancelRequestedBy: string | null
  codAmountMinor: number | null
  courierName: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  bookedAt: Date | null
  shippedAt: Date | null
  deliveredAt: Date | null
  cancelledAt: Date | null
  returnWindowEndsAt: Date | null
  attemptCount: number
  version: number
  createdAt: Date
  updatedAt: Date
}

type Reader = TransactionClientContract | typeof db

// A `shipments` row as the query builder returns it (snake_case).
export type ShipmentRow = {
  id: string
  shop_order_id: string
  shop_id: string
  status: string
  logistics_account_id: string | null
  pickup_address_id: string | null
  merchant_reference: string | null
  external_shipment_id: string | null
  service_code: string | null
  origin_branch_id: string | null
  destination_branch_id: string | null
  cancel_requested_at: Date | null
  cancel_requested_by: string | null
  cod_amount_minor: string | number | null
  courier_name: string | null
  tracking_number: string | null
  tracking_url: string | null
  booked_at: Date | null
  shipped_at: Date | null
  delivered_at: Date | null
  cancelled_at: Date | null
  return_window_ends_at: Date | null
  attempt_count: number
  version: number
  created_at: Date
  updated_at: Date
  shop_order_number?: string
}

export async function shipmentById(
  reader: Reader,
  shipmentId: string
): Promise<ShipmentView | null> {
  const row = await reader
    .from('shipments as s')
    .join('shop_orders as so', 'so.id', 's.shop_order_id')
    .where('s.id', shipmentId)
    .select('s.*', 'so.number as shop_order_number')
    .first()
  return row ? toView(row) : null
}

export function toView(row: ShipmentRow): ShipmentView {
  return {
    id: row.id,
    shopOrderId: row.shop_order_id,
    shopOrderNumber: row.shop_order_number ?? '',
    shopId: row.shop_id,
    status: row.status,
    logisticsAccountId: row.logistics_account_id,
    pickupAddressId: row.pickup_address_id,
    merchantReference: row.merchant_reference,
    externalShipmentId: row.external_shipment_id,
    serviceCode: row.service_code,
    originBranchId: row.origin_branch_id,
    destinationBranchId: row.destination_branch_id,
    cancelRequestedAt: row.cancel_requested_at,
    cancelRequestedBy: row.cancel_requested_by,
    codAmountMinor: row.cod_amount_minor === null ? null : Number(row.cod_amount_minor),
    courierName: row.courier_name,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    bookedAt: row.booked_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
    returnWindowEndsAt: row.return_window_ends_at,
    attemptCount: row.attempt_count,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// The shop order a seller may see, by its number inside the resolved shop.
export async function sellerShopOrder(shopId: string, number: string) {
  return db
    .from('shop_orders')
    .where({ shop_id: shopId, number })
    .whereNotNull('acceptance_due_at')
    .select('id', 'order_id', 'number', 'status', 'shop_id')
    .first()
}

export async function shopOrderByNumber(number: string) {
  return db
    .from('shop_orders')
    .where('number', number)
    .select('id', 'order_id', 'number', 'status', 'shop_id')
    .first()
}

// The live (not cancelled) shipment of a shop order; R1 has one (A-28).
export async function liveShipmentOf(reader: Reader, shopOrderId: string) {
  const row = await reader
    .from('shipments as s')
    .join('shop_orders as so', 'so.id', 's.shop_order_id')
    .where('s.shop_order_id', shopOrderId)
    .whereNot('s.status', 'cancelled')
    .select('s.*', 'so.number as shop_order_number')
    .first()
  return row ? toView(row) : null
}

// Passed into `logistics` (docs/04a §9.9): a parcel still needs the account.
export async function accountHasUnfinishedShipments(
  trx: TransactionClientContract,
  accountId: string
) {
  const row = await trx
    .from('shipments')
    .where('logistics_account_id', accountId)
    .whereIn('status', [...UNFINISHED_COURIER_STATUSES])
    .first()
  return Boolean(row)
}

// Passed into `shops` (docs/04a §6.6): a shipment references the pickup address.
export async function pickupAddressReferenced(trx: TransactionClientContract, addressId: string) {
  const row = await trx.from('shipments').where('pickup_address_id', addressId).first()
  return Boolean(row)
}

export async function orderByNumber(number: string) {
  return db
    .from('orders')
    .where('number', number)
    .select(
      'id',
      'number',
      'status',
      'verification_status',
      'verification_method',
      'verified_at',
      'verification_notes'
    )
    .first()
}

// The admin queue of docs/06 §13.8 `adminListCourierBookings`.
export async function courierBookingQueue(filters: {
  queue: 'needs_reconciliation' | 'cancel_requested'
  limit: number
  after?: string
}) {
  const query = db
    .from('shipments as s')
    .join('shop_orders as so', 'so.id', 's.shop_order_id')
    .select('s.*', 'so.number as shop_order_number')
    .orderBy('s.updated_at', 'asc')
    .orderBy('s.id', 'asc')
    .limit(filters.limit + 1)
  if (filters.queue === 'needs_reconciliation') query.where('s.status', 'needs_reconciliation')
  else query.where('s.status', 'booked').whereNotNull('s.cancel_requested_at')
  if (filters.after) query.where('s.id', '>', filters.after)
  const rows = await query
  return {
    shipments: rows.slice(0, filters.limit).map(toView),
    next: rows.length > filters.limit ? rows[filters.limit - 1].id : null,
  }
}

// The shipment events of a shipment, oldest first.
export async function shipmentEvents(shipmentId: string) {
  return db
    .from('shipment_events')
    .where('shipment_id', shipmentId)
    .orderBy('occurred_at', 'asc')
    .orderBy('id', 'asc')
    .select(
      'event',
      'status',
      'reason_code',
      'actor_type',
      'raw_status',
      'provider_event_key',
      'occurred_at'
    )
}
