import { minorToRupeesFixed, parseRupeesToMinor } from '#shared/format/money'
import type { CourierCapabilities } from '#modules/logistics/domain/courier_capability'
import type { LogisticsEnvironment } from '#modules/logistics/domain/logistics_environment'
import type {
  CourierAccount,
  CourierBookingOutcome,
  CourierBookingRequest,
  CourierBranch,
  CourierBulkStatuses,
  CourierCallback,
  CourierError,
  CourierErrorCode,
  CourierParcelDetail,
  CourierProvider,
  CourierResult,
  CourierStatusReading,
} from '#modules/logistics/providers/courier_provider'

/*
 * The Nepal Can Move adapter (ADR-0019 decision 6, Proposed until VX-16).
 * Its contract is NCM's API document v2 as the `ncm-integration` skill
 * records it (.agents/skills/ncm-integration/references/api-contract.md);
 * only `vendor_return` follows a production response that file labels
 * [observed 2026-11-16]. NCM has confirmed none of the observations, and
 * nothing here has been run against NCM's API. T-FUL-109 tests it on
 * synthetic responses.
 *
 * Rules it keeps:
 * - Only this file talks to NCM (docs/09 §2, T-SEC-016) and only outside a
 *   transaction; every call has a total timeout [Assumption A-51]. The 3 s
 *   connect timeout of docs/03 §11.4 needs an undici dispatcher, which M6
 *   adds when it wires the adapter; until then the total covers it.
 * - A create that may have reached NCM and gave no clear answer is
 *   `unknown`, never retried here: NCM has no lookup by our reference
 *   (docs/05 §6.3, `reference_lookup`).
 * - Nothing it returns carries the token, a value DripNepal sent, or the
 *   courier's own messages (docs/04a §9.13).
 */

export const NCM_CAPABILITIES: CourierCapabilities = {
  booking: true,
  cancellation: false,
  tracking_callback: true,
  tracking_poll: true,
  cod: true,
  reference_lookup: false,
  signed_callback: false,
  branches: true,
}

export interface NcmOptions {
  // The host per account environment. Production is not in NCM's documents (VX-16): null until known.
  baseUrls: Record<LogisticsEnvironment, string | null>
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

const DEFAULT_TIMEOUT_MS = 10_000
// `courier_events_raw_check` (docs/04a §9.14).
const RAW_LIMIT = 100

// The fields of NCM's create call; a field error names one of these (api-contract.md).
const CREATE_FIELDS: ReadonlyMap<string, CourierErrorCode> = new Map([
  ['name', 'invalid_name'],
  ['phone', 'invalid_phone'],
  ['phone2', 'invalid_phone'],
  ['cod_charge', 'invalid_cod_amount'],
  ['address', 'invalid_address'],
  ['fbranch', 'invalid_branch'],
  ['branch', 'invalid_branch'],
  ['package', 'invalid_request'],
  ['vref_id', 'invalid_request'],
  ['instruction', 'invalid_request'],
  ['delivery_type', 'invalid_request'],
  ['weight', 'invalid_request'],
])

// Errors that mean the request never reached NCM: DNS, refused or unreachable, or TLS refused.
const NOT_SENT_CAUSES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_CONNECT_TIMEOUT',
])

// 4xx answers to a create that do not prove NCM stored nothing (a proxy timeout, a conflict).
const CREATE_MAYBE_STORED = new Set([408, 409, 425])

// A token is sent in a header, so only visible ASCII can go; anything else is refused, never sent.
const TOKEN_SHAPE = /^[\x21-\x7e]{8,200}$/

type Reply =
  | { kind: 'response'; status: number; body: unknown; isJson: boolean }
  | { kind: 'timeout' }
  | { kind: 'not_sent' }
  | { kind: 'lost' }
  | { kind: 'not_configured' }
  | { kind: 'bad_credentials' }

