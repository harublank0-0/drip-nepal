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
 * nothing here has been checked against NCM's API yet. T-FUL-109 tests it
 * on synthetic responses.
 *
 * Rules it keeps:
 * - Only this file talks to NCM (docs/09 §2, T-SEC-016) and only outside a
 *   transaction; every call has a total timeout [Assumption A-51].
 * - A create that may have reached NCM and gave no clear answer is
 *   `unknown`, never retried here: NCM has no lookup by our reference
 *   (docs/05 §6.3, `reference_lookup`).
 * - Nothing it returns carries the token or a value DripNepal sent.
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

// 3 s connect and 10 s total in docs/03 §11.4; `fetch` takes only the total.
const DEFAULT_TIMEOUT_MS = 10_000

// The create endpoint's field errors (`{"Error": {"<field>": "<message>"}}`) by field.
const FIELD_ERRORS: Record<string, CourierErrorCode> = {
  cod_charge: 'invalid_cod_amount',
  phone: 'invalid_phone',
  phone2: 'invalid_phone',
  branch: 'invalid_branch',
  fbranch: 'invalid_branch',
  name: 'invalid_name',
  address: 'invalid_address',
}

// Errors that mean the request never reached NCM.
const NOT_SENT_CAUSES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'])

type Reply =
  | { kind: 'response'; status: number; body: unknown; isJson: boolean }
  | { kind: 'timeout' }
  | { kind: 'not_sent' }
  | { kind: 'lost' }

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
 * says something we keep: the names of the fields, at most ten, each a
 * plain identifier. The messages are dropped, because a courier message
 * may repeat a phone number or address (docs/04a §9.13).
 */
export function ncmErrorFields(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.Error)) return []
  return Object.keys(body.Error)
    .filter((field) => /^[A-Za-z0-9_]{1,40}$/.test(field))
    .slice(0, 10)
}

