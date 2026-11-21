import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { normaliseLabel } from '#modules/logistics/providers/ncm_mapping'

/*
 * The courier event inbox (docs/04a §9.14), written only by this module; the
 * `orders` receiver and jobs call these step actions. Rows are inserted with
 * `ON CONFLICT (logistics_account_id, event_key) DO NOTHING`, so the same
 * courier message, delivered N times, concurrently or not, is one row
 * (T-FUL-110). Only the processing columns change afterwards
 * (`courier_events_guard`).
 */

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

// Keys of docs/04a §9.14, each at most 197 characters.
export const eventKeys = {
  callback: (externalId: string, event: string) => `callback:${externalId}:${event}`,
  poll: (externalId: string, label: string) =>
    `poll:${externalId}:${sha256(normaliseLabel(label))}`,
  history: (externalId: string, label: string, occurredAt: Date | null) =>
    `history:${externalId}:${sha256(`${normaliseLabel(label)}|${occurredAt?.toISOString() ?? ''}`)}`,
}

export type NewCourierEvent = {
  accountId: string
  source: 'callback' | 'poll' | 'history'
  eventKey: string
  externalShipmentId: string
  shipmentId: string | null
  shopId: string | null
  rawEvent: string | null
  rawStatus: string
  occurredAt: Date | null
  payload: Record<string, string>
  rawBodySha256: Buffer | null
  requestId: string | null
}

// Inserts the rows that are new and returns their IDs and keys; duplicates return nothing.
export async function recordCourierEvents(trx: TransactionClientContract, rows: NewCourierEvent[]) {
  if (rows.length === 0) return []
  const result = await trx.rawQuery(
    `INSERT INTO courier_events (logistics_account_id, source, event_key, external_shipment_id, shipment_id,
       shop_id, raw_event, raw_status, occurred_at, payload, raw_body_sha256, request_id)
     SELECT r.logistics_account_id, r.source, r.event_key, r.external_shipment_id, r.shipment_id, r.shop_id,
       r.raw_event, r.raw_status, r.occurred_at, r.payload, decode(r.raw_body_sha256, 'hex'), r.request_id
     FROM jsonb_to_recordset(?::jsonb) AS r(logistics_account_id uuid, source text, event_key text,
       external_shipment_id text, shipment_id uuid, shop_id uuid, raw_event text, raw_status text,
       occurred_at timestamptz, payload jsonb, raw_body_sha256 text, request_id text)
     ON CONFLICT (logistics_account_id, event_key) DO NOTHING
     RETURNING id, event_key`,
    [
      JSON.stringify(
        rows.map((row) => ({
          logistics_account_id: row.accountId,
          source: row.source,
          event_key: row.eventKey,
          external_shipment_id: row.externalShipmentId,
          shipment_id: row.shipmentId,
          shop_id: row.shopId,
          raw_event: row.rawEvent,
          raw_status: row.rawStatus.slice(0, 100),
          occurred_at: row.occurredAt?.toISOString() ?? null,
          payload: row.payload,
          raw_body_sha256: row.rawBodySha256?.toString('hex') ?? null,
          request_id: row.requestId,
        }))
      ),
    ]
  )
  return result.rows as { id: string; event_key: string }[]
}

export type EventOutcome = {
  status: 'looked_up' | 'applied' | 'ignored' | 'held' | 'failed'
  holdReason?: string | null
  mappedStatus?: string | null
  error?: string | null
}

// Records an event's outcome while it is still open (`pending` or `failed`).
export async function setEventOutcome(
  trx: TransactionClientContract,
  eventId: string,
  outcome: EventOutcome
) {
  const rows = await trx
    .from('courier_events')
    .where('id', eventId)
    .whereIn('processing_status', ['pending', 'failed'])
    .update({
      processing_status: outcome.status,
      processed_at: trx.raw('now()'),
      hold_reason: outcome.holdReason ?? null,
      mapped_status: outcome.mappedStatus ?? null,
      error: outcome.error ? outcome.error.slice(0, 2000) : null,
    })
    .returning('id')
  return rows.length === 1
}

// Staff close a held reading as `applied` or `ignored`; `hold_reason` stays as the record.
export async function closeHeldEvent(
  trx: TransactionClientContract,
  eventId: string,
  status: 'applied' | 'ignored'
) {
  const rows = await trx
    .from('courier_events')
    .where({ id: eventId, processing_status: 'held' })
    .update({ processing_status: status, processed_at: trx.raw('now()') })
    .returning(['id', 'shipment_id', 'shop_id', 'logistics_account_id'])
  return rows[0] ?? null
}

// The open readings of a shipment, oldest courier time first (the replay order).
export async function openReadings(trx: TransactionClientContract, shipmentId: string) {
  return trx
    .from('courier_events')
    .where('shipment_id', shipmentId)
    .whereIn('source', ['history'])
    .whereIn('processing_status', ['pending', 'failed'])
    .orderByRaw('occurred_at ASC NULLS FIRST, received_at ASC, id ASC')
    .forUpdate()
}

// A held reading stops the replay for its shipment until staff resolve it (docs/05 §6.3).
export async function hasHeldReading(trx: TransactionClientContract, shipmentId: string) {
  const row = await trx
    .from('courier_events')
    .where({ shipment_id: shipmentId, processing_status: 'held' })
    .first()
  return Boolean(row)
}

// Readings whose processing job was lost (sweeper over `courier_events_pending_idx`).
export async function staleOpenEvents(olderThanSeconds: number, limit: number) {
  return db
    .from('courier_events')
    .whereIn('processing_status', ['pending', 'failed'])
    .whereNotNull('shipment_id')
    .where('received_at', '<', db.raw(`now() - make_interval(secs => ?)`, [olderThanSeconds]))
    .orderBy('received_at', 'asc')
    .limit(limit)
    .select('id', 'shipment_id', 'shop_id', 'logistics_account_id', 'source')
}

export async function courierEvent(eventId: string) {
  return db.from('courier_events').where('id', eventId).first()
}

export async function listCourierEvents(filters: {
  processingStatus?: string
  shipmentId?: string
  limit: number
  after?: string
}) {
  const query = db
    .from('courier_events')
    .orderBy('id', 'desc')
    .limit(filters.limit + 1)
  if (filters.processingStatus) query.where('processing_status', filters.processingStatus)
  if (filters.shipmentId) query.where('shipment_id', filters.shipmentId)
  if (filters.after) query.where('id', '<', filters.after)
  const rows = await query
  return {
    events: rows.slice(0, filters.limit),
    next: rows.length > filters.limit ? rows[filters.limit - 1].id : null,
  }
}
