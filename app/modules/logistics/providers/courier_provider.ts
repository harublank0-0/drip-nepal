import type { CourierCapabilities } from '#modules/logistics/domain/courier_capability'
import type { LogisticsEnvironment } from '#modules/logistics/domain/logistics_environment'

/*
 * The `CourierProvider` port (ADR-0019 decision 6, Proposed until VX-16).
 * Every courier call goes through it, outside any database transaction
 * (docs/03 §11.4). An adapter never logs, and never puts in an error, a
 * credential or a recipient's name, phone number or address (docs/07 §5,
 * T-FUL-109). What the callers do with the answers is docs/05 §6.3 and the
 * tables of docs/04a §9.12 to §9.14.
 */

/*
 * A courier account as the adapter sees it. The credentials are read only
 * when a call needs them: in M6 the resolver decrypts
 * `logistics_accounts.credentials_enc` in the worker (docs/04a §9.9).
 */
export interface CourierAccount {
  id: string
  environment: LogisticsEnvironment
  credentials: () => Promise<{ token: string }>
}

/*
 * What a booking sends. Amounts are paisa (ADR-0007); the adapter turns
 * them into the courier's format. The recipient fields are personal data:
 * they go to the courier and nowhere else.
 */
export interface CourierBookingRequest {
  merchantReference: string
  serviceCode: string
  codAmountMinor: number
  originBranchName: string | null
  destinationBranchName: string | null
  recipient: {
    name: string
    phone: string
    secondaryPhone: string | null
    address: string
  }
  packageDescription: string | null
  instructions: string | null
  weightGrams: number | null
}

/*
 * The adapter's normalised reasons (`shipment_booking_attempts.error_code`,
 * docs/04a §9.13).
 */
export type CourierErrorCode =
  | 'invalid_branch'
  | 'invalid_phone'
  | 'invalid_cod_amount'
  | 'invalid_name'
  | 'invalid_address'
  | 'invalid_request'
  | 'auth_failed'
  | 'not_found'
  | 'rate_limited'
  | 'connection_failed'
  | 'timeout'
  | 'not_configured'
  | 'unexpected_response'
  | 'courier_error'

export interface CourierError {
  code: CourierErrorCode
  httpStatus: number | null
  // The courier's own wording only, at most 500 characters; never a value DripNepal sent.
  detail: string | null
  // True when the request certainly did not reach the courier, or was refused before any effect.
  retryable: boolean
}

/*
 * The three outcomes of `shipment_booking_attempts.outcome` (docs/04a
 * §9.13) after the call: `refused` is a definite no, `unknown` may have
 * created a booking and is never retried by itself (docs/05 §6.3).
 */
export type CourierBookingOutcome =
  | { outcome: 'succeeded'; externalShipmentId: string }
  | { outcome: 'refused'; error: CourierError }
  | { outcome: 'unknown'; error: CourierError }

export type CourierResult<T> = { ok: true; value: T } | { ok: false; error: CourierError }

// One status reading of a parcel, from a poll, a lookup or a callback.
export interface CourierStatusReading {
  externalShipmentId: string
  rawEvent: string | null
  rawStatus: string
  occurredAt: Date | null
}

export interface CourierParcelDetail {
  externalShipmentId: string
  codAmountMinor: number | null
  deliveryChargeMinor: number | null
  lastStatus: string | null
  paymentStatus: string | null
  // NCM's `vendor_return` flag, when the courier sends it [Verify-external VX-16].
  returnedToVendor: boolean | null
}

export interface CourierBulkStatuses {
  statuses: Map<string, string>
  // IDs the courier gave no status for; flagged for a person, never marked healthy.
  unanswered: string[]
}

export interface CourierBranch {
  name: string
  externalBranchId: string | null
  code: string | null
  courierDistrict: string | null
  coveredAreas: string | null
  phone: string | null
}

/*
 * A parsed callback body. `events` has one entry per parcel; `payload` is
 * the redacted copy for `courier_events.payload` (docs/04a §9.14).
 */
export type CourierCallback =
  | { kind: 'test' }
  | { kind: 'ignored'; reason: string }
  | { kind: 'invalid' }
  | {
      kind: 'events'
      events: (CourierStatusReading & { payload: Record<string, string> })[]
    }

export interface CourierProvider {
  readonly code: string
  readonly capabilities: CourierCapabilities

  book(account: CourierAccount, request: CourierBookingRequest): Promise<CourierBookingOutcome>
  getParcel(
    account: CourierAccount,
    externalShipmentId: string
  ): Promise<CourierResult<CourierParcelDetail>>
  getStatusHistory(
    account: CourierAccount,
    externalShipmentId: string
  ): Promise<CourierResult<CourierStatusReading[]>>
  getStatuses(
    account: CourierAccount,
    externalShipmentIds: string[]
  ): Promise<CourierResult<CourierBulkStatuses>>
  listBranches(account: CourierAccount): Promise<CourierResult<CourierBranch[]>>
  listAssignedBranches(account: CourierAccount): Promise<CourierResult<string[]>>
  // Pure: reads a callback body; trusts nothing in it (docs/05 §6.3, `signed_callback`).
  parseCallback(rawBody: string): CourierCallback
}