function failure(reply: Reply): CourierError {
  switch (reply.kind) {
    case 'timeout':
      return error('timeout', null, [], false)
    case 'not_sent':
      return error('connection_failed', null, [], true)
    case 'lost':
      return error('courier_error', null, [], false)
    case 'response': {
      const fields = reply.isJson ? ncmErrorFields(reply.body) : []
      if (reply.status === 401 || reply.status === 403) {
        return error('auth_failed', reply.status, [], false)
      }
      if (reply.status === 404) return error('not_found', reply.status, [], false)
      if (reply.status === 429) return error('rate_limited', reply.status, [], true)
      if (reply.status >= 400 && reply.status < 500) {
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

// NCM order IDs are integers; anything else cannot be one of ours.
function ncmOrderId(externalShipmentId: string): number | null {
  return /^[1-9]\d{0,14}$/.test(externalShipmentId) ? Number(externalShipmentId) : null
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

export class NcmCourierProvider implements CourierProvider {
  readonly code = 'ncm'
  readonly capabilities = NCM_CAPABILITIES

  readonly #baseUrls: NcmOptions['baseUrls']
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch

  constructor(options: NcmOptions) {
    this.#baseUrls = options.baseUrls
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async #call(
    account: CourierAccount,
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; authenticated?: boolean } = {}
  ): Promise<Reply | { kind: 'not_configured' }> {
    const base = this.#baseUrls[account.environment]
    if (!base) return { kind: 'not_configured' }

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.authenticated !== false) {
      const { token } = await account.credentials()
      headers.Authorization = `Token ${token}`
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let response: Response
    try {
      response = await this.#fetch(new URL(path, base), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
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
    options: { body?: unknown; authenticated?: boolean } = {}
  ): Promise<CourierResult<T>> {
    const reply = await this.#call(account, method, path, options)
    if (reply.kind === 'not_configured') {
      return { ok: false, error: error('not_configured', null, [], false) }
    }
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
    if (request.originBranchName === null || request.destinationBranchName === null) {
      // NCM books between branches (`branches`); the action checks this before claiming.
      return {
        outcome: 'refused',
        error: error('invalid_branch', null, ['fbranch', 'branch'], false),
      }
    }
    const body: Record<string, string> = {
      name: request.recipient.name,
      phone: request.recipient.phone,
      phone2: request.recipient.secondaryPhone ?? '',
      cod_charge: minorToRupeesFixed(request.codAmountMinor),
      address: request.recipient.address,
      fbranch: request.originBranchName,
      branch: request.destinationBranchName,
      vref_id: request.merchantReference,
      delivery_type: request.serviceCode,
    }
    if (request.packageDescription) body.package = request.packageDescription
    if (request.instructions) body.instruction = request.instructions
    if (request.weightGrams !== null) body.weight = weightKg(request.weightGrams)

    const reply = await this.#call(account, 'POST', '/api/v1/order/create', { body })
    if (reply.kind === 'not_configured') {
      return { outcome: 'refused', error: error('not_configured', null, [], false) }
    }
    if (reply.kind !== 'response') {
      const failed = failure(reply)
      // A timeout or a lost connection may have created the parcel.
      return failed.retryable
        ? { outcome: 'refused', error: failed }
        : { outcome: 'unknown', error: failed }
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
      const code = fields.map((field) => FIELD_ERRORS[field]).find(Boolean) ?? 'invalid_request'
      return { outcome: 'refused', error: error(code, 400, fields, false) }
    }
    if (reply.status >= 400 && reply.status < 500) {
      return { outcome: 'refused', error: failure(reply) }
    }
    // 5xx: NCM may have stored the order before failing.
    return { outcome: 'unknown', error: failure(reply) }
  }

  // `GET /api/v1/order?id=`.
  getParcel(account: CourierAccount, externalShipmentId: string) {
    const id = ncmOrderId(externalShipmentId)
    if (id === null) return Promise.resolve(notFound<CourierParcelDetail>())
    return this.#read(account, 'GET', `/api/v1/order?id=${id}`, (body) => {
      if (!isRecord(body) || text(body.orderid) !== externalShipmentId) return null
      return {
        externalShipmentId,
        codAmountMinor: parseMoney(body.cod_charge),
        deliveryChargeMinor: parseMoney(body.delivery_charge),
        lastStatus: text(body.last_delivery_status),
        paymentStatus: text(body.payment_status),
        returnedToVendor: typeof body.vendor_return === 'boolean' ? body.vendor_return : null,
      }
    })
  }

  // `GET /api/v1/order/status?id=`: oldest first, sorted by time rather than trusting NCM's order.
  getStatusHistory(account: CourierAccount, externalShipmentId: string) {
    const id = ncmOrderId(externalShipmentId)
    if (id === null) return Promise.resolve(notFound<CourierStatusReading[]>())
    return this.#read(account, 'GET', `/api/v1/order/status?id=${id}`, (body) => {
      if (!Array.isArray(body)) return null
      const readings: CourierStatusReading[] = []
      for (const row of body) {
        const status = isRecord(row) ? text(row.status) : null
        if (!isRecord(row) || status === null || status === '') return null
        readings.push({
          externalShipmentId,
          rawEvent: null,
          rawStatus: status,
          occurredAt: parseTime(row.added_time),
        })
      }
      return readings.sort(
        (a, b) => (a.occurredAt?.getTime() ?? 0) - (b.occurredAt?.getTime() ?? 0)
      )
    })
  }

  // `POST /api/v1/orders/statuses`: keys come back as strings; `errors` are unanswered.
  async getStatuses(account: CourierAccount, externalShipmentIds: string[]) {
    const ids = externalShipmentIds.map(ncmOrderId)
    const invalid = externalShipmentIds.filter((_, index) => ids[index] === null)
    const valid = ids.filter((id): id is number => id !== null)
    if (valid.length === 0) {
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
        for (const [id, status] of Object.entries(body.result)) {
          const label = text(status)
          if (label !== null && label !== '') statuses.set(id, label)
        }
        const unanswered = [...invalid]
        for (const id of valid.map(String)) if (!statuses.has(id)) unanswered.push(id)
        return { statuses, unanswered }
      },
      { body: { orders: valid } }
    )
  }

  /*
   * `GET /api/v2/branches`. Its response shape is not documented (VX-16),
   * so this reads only entries with a name, from an array or a paginated
   * `results`, and the fields one production integration saw.
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
        const name = text(row.name) ?? text(row.branch_name)
        if (name === null || name.trim() === '') continue
        branches.push({
          name: name.trim(),
          externalBranchId: text(row.pk) ?? text(row.id),
          code: text(row.code),
          courierDistrict: text(row.district),
          coveredAreas: text(row.covered_areas) ?? text(row.areas),
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
      const names = body.map(text)
      return names.every((name): name is string => name !== null) ? names : null
    })
  }

  /*
   * A callback body (webhook document v1.1). NCM does not sign callbacks,
   * so nothing here is trusted: a callback only triggers a read of the
   * parcel's history (docs/05 §6.3). Comments and test events are not
   * stored; the payload keeps only the event, the label and the time.
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

    const event = text(body.event)
    if (event === null || event === '') return { kind: 'invalid' }
    if (event === 'comment_added') return { kind: 'ignored', reason: 'comment' }

    const ids: string[] = []
    for (const candidate of [body.order_id, body.order_ids]) {
      const list = Array.isArray(candidate) ? candidate : candidate === undefined ? [] : [candidate]
      for (const value of list) {
        const id = text(value)
        if (id === null || ncmOrderId(id) === null) return { kind: 'invalid' }
        if (!ids.includes(id)) ids.push(id)
      }
    }
    if (ids.length === 0) return { kind: 'invalid' }

    const status = text(body.status) ?? ''
    const timestamp = text(body.timestamp)
    const payload: Record<string, string> = { event: event.slice(0, 256) }
    if (status !== '') payload.status = status.slice(0, 256)
    if (timestamp !== null) payload.timestamp = timestamp.slice(0, 256)

    return {
      kind: 'events',
      events: ids.map((externalShipmentId) => ({
        externalShipmentId,
        rawEvent: event,
        rawStatus: status === '' ? event : status,
        occurredAt: parseTime(timestamp),
        payload,
      })),
    }
  }
}

function notFound<T>(): CourierResult<T> {
  return { ok: false, error: error('not_found', null, [], false) }
}

// NCM takes kilograms as a string (default 1); grams keep the request exact.
function weightKg(grams: number) {
  if (!Number.isSafeInteger(grams) || grams <= 0) return '1'
  const kg = Math.floor(grams / 1000)
  const rest = grams % 1000
  return rest === 0 ? String(kg) : `${kg}.${String(rest).padStart(3, '0').replace(/0+$/, '')}`
}
