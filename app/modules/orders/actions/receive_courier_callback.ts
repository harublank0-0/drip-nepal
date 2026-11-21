import { createHash } from 'node:crypto'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DomainError } from '#exceptions/domain_error'
import {
  callbackKeyEvent,
  courierCallbackTokenMatches,
  parseCourierCallback,
} from '#modules/logistics/actions/courier_calls'
import { eventKeys, recordCourierEvents } from '#modules/logistics/actions/courier_events'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'

/*
 * `receiveCourierCallback` (docs/06 §12.6, docs/04a §9.14; M6). The route
 * applies `webhook_ip` first and caps the body at 64 KB; this action then:
 *
 * 1. checks the URL token against `HMAC(courier callback key, account id)`
 *    in constant time, before any database read, accepting every key of the
 *    ring during a rotation; then loads the account: a wrong token, an unknown
 *    account or another provider's path answers 401 and stores nothing, with
 *    one `logistics.callback_rejected` line that never holds the token, the
 *    query string or the body (only its SHA-256);
 * 2. lets the caller charge the per-account `courier_callback` limiter;
 * 3. parses the body with the courier's adapter: a test event, a comment, an
 *    unreadable body, a parcel that matches no shipment of the account, or a
 *    `disabled` account is answered 200 and stores nothing;
 * 4. in one transaction stores one row per parcel `ON CONFLICT DO NOTHING`
 *    and sends the status job for each new row; a duplicate sends nothing.
 *
 * No courier call happens here: the job reads the parcel's history (05 §6.3).
 */

export type CallbackResult = { stored: number; duplicates: number; ignored: string | null }

function rejected(providerCode: string, accountId: string, reason: string, bodySha256: string) {
  logger.warn(
    {
      event: 'logistics.callback_rejected',
      provider_code: providerCode,
      account_id: accountId,
      reason,
      body_sha256: bodySha256,
    },
    'courier callback rejected'
  )
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export async function authenticateCourierCallback(command: {
  providerCode: string
  accountId: string
  token: string | null
  bodySha256: string
}) {
  if (
    !UUID.test(command.accountId) ||
    !courierCallbackTokenMatches(command.accountId, command.token)
  ) {
    rejected(command.providerCode, command.accountId, 'bad_token', command.bodySha256)
    throw new DomainError('UNAUTHENTICATED')
  }
  const account = await db
    .from('logistics_accounts')
    .where('id', command.accountId)
    .select('id', 'provider_code', 'status')
    .first()
  if (!account || account.provider_code !== command.providerCode) {
    rejected(command.providerCode, command.accountId, 'unknown_account', command.bodySha256)
    throw new DomainError('UNAUTHENTICATED')
  }
  return { status: account.status as string }
}

export async function storeCourierCallback(command: {
  providerCode: string
  accountId: string
  accountStatus: string
  rawBody: string
  requestId: string | null
}): Promise<CallbackResult> {
  const bodySha = createHash('sha256').update(command.rawBody, 'utf8').digest()
  if (command.accountStatus === 'disabled')
    return { stored: 0, duplicates: 0, ignored: 'account_disabled' }
  const parsed = parseCourierCallback(command.providerCode, command.rawBody)
  if (!parsed || parsed.kind === 'invalid') {
    rejected(command.providerCode, command.accountId, 'unreadable', bodySha.toString('hex'))
    return { stored: 0, duplicates: 0, ignored: 'unreadable' }
  }
  if (parsed.kind !== 'events') return { stored: 0, duplicates: 0, ignored: parsed.kind }

  const ids = parsed.events.map((event) => event.externalShipmentId)
  const shipments = await db
    .from('shipments')
    .where('logistics_account_id', command.accountId)
    .whereIn('external_shipment_id', ids)
    .select('id', 'shop_id', 'external_shipment_id')
  const byExternal = new Map(shipments.map((row) => [row.external_shipment_id as string, row]))
  const matched = parsed.events.filter((event) => byExternal.has(event.externalShipmentId))
  if (matched.length < parsed.events.length) {
    rejected(command.providerCode, command.accountId, 'unmatched', bodySha.toString('hex'))
  }
  if (matched.length === 0) return { stored: 0, duplicates: 0, ignored: 'unmatched' }

  return withTx(async (trx) => {
    const inserted = await recordCourierEvents(
      trx,
      matched.map((event) => {
        const shipment = byExternal.get(event.externalShipmentId)!
        return {
          accountId: command.accountId,
          source: 'callback' as const,
          eventKey: eventKeys.callback(
            event.externalShipmentId,
            callbackKeyEvent(command.providerCode, event.rawEvent)
          ),
          externalShipmentId: event.externalShipmentId,
          shipmentId: shipment.id,
          shopId: shipment.shop_id,
          rawEvent: event.rawEvent,
          rawStatus: event.rawStatus,
          occurredAt: event.occurredAt,
          payload: event.payload,
          rawBodySha256: bodySha,
          requestId: command.requestId,
        }
      })
    )
    for (const row of inserted) {
      const external = row.event_key.split(':')[1]
      const shipment = byExternal.get(external)!
      await sendJob(trx, 'orders.process_courier_event', {
        shipment_id: shipment.id,
        shop_id: shipment.shop_id,
        courier_event_id: row.id,
        request_id: command.requestId,
        causation_id: null,
      })
    }
    return { stored: inserted.length, duplicates: matched.length - inserted.length, ignored: null }
  })
}