function error(
  code: CourierErrorCode,
  httpStatus: number | null,
  fields: string[],
  retryable: boolean
): CourierError {
  return { code, httpStatus, fields, retryable }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/*
 * NCM has four error shapes (`detail`, `Error`, `message`, and `success:
 * false` with `message`). Only the field-error shape (`{"Error": {...}}`)
 * says something we keep: which create fields it names, from the fixed
 * list above. Any other key becomes `other`, and the messages are dropped,
 * because a courier message or key may repeat a phone number or address
 * (docs/04a §9.13).
 */
export function ncmErrorFields(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.Error)) return []
  const fields: string[] = []
  for (const key of Object.keys(body.Error)) {
    const field = CREATE_FIELDS.has(key) ? key : 'other'
    if (!fields.includes(field)) fields.push(field)
  }
  return fields.slice(0, 10)
}

function failure(reply: Reply): CourierError {
  switch (reply.kind) {
    case 'timeout':
      return error('timeout', null, [], false)
    case 'not_sent':
      return error('connection_failed', null, [], true)
    case 'lost':
      return error('courier_error', null, [], false)
    case 'not_configured':
      return error('not_configured', null, [], false)
    case 'bad_credentials':
      // Our side could not produce a usable token. Only NCM's 401 or 403 is
      // `auth_failed`, which marks the account invalid (docs/04a §9.13).
      return error('credentials_unavailable', null, [], false)
    case 'response': {
      if (reply.status === 401 || reply.status === 403) {
        return error('auth_failed', reply.status, [], false)
      }
      if (reply.status === 404) return error('not_found', reply.status, [], false)
      if (reply.status === 429) return error('rate_limited', reply.status, [], true)
      if (CREATE_MAYBE_STORED.has(reply.status))
        return error('courier_error', reply.status, [], false)
      if (reply.status >= 400 && reply.status < 500) {
        const fields = reply.isJson ? ncmErrorFields(reply.body) : []
        return error('invalid_request', reply.status, fields, false)
      }
      if (reply.status >= 200 && reply.status < 300) {
        return error('unexpected_response', reply.status, [], false)
      }
      return error('courier_error', reply.status, [], false)
    }
  }
}

function parseTime(value: unknown): Date | null {
  const raw = text(value)
  if (raw === null) return null
  const time = new Date(raw)
  return Number.isNaN(time.getTime()) ? null : time
}

function parseMoney(value: unknown): number | null {
  const raw = text(value)
  return raw === null ? null : parseRupeesToMinor(raw)
}

// A label or event from NCM, within the inbox's limit; anything longer is not trusted.
function boundedLabel(value: unknown): string | null {
  const raw = text(value)
  if (raw === null) return null
  const trimmed = raw.trim()
  return trimmed !== '' && trimmed.length <= RAW_LIMIT ? trimmed : null
}

/*
 * NCM's undocumented `vendor_return` (VX-16). Production sent the string
 * "False" in the one response observed (2026-11-16); "True" for a returned
 * parcel is reported, not observed; NCM's document shows the return endpoint
 * answering a boolean. So both forms are read, and a truthiness test would
 * take "False" for a return. A missing or null flag is unknown (`null`). Any
 * other value is not guessed: `undefined` makes the read unexpected, so the
 * delivered check is not applied (05 §6.3).
 */
function parseVendorReturn(value: unknown): boolean | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase()
    if (word === 'true') return true
    if (word === 'false') return false
  }
  return undefined
}

// NCM order IDs are integers; anything else cannot be one of ours.
function ncmOrderId(externalShipmentId: string): number | null {
  return /^[1-9]\d{0,14}$/.test(externalShipmentId) ? Number(externalShipmentId) : null
}

function checkedBaseUrl(value: string | null): string | null {
  if (value === null) return null
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('NCM base URLs must use https')
  return url.origin
}

export class NcmCourierProvider implements CourierProvider {
  readonly code = 'ncm'
  readonly capabilities = NCM_CAPABILITIES

  readonly #baseUrls: Record<LogisticsEnvironment, string | null>
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch

  constructor(options: NcmOptions) {
    // A wrong host is a configuration error: fail at start-up, not on a booking.
    this.#baseUrls = {
      sandbox: checkedBaseUrl(options.baseUrls.sandbox),
      production: checkedBaseUrl(options.baseUrls.production),
    }
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async #call(
    account: CourierAccount,
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<Reply> {
    const base = this.#baseUrls[account.environment]
    if (!base) return { kind: 'not_configured' }

    let token: string
    try {
      const credentials = await account.credentials()
      token = credentials.token
    } catch {
      return { kind: 'bad_credentials' }
    }
    if (typeof token !== 'string' || !TOKEN_SHAPE.test(token)) return { kind: 'bad_credentials' }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Token ${token}`,
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await this.#fetch(new URL(path, base), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
        redirect: 'error',
      })
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'TimeoutError') return { kind: 'timeout' }
      const code = isRecord(cause) && isRecord(cause.cause) ? text(cause.cause.code) : null
      return code !== null && NOT_SENT_CAUSES.has(code) ? { kind: 'not_sent' } : { kind: 'lost' }
    }

    let raw: string
    try {
      raw = await response.text()
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'TimeoutError') return { kind: 'timeout' }
      return { kind: 'lost' }
    }
    try {
      return { kind: 'response', status: response.status, body: JSON.parse(raw), isJson: true }
    } catch {
      return { kind: 'response', status: response.status, body: null, isJson: false }
    }
  }

  async #read<T>(
    account: CourierAccount,
    method: 'GET' | 'POST',
    path: string,
    parse: (body: unknown) => T | null,
    body?: unknown
  ): Promise<CourierResult<T>> {
    const reply = await this.#call(account, method, path, body)
    if (reply.kind === 'response' && reply.status >= 200 && reply.status < 300 && reply.isJson) {
      const value = parse(reply.body)
      return value === null
        ? { ok: false, error: error('unexpected_response', reply.status, [], false) }
        : { ok: true, value }
    }
    return { ok: false, error: failure(reply) }
  }

  /*
   * `POST /api/v1/order/create`. Every value goes as a string, as NCM's
   * example sends them; `vref_id` is our `merchant_reference`.
   */
  async book(
    account: CourierAccount,
    request: CourierBookingRequest
  ): Promise<CourierBookingOutcome> {
    const origin = request.originBranchName
    const destination = request.destinationBranchName
    if (origin === null || destination === null) {
      const missing = [
        ...(origin === null ? ['fbranch'] : []),
        ...(destination === null ? ['branch'] : []),
      ]
      // NCM books between branches (`branches`); the action checks this before claiming.
      return { outcome: 'refused', error: error('invalid_branch', null, missing, false) }
    }
    if (!Number.isSafeInteger(request.codAmountMinor) || request.codAmountMinor < 0) {
      return {
        outcome: 'refused',
        error: error('invalid_cod_amount', null, ['cod_charge'], false),
      }
    }

    const body: Record<string, string> = {
      name: request.recipient.name,
      phone: request.recipient.phone,
      phone2: request.recipient.secondaryPhone ?? '',
      cod_charge: minorToRupeesFixed(request.codAmountMinor),
      address: request.recipient.address,
      fbranch: origin,
      branch: destination,
      vref_id: request.merchantReference,
      delivery_type: request.serviceCode,
    }
    if (request.packageDescription) body.package = request.packageDescription
    if (request.instructions) body.instruction = request.instructions
    const weight = request.weightGrams === null ? null : weightKg(request.weightGrams)
    if (weight !== null) body.weight = weight

    const reply = await this.#call(account, 'POST', '/api/v1/order/create', body)
    switch (reply.kind) {
      case 'not_configured':
      case 'bad_credentials':
      case 'not_sent':
        // Nothing reached NCM.
        return { outcome: 'refused', error: failure(reply) }
      case 'timeout':
      case 'lost':
        // The request may have reached NCM and created the parcel.
        return { outcome: 'unknown', error: failure(reply) }
      case 'response':
        break
    }

    if (reply.status >= 200 && reply.status < 300) {
      const id = reply.isJson && isRecord(reply.body) ? text(reply.body.orderid) : null
      return id !== null && ncmOrderId(id) !== null
        ? { outcome: 'succeeded', externalShipmentId: id }
        : // A 2xx without an order ID: NCM may still have created it.
          { outcome: 'unknown', error: error('unexpected_response', reply.status, [], false) }
    }
    if (reply.status === 400 && reply.isJson) {
      const fields = ncmErrorFields(reply.body)
      const code =
        fields.map((field) => CREATE_FIELDS.get(field)).find((found) => found !== undefined) ??
        'invalid_request'
      return { outcome: 'refused', error: error(code, 400, fields, false) }
    }
    if (reply.status >= 400 && reply.status < 500 && !CREATE_MAYBE_STORED.has(reply.status)) {
      return { outcome: 'refused', error: failure(reply) }
    }
    // 5xx, 3xx, 408, 409, 425: NCM may have stored the order before failing.
    return { outcome: 'unknown', error: failure(reply) }
  }

  // `GET /api/v1/order?id=`.
  getParcel(account: CourierAccount, externalShipmentId: string) {
    const id = ncmOrderId(externalShipmentId)
    if (id === null) return Promise.resolve(notFound<CourierParcelDetail>())
    return this.#read(account, 'GET', `/api/v1/order?id=${id}`, (body) => {
      if (!isRecord(body) || text(body.orderid) !== externalShipmentId) return null
      const returnedToVendor = parseVendorReturn(body.vendor_return)
      if (returnedToVendor === undefined) return null
      return {
        externalShipmentId,
        codAmountMinor: parseMoney(body.cod_charge),
        deliveryChargeMinor: parseMoney(body.delivery_charge),
        lastStatus: boundedLabel(body.last_delivery_status),
        paymentStatus: boundedLabel(body.payment_status),
        returnedToVendor,
      }
    })
  }

  /*
   * `GET /api/v1/order/status?id=`, oldest first. The history is replayed
   * in this order (docs/05 §6.3), so it fails closed: a row for another
   * parcel, without a label, or without a readable time makes the whole
   * answer `unexpected_response`. NCM sends newest first and its times
   * carry microseconds that `Date` drops, so the rows are reversed before a
   * stable sort, which keeps same-millisecond readings in NCM's order.
   */
  getStatusHistory(account: CourierAccount, externalShipmentId: string) {
    const id = ncmOrderId(externalShipmentId)
    if (id === null) return Promise.resolve(notFound<CourierStatusReading[]>())
    return this.#read(account, 'GET', `/api/v1/order/status?id=${id}`, (body) => {
      if (!Array.isArray(body)) return null
      const readings: CourierStatusReading[] = []
      for (const row of [...body].reverse()) {
        if (!isRecord(row) || text(row.orderid) !== externalShipmentId) return null
        const status = boundedLabel(row.status)
        const occurredAt = parseTime(row.added_time)
        if (status === null || occurredAt === null) return null
        readings.push({ externalShipmentId, rawEvent: null, rawStatus: status, occurredAt })
      }
      return readings.sort((a, b) => a.occurredAt!.getTime() - b.occurredAt!.getTime())
    })
  }

  // `POST /api/v1/orders/statuses`: keys come back as strings; `errors` are unanswered.
  async getStatuses(account: CourierAccount, externalShipmentIds: string[]) {
    const unique = [...new Set(externalShipmentIds)]
    const invalid = unique.filter((id) => ncmOrderId(id) === null)
    const valid = unique.filter((id) => ncmOrderId(id) !== null)
    if (valid.length === 0) {
      if (this.#baseUrls[account.environment] === null) {
        return { ok: false, error: failure({ kind: 'not_configured' }) } as const
      }
      const value: CourierBulkStatuses = { statuses: new Map(), unanswered: invalid }
      return { ok: true, value } as CourierResult<CourierBulkStatuses>
    }
    return this.#read(
      account,
      'POST',
      '/api/v1/orders/statuses',
      (body) => {
        if (!isRecord(body) || !isRecord(body.result)) return null
        const statuses = new Map<string, string>()
        for (const id of valid) {
          const label = Object.hasOwn(body.result, id) ? boundedLabel(body.result[id]) : null
          if (label !== null) statuses.set(id, label)
        }
        const unanswered = [...invalid, ...valid.filter((id) => !statuses.has(id))]
        return { statuses, unanswered }
      },
      { orders: valid.map(Number) }
    )
  }

  /*
   * `GET /api/v2/branches`. Its response shape is not documented. NCM's
   * production and demo hosts returned one bare array of rows with `pk`,
   * `code`, `name`, `district_name` and `areas_covered` (2026-11-16 and
   * 2026-11-19, VX-16); the names one integration's code reads (`district`,
   * `covered_areas`, `areas`) stay as fallbacks. Only entries with a name
   * are read, from an array or a paginated `results`.
   */
  listBranches(account: CourierAccount) {
    return this.#read(account, 'GET', '/api/v2/branches', (body) => {
      const rows = Array.isArray(body)
        ? body
        : isRecord(body) && Array.isArray(body.results)
          ? body.results
          : null
      if (rows === null) return null
      const branches: CourierBranch[] = []
      for (const row of rows) {
        if (!isRecord(row)) continue
        const name = boundedLabel(row.name) ?? boundedLabel(row.branch_name)
        if (name === null) continue
        branches.push({
          name,
          externalBranchId: text(row.pk) ?? text(row.id),
          code: text(row.code),
          courierDistrict: text(row.district_name) ?? text(row.district),
          coveredAreas: text(row.areas_covered) ?? text(row.covered_areas) ?? text(row.areas),
          phone: text(row.phone),
        })
      }
      return branches
    })
  }

  // `GET /api/v2/vendor/assigned-branches`: the account's pickup branch names.
  listAssignedBranches(account: CourierAccount) {
    return this.#read(account, 'GET', '/api/v2/vendor/assigned-branches', (body) => {
      if (!Array.isArray(body)) return null
      const names = body.map(boundedLabel)
      return names.every((name): name is string => name !== null) ? names : null
    })
  }

  /*
   * A callback body (webhook document v1.1). NCM does not sign callbacks,
   * so nothing here is trusted: a callback only triggers a read of the
   * parcel's history (docs/05 §6.3). Comments and test events are not
   * stored; the payload keeps only the event, the label and the time. An ID
   * that is not an NCM order ID is skipped, so one bad entry does not drop
   * the trigger for the others (NCM never resends).
   */
  parseCallback(rawBody: string): CourierCallback {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { kind: 'invalid' }
    }
    if (!isRecord(body)) return { kind: 'invalid' }
    if (body.test === true) return { kind: 'test' }

    const event = boundedLabel(body.event)
    if (event === null) return { kind: 'invalid' }
    if (event === 'comment_added') return { kind: 'ignored', reason: 'comment' }

    const ids: string[] = []
    for (const candidate of [body.order_id, body.order_ids]) {
      const list = Array.isArray(candidate) ? candidate : candidate === undefined ? [] : [candidate]
      for (const value of list) {
        const id = text(value)
        if (id !== null && ncmOrderId(id) !== null && !ids.includes(id)) ids.push(id)
      }
    }
    if (ids.length === 0) return { kind: 'invalid' }

    const status = boundedLabel(body.status)
    const timestamp = text(body.timestamp)
    const payload: Record<string, string> = { event }
    if (status !== null) payload.status = status
    if (timestamp !== null) payload.timestamp = timestamp.slice(0, 256)

    return {
      kind: 'events',
      events: ids.map((externalShipmentId) => ({
        externalShipmentId,
        rawEvent: event,
        rawStatus: status ?? event,
        occurredAt: parseTime(timestamp),
        payload,
      })),
    }
  }
}

/*
 * NCM's documented callback events (webhook document v1.1). A callback's
 * event goes into its inbox key only when it is one of these, else as
 * `unknown`, so varied bodies cannot add rows (docs/04a §9.14).
 */
export const NCM_CALLBACK_EVENTS = [
  'pickup_completed',
  'dropoff_collected',
  'order_dispatched',
  'order_arrived',
  'sent_for_delivery',
  'delivery_completed',
  'order_marked_rtv',
  'send_to_vendor',
  'rtv_delivery',
  'refund_initiated',
] as const

export function ncmCallbackKeyEvent(event: string): string {
  return (NCM_CALLBACK_EVENTS as readonly string[]).includes(event) ? event : 'unknown'
}

function notFound<T>(): CourierResult<T> {
  return { ok: false, error: error('not_found', null, [], false) }
}

// NCM takes kilograms as a string and defaults to 1 kg; grams keep the request exact.
function weightKg(grams: number): string | null {
  if (!Number.isSafeInteger(grams) || grams <= 0) return null
  const kg = Math.floor(grams / 1000)
  const rest = grams % 1000
  return rest === 0 ? String(kg) : `${kg}.${String(rest).padStart(3, '0').replace(/0+$/, '')}`
}
