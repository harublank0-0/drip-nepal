import db from '@adonisjs/lucid/services/db'
import { callbackTokenFor, callbackTokenMatches } from '#modules/logistics/internal/callback_token'
import { courierAccountFrom } from '#modules/logistics/providers/courier_accounts'
import { mapNcmLabel, normaliseLabel } from '#modules/logistics/providers/ncm_mapping'
import { ncmCallbackKeyEvent } from '#modules/logistics/providers/ncm'
import { courierProvider } from '#modules/logistics/providers/registry'
import type {
  CourierBookingOutcome,
  CourierBookingRequest,
  CourierCallback,
  CourierParcelDetail,
  CourierResult,
  CourierStatusReading,
} from '#modules/logistics/providers/courier_provider'

/*
 * The courier calls the modules above `logistics` make (docs/09 §2.3 rule 3):
 * the adapters are private to this module, so the `orders` jobs reach them
 * only through these functions. Each loads the account, builds the
 * `CourierAccount` whose credentials decrypt inside the call, and calls the
 * adapter outside any transaction (`PortAdapter.guard`). Nothing here writes.
 */

export type {
  CourierBookingOutcome,
  CourierBookingRequest,
  CourierCallback,
  CourierParcelDetail,
  CourierResult,
  CourierStatusReading,
}

export type LabelMapping =
  | { kind: 'transition'; statuses: string[] }
  | { kind: 'none'; notice: 'record_returned_to_origin' | 'courier_refund' | null }
  | { kind: 'unmapped' }

async function loaded(accountId: string) {
  const row = await db.from('logistics_accounts').where('id', accountId).first()
  if (!row) return null
  const provider = courierProvider(row.provider_code)
  if (!provider) return null
  return {
    provider,
    account: courierAccountFrom({
      id: row.id,
      environment: row.environment,
      credentialsEnc: row.credentials_enc,
    }),
  }
}

const unavailable = <T>(): CourierResult<T> => ({
  ok: false,
  error: { code: 'not_configured', httpStatus: null, fields: [], retryable: false },
})

export async function bookWithCourier(
  accountId: string,
  request: CourierBookingRequest
): Promise<CourierBookingOutcome> {
  const target = await loaded(accountId)
  if (!target) {
    return {
      outcome: 'refused',
      error: { code: 'not_configured', httpStatus: null, fields: [], retryable: false },
    }
  }
  return target.provider.book(target.account, request)
}

export async function readParcelHistory(accountId: string, externalShipmentId: string) {
  const target = await loaded(accountId)
  return target
    ? target.provider.getStatusHistory(target.account, externalShipmentId)
    : unavailable<CourierStatusReading[]>()
}

export async function readParcelDetail(accountId: string, externalShipmentId: string) {
  const target = await loaded(accountId)
  return target
    ? target.provider.getParcel(target.account, externalShipmentId)
    : unavailable<CourierParcelDetail>()
}

export async function readParcelStatuses(accountId: string, externalShipmentIds: string[]) {
  const target = await loaded(accountId)
  return target
    ? target.provider.getStatuses(target.account, externalShipmentIds)
    : unavailable<{ statuses: Map<string, string>; unanswered: string[] }>()
}

/*
 * The account's assigned pickup branches for the booking form (docs/06
 * §13.8), cached per account and version for 15 minutes [A-58], so the form
 * does not spend the courier's daily reads. The request decrypts the
 * credentials inside this call only, which docs/07 §5.5 allows (decided
 * 2026-11-21, C-07). Null when the courier did not answer.
 */
const ASSIGNED_TTL_MS = 15 * 60_000
const assignedCache = new Map<string, { at: number; names: string[] }>()

export async function assignedPickupBranches(accountId: string): Promise<string[] | null> {
  const row = await db.from('logistics_accounts').where('id', accountId).select('version').first()
  if (!row) return null
  const key = `${accountId}:${row.version}`
  const cached = assignedCache.get(key)
  if (cached && Date.now() - cached.at < ASSIGNED_TTL_MS) return cached.names
  const target = await loaded(accountId)
  if (!target) return null
  const result = await target.provider.listAssignedBranches(target.account)
  if (!result.ok) return null
  assignedCache.set(key, { at: Date.now(), names: result.value })
  return result.value
}

// Tests only.
export function clearAssignedBranchCache() {
  assignedCache.clear()
}

export function parseCourierCallback(
  providerCode: string,
  rawBody: string
): CourierCallback | null {
  return courierProvider(providerCode)?.parseCallback(rawBody) ?? null
}

// The event part of a callback's inbox key: a documented event or `unknown`, never the body.
export function callbackKeyEvent(providerCode: string, event: string | null) {
  return providerCode === 'ncm' ? ncmCallbackKeyEvent(event ?? '') : 'unknown'
}

/*
 * A courier label mapped for a shipment's current status (docs/05 §6.3): zero,
 * one or two statuses, a notice, or unmapped. NCM is R1's only mapping.
 */
export function mapCourierLabel(
  providerCode: string,
  label: string,
  currentStatus: string
): LabelMapping {
  if (providerCode !== 'ncm') return { kind: 'unmapped' }
  return mapNcmLabel(label, currentStatus) as LabelMapping
}

export function normaliseCourierLabel(label: string) {
  return normaliseLabel(label)
}

export function courierCallbackToken(accountId: string) {
  return callbackTokenFor(accountId)
}

export function courierCallbackTokenMatches(accountId: string, token: string | null | undefined) {
  return callbackTokenMatches(accountId, token)
}

export function courierCapabilitiesOf(providerCode: string) {
  return courierProvider(providerCode)?.capabilities ?? null
}
