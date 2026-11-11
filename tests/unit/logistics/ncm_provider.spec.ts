import { test } from '@japa/runner'
import {
  NCM_CAPABILITIES,
  NcmCourierProvider,
  ncmCallbackKeyEvent,
  ncmErrorFields,
} from '#modules/logistics/providers/ncm'
import type {
  CourierAccount,
  CourierBookingRequest,
} from '#modules/logistics/providers/courier_provider'

/*
 * T-FUL-109: the Nepal Can Move adapter's contract, on recorded synthetic
 * responses shaped like NCM's API document v2 (VX-16: not yet checked
 * against NCM). No request leaves the process: `fetch` is a fake.
 */

const TOKEN = 'synthetic-token-0000000000000000000000'
const RECIPIENT = {
  name: 'Synthetic Customer',
  phone: '9800000001',
  secondaryPhone: null,
  address: 'Example Tole, Ward 1',
}
const SECRETS = [TOKEN, RECIPIENT.name, RECIPIENT.phone, RECIPIENT.address]

const account: CourierAccount = {
  id: '0193a000-0000-7000-8000-000000000001',
  environment: 'sandbox',
  credentials: async () => ({ token: TOKEN }),
}

function bookingRequest(overrides: Partial<CourierBookingRequest> = {}): CourierBookingRequest {
  return {
    merchantReference: 'DN-4K7Q2M9-1-S1',
    serviceCode: 'Door2Door',
    codAmountMinor: 150000,
    originBranchName: 'TINKUNE',
    destinationBranchName: 'POKHARA',
    recipient: RECIPIENT,
    packageDescription: '1 x Example item',
    instructions: null,
    weightGrams: 1500,
    ...overrides,
  }
}

interface Sent {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  redirect: RequestInit['redirect']
}

type Answer = { status: number; body: string } | Error | 'hang' | 'break_body'

function fakeNcm(answers: Answer[], timeoutMs?: number) {
  const sent: Sent[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      redirect: init?.redirect,
    })
    const answer = answers.shift()
    if (answer === undefined) throw new Error('no answer recorded')
    if (answer === 'hang') {
      // Like a server that never answers: only the adapter's own signal ends it.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    }
    if (answer === 'break_body') {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new TypeError('terminated'))
        },
      })
      return new Response(body, { status: 200 })
    }
    if (answer instanceof Error) throw answer
    return new Response(answer.body, { status: answer.status })
  }) as typeof globalThis.fetch
  const ncm = new NcmCourierProvider({
    baseUrls: { sandbox: 'https://demo.example.test', production: null },
    fetch,
    timeoutMs,
  })
  return { ncm, sent }
}

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) })

function timeoutError() {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

function causeError(code: string) {
  return Object.assign(new TypeError('fetch failed'), { cause: { code } })
}

// Nothing the adapter returns may carry the token or what DripNepal sent about the recipient.
function assertNoSecrets(assert: { notInclude: (a: string, b: string) => void }, value: unknown) {
  const serialised = JSON.stringify(value)
  for (const secret of SECRETS) assert.notInclude(serialised, secret)
}

test.group('T-FUL-109 NCM adapter: booking', () => {
  test('a booking succeeds and sends NCM its documented fields as strings', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([
      json(200, { Message: 'Order Successfully Created', orderid: 1001 }),
    ])
    const outcome = await ncm.book(account, bookingRequest())

    assert.deepEqual(outcome, { outcome: 'succeeded', externalShipmentId: '1001' })
    assert.lengthOf(sent, 1)
    assert.equal(sent[0].method, 'POST')
    assert.equal(sent[0].url, 'https://demo.example.test/api/v1/order/create')
    assert.equal(sent[0].headers.Authorization, `Token ${TOKEN}`)
    // A redirect could carry the token to another host (docs/07 TM-13).
    assert.equal(sent[0].redirect, 'error')
    assert.deepEqual(sent[0].body, {
      name: RECIPIENT.name,
      phone: RECIPIENT.phone,
      phone2: '',
      cod_charge: '1500.00',
      address: RECIPIENT.address,
      fbranch: 'TINKUNE',
      branch: 'POKHARA',
      vref_id: 'DN-4K7Q2M9-1-S1',
      delivery_type: 'Door2Door',
      package: '1 x Example item',
      weight: '1.5',
    })
  })

  test('field errors are a refusal with the field names only', async ({ assert }) => {
    const { ncm } = fakeNcm([
      json(400, {
        Error: { phone: `Invalid Phone Number ${RECIPIENT.phone}`, branch: 'Invalid Branch' },
      }),
    ])
    const outcome = await ncm.book(account, bookingRequest())
    assert.equal(outcome.outcome, 'refused')
    if (outcome.outcome !== 'refused') return
    assert.equal(outcome.error.code, 'invalid_phone')
    assert.equal(outcome.error.httpStatus, 400)
    assert.deepEqual(outcome.error.fields, ['phone', 'branch'])
    assert.notInclude(JSON.stringify(outcome), 'Invalid Phone Number')
    assertNoSecrets(assert, outcome)
  })

  test('a field error keyed by personal data or a prototype name stays generic', async ({
    assert,
  }) => {
    const { ncm } = fakeNcm([
      json(400, { Error: { [RECIPIENT.phone]: 'x', [RECIPIENT.name]: 'y', constructor: 'z' } }),
    ])
    const outcome = await ncm.book(account, bookingRequest())
    assert.equal(outcome.outcome, 'refused')
    if (outcome.outcome !== 'refused') return
    assert.equal(outcome.error.code, 'invalid_request')
    assert.deepEqual(outcome.error.fields, ['other'])
    assertNoSecrets(assert, outcome)
  })

  test('{name}')
    .with([
      {
        name: '400 with the detail shape is a refusal',
        answer: json(400, { detail: `bad ${RECIPIENT.address}` }),
        outcome: 'refused',
        code: 'invalid_request',
      },
      {
        name: '401 is a refusal: the credentials are wrong',
        answer: json(401, { detail: 'Invalid token.' }),
        outcome: 'refused',
        code: 'auth_failed',
      },
      {
        name: '403 is a refusal',
        answer: json(403, { detail: `Forbidden ${TOKEN}` }),
        outcome: 'refused',
        code: 'auth_failed',
      },
      {
        name: '404 is a refusal',
        answer: json(404, { detail: 'Not found.' }),
        outcome: 'refused',
        code: 'not_found',
      },
      {
        name: '429 is a refusal that may be retried later',
        answer: json(429, { detail: 'Request was throttled.' }),
        outcome: 'refused',
        code: 'rate_limited',
      },
      {
        name: '408 from a proxy is unknown',
        answer: json(408, {}),
        outcome: 'unknown',
        code: 'invalid_request',
      },
      {
        name: '409 is unknown',
        answer: json(409, {}),
        outcome: 'unknown',
        code: 'invalid_request',
      },
      {
        name: '500 is unknown: NCM may have stored it',
        answer: json(500, { detail: `Server Error ${RECIPIENT.name}` }),
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'an HTML 502 from a proxy is unknown',
        answer: { status: 502, body: `<html>${RECIPIENT.phone}</html>` },
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'a 200 without an order ID is unknown',
        answer: json(200, { Message: 'Order Successfully Created' }),
        outcome: 'unknown',
        code: 'unexpected_response',
      },
      {
        name: 'a 200 with a non-integer order ID is unknown',
        answer: json(200, { orderid: '10.5' }),
        outcome: 'unknown',
        code: 'unexpected_response',
      },
      {
        name: 'a 200 that is not JSON is unknown',
        answer: { status: 200, body: '<html>ok</html>' },
        outcome: 'unknown',
        code: 'unexpected_response',
      },
      {
        name: 'a body that breaks while read is unknown',
        answer: 'break_body',
        outcome: 'unknown',
        code: 'courier_error',
      },
      { name: 'a timeout is unknown', answer: timeoutError(), outcome: 'unknown', code: 'timeout' },
      {
        name: 'a connection that drops after sending is unknown',
        answer: causeError('UND_ERR_SOCKET'),
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'a refused connection is a refusal: nothing was sent',
        answer: causeError('ECONNREFUSED'),
        outcome: 'refused',
        code: 'connection_failed',
      },
      {
        name: 'an unreachable host is a refusal',
        answer: causeError('EHOSTUNREACH'),
        outcome: 'refused',
        code: 'connection_failed',
      },
      {
        name: 'a refused TLS certificate is a refusal',
        answer: causeError('CERT_HAS_EXPIRED'),
        outcome: 'refused',
        code: 'connection_failed',
      },
    ] as { name: string; answer: Answer; outcome: string; code: string }[])
    .run(async ({ assert }, row) => {
      const { ncm, sent } = fakeNcm([row.answer])
      const outcome = await ncm.book(account, bookingRequest())
      assert.equal(outcome.outcome, row.outcome)
      if (outcome.outcome === 'succeeded') return
      assert.equal(outcome.error.code, row.code)
      // The adapter never retries a booking by itself (05 §6.3, `reference_lookup` false).
      assert.lengthOf(sent, 1)
      assertNoSecrets(assert, outcome)
    })

  test("the adapter's own timeout ends a call that never answers", async ({ assert }) => {
    const { ncm } = fakeNcm(['hang'], 50)
    const outcome = await ncm.book(account, bookingRequest())
    assert.equal(outcome.outcome, 'unknown')
    if (outcome.outcome === 'succeeded') return
    assert.equal(outcome.error.code, 'timeout')
  })

  test('nothing is sent without both branches, or with a bad COD amount', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    const noBranch = await ncm.book(account, bookingRequest({ destinationBranchName: null }))
    assert.deepEqual(noBranch, {
      outcome: 'refused',
      error: { code: 'invalid_branch', httpStatus: null, fields: ['branch'], retryable: false },
    })
    for (const codAmountMinor of [-1, 1.5]) {
      const outcome = await ncm.book(account, bookingRequest({ codAmountMinor }))
      assert.equal(outcome.outcome, 'refused')
    }
    assert.lengthOf(sent, 0)
  })

  test('nothing is sent when the credentials cannot be read or are not a header value', async ({
    assert,
  }) => {
    const { ncm, sent } = fakeNcm([])
    const broken: CourierAccount = {
      ...account,
      credentials: async () => {
        throw new Error('decrypt failed')
      },
    }
    const badToken: CourierAccount = { ...account, credentials: async () => ({ token: 'a\nb c' }) }
    for (const which of [broken, badToken]) {
      const outcome = await ncm.book(which, bookingRequest())
      assert.equal(outcome.outcome, 'refused')
      if (outcome.outcome !== 'refused') return
      assert.equal(outcome.error.code, 'auth_failed')
    }
    assert.lengthOf(sent, 0)
  })

  test('a production account is refused while NCM has no production host', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    const outcome = await ncm.book({ ...account, environment: 'production' }, bookingRequest())
    assert.deepEqual(outcome, {
      outcome: 'refused',
      error: { code: 'not_configured', httpStatus: null, fields: [], retryable: false },
    })
    assert.lengthOf(sent, 0)
  })

  test('a base URL must be https', ({ assert }) => {
    assert.throws(
      () =>
        new NcmCourierProvider({
          baseUrls: { sandbox: 'http://demo.example.test', production: null },
        })
    )
  })

  test('{grams} g is sent as {weight}')
    .with([
      { grams: 1000, weight: '1' },
      { grams: 250, weight: '0.25' },
      { grams: 2005, weight: '2.005' },
      { grams: 0, weight: undefined },
    ])
    .run(async ({ assert }, row) => {
      const { ncm, sent } = fakeNcm([json(200, { orderid: 1 })])
      await ncm.book(account, bookingRequest({ weightGrams: row.grams }))
      assert.equal((sent[0].body as Record<string, string>).weight, row.weight)
    })
})

test.group('T-FUL-109 NCM adapter: reads', () => {
  test('a parcel detail parses decimal-string money to paisa', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([
      json(200, {
        orderid: 1001,
        cod_charge: '1710.00',
        delivery_charge: '99.00',
        last_delivery_status: 'Delivered',
        payment_status: 'Completed',
        vendor_return: false,
      }),
    ])
    const result = await ncm.getParcel(account, '1001')
    assert.deepEqual(result, {
      ok: true,
      value: {
        externalShipmentId: '1001',
        codAmountMinor: 171000,
        deliveryChargeMinor: 9900,
        lastStatus: 'Delivered',
        paymentStatus: 'Completed',
        returnedToVendor: false,
      },
    })
    assert.equal(sent[0].url, 'https://demo.example.test/api/v1/order?id=1001')
  })

  test("the status history comes back oldest first, ties in the courier's order", async ({
    assert,
  }) => {
    const { ncm } = fakeNcm([
      json(200, [
        { orderid: 1001, status: 'Delivered', added_time: '2026-01-02T13:24:30.960365+05:45' },
        {
          orderid: 1001,
          status: 'Sent for Delivery',
          added_time: '2026-01-02T13:17:25.326999+05:45',
        },
        {
          orderid: 1001,
          status: 'Pickup Complete',
          added_time: '2026-01-02T13:17:25.326100+05:45',
        },
        {
          orderid: 1001,
          status: 'Pickup Order Created',
          added_time: '2025-12-30T11:32:18.149352+05:45',
        },
      ]),
    ])
    const result = await ncm.getStatusHistory(account, '1001')
    assert.isTrue(result.ok)
    if (!result.ok) return
    assert.deepEqual(
      result.value.map((reading) => reading.rawStatus),
      ['Pickup Order Created', 'Pickup Complete', 'Sent for Delivery', 'Delivered']
    )
    assert.equal(result.value[0].occurredAt?.toISOString(), '2025-12-30T05:47:18.149Z')
  })

  test('a history with a bad time, another parcel or a bad label is refused whole', async ({
    assert,
  }) => {
    for (const bad of [
      { orderid: 1001, status: 'Delivered', added_time: 'yesterday' },
      { orderid: 1002, status: 'Delivered', added_time: '2026-01-02T13:24:30+05:45' },
      { orderid: 1001, status: '', added_time: '2026-01-02T13:24:30+05:45' },
      { orderid: 1001, status: 'x'.repeat(101), added_time: '2026-01-02T13:24:30+05:45' },
    ]) {
      const { ncm } = fakeNcm([
        json(200, [
          bad,
          { orderid: 1001, status: 'Pickup Complete', added_time: '2026-01-01T10:00:00+05:45' },
        ]),
      ])
      const result = await ncm.getStatusHistory(account, '1001')
      assert.isFalse(result.ok)
      if (result.ok) return
      assert.equal(result.error.code, 'unexpected_response')
    }
  })

  test('bulk statuses: only the asked IDs, and unanswered IDs flagged once', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([
      json(200, {
        result: { '1001': 'Arrived', '1002': 'Delivered', '9999': 'Delivered' },
        errors: [1003],
      }),
    ])
    const result = await ncm.getStatuses(account, ['1001', '1002', '1003', '1003', 'not-ncm'])
    assert.deepEqual(sent[0].body, { orders: [1001, 1002, 1003] })
    assert.isTrue(result.ok)
    if (!result.ok) return
    assert.deepEqual(
      [...result.value.statuses],
      [
        ['1001', 'Arrived'],
        ['1002', 'Delivered'],
      ]
    )
    assert.sameMembers(result.value.unanswered, ['not-ncm', '1003'])
  })

  test('bulk statuses with no NCM ID send nothing', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    const result = await ncm.getStatuses(account, ['x', ''])
    assert.deepEqual(result, { ok: true, value: { statuses: new Map(), unanswered: ['x', ''] } })
    const production = await ncm.getStatuses({ ...account, environment: 'production' }, ['x'])
    assert.isFalse(production.ok)
    assert.lengthOf(sent, 0)
  })

  test('{name}')
    .with([
      { name: '404 is not_found', answer: json(404, { detail: 'Not found.' }), code: 'not_found' },
      {
        name: '401 is auth_failed',
        answer: json(401, { detail: 'Invalid token.' }),
        code: 'auth_failed',
      },
      {
        name: 'a body of the wrong shape is unexpected',
        answer: json(200, { orderid: 9 }),
        code: 'unexpected_response',
      },
      { name: 'a timeout is a timeout', answer: timeoutError(), code: 'timeout' },
    ] as { name: string; answer: Answer; code: string }[])
    .run(async ({ assert }, row) => {
      const { ncm } = fakeNcm([row.answer])
      const result = await ncm.getParcel(account, '1001')
      assert.isFalse(result.ok)
      if (result.ok) return
      assert.equal(result.error.code, row.code)
    })

  test('an ID that is not an NCM order ID is not sent', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    for (const id of ['1001; DROP', '../1', '0', '1e3', '']) {
      const result = await ncm.getStatusHistory(account, id)
      assert.isFalse(result.ok)
    }
    assert.lengthOf(sent, 0)
  })

  test('branches as an array or a paginated list, and assigned branches', async ({ assert }) => {
    const branch = {
      pk: 12,
      name: 'TINKUNE',
      code: 'TINK1',
      district: 'Kathmandu',
      phone: '015199684',
    }
    const expected = {
      name: 'TINKUNE',
      externalBranchId: '12',
      code: 'TINK1',
      courierDistrict: 'Kathmandu',
      coveredAreas: null,
      phone: '015199684',
    }
    const { ncm } = fakeNcm([
      json(200, [branch, { name: '' }, 'not a branch']),
      json(200, { count: 1, next: null, previous: null, results: [branch] }),
      json(200, ['KATHMANDU', 'POKHARA']),
    ])
    assert.deepEqual(await ncm.listBranches(account), { ok: true, value: [expected] })
    assert.deepEqual(await ncm.listBranches(account), { ok: true, value: [expected] })
    assert.deepEqual(await ncm.listAssignedBranches(account), {
      ok: true,
      value: ['KATHMANDU', 'POKHARA'],
    })
  })
})

test.group('T-FUL-109 NCM adapter: callbacks and errors', () => {
  const ncm = new NcmCourierProvider({ baseUrls: { sandbox: null, production: null } })

  test('a bulk callback becomes one event per parcel, with a redacted payload', ({ assert }) => {
    const parsed = ncm.parseCallback(
      JSON.stringify({
        event: 'pickup_completed',
        order_ids: [1001, '1002', 'TEST-1', 1001],
        status: 'Pickup Complete',
        timestamp: '2026-01-02T13:17:25+05:45',
        vendor_name: RECIPIENT.name,
        phone: RECIPIENT.phone,
      })
    )
    assert.equal(parsed.kind, 'events')
    if (parsed.kind !== 'events') return
    assert.deepEqual(
      parsed.events.map((event) => event.externalShipmentId),
      ['1001', '1002']
    )
    assert.deepEqual(parsed.events[0].payload, {
      event: 'pickup_completed',
      status: 'Pickup Complete',
      timestamp: '2026-01-02T13:17:25+05:45',
    })
    assertNoSecrets(assert, parsed)
  })

  test('a single-parcel callback, one without a label, and an undocumented event', ({ assert }) => {
    const single = ncm.parseCallback(
      JSON.stringify({ event: 'delivery_completed', order_id: 1001 })
    )
    assert.equal(single.kind, 'events')
    if (single.kind !== 'events') return
    assert.equal(single.events[0].externalShipmentId, '1001')
    // No label: the event stands in for it (04a §9.14 `raw_status`).
    assert.equal(single.events[0].rawStatus, 'delivery_completed')
    assert.isNull(single.events[0].occurredAt)

    const undocumented = ncm.parseCallback(
      JSON.stringify({ event: 'returned_to_warehouse', order_id: '1001', status: 'x' })
    )
    assert.equal(undocumented.kind, 'events')
  })

  test('test events, comments and malformed bodies', ({ assert }) => {
    const testEvent = {
      event: 'order.status.changed',
      order_id: 'TEST-123456',
      status: 'In Transit',
      timestamp: '2024-01-01T12:00:00+05:45',
      test: true,
    }
    assert.deepEqual(ncm.parseCallback(JSON.stringify(testEvent)), { kind: 'test' })
    assert.deepEqual(
      ncm.parseCallback(JSON.stringify({ event: 'comment_added', order_id: '1001', comment: 'x' })),
      { kind: 'ignored', reason: 'comment' }
    )
    for (const body of [
      'not json',
      '[]',
      '{}',
      '{"event":"pickup_completed"}',
      '{"event":"pickup_completed","order_id":"TEST-1"}',
      JSON.stringify({ event: 'x'.repeat(101), order_id: 1001 }),
    ]) {
      assert.deepEqual(ncm.parseCallback(body), { kind: 'invalid' })
    }
  })

  test('only known create fields survive from the four error shapes', ({ assert }) => {
    assert.deepEqual(ncmErrorFields({ detail: 'Not found.' }), [])
    assert.deepEqual(ncmErrorFields({ message: 'Order not found' }), [])
    assert.deepEqual(ncmErrorFields({ success: false, message: 'Please enter a valid URL' }), [])
    assert.deepEqual(ncmErrorFields({ Error: { cod_charge: 'Invalid COD Amount' } }), [
      'cod_charge',
    ])
    assert.deepEqual(ncmErrorFields('<html>'), [])
    assert.deepEqual(ncmErrorFields({ Error: { [RECIPIENT.phone]: 'x', toString: 'y' } }), [
      'other',
    ])
  })

  test('callback events go into keys only when NCM documents them', ({ assert }) => {
    assert.equal(ncmCallbackKeyEvent('pickup_completed'), 'pickup_completed')
    assert.equal(ncmCallbackKeyEvent('pickup_completed_x'), 'unknown')
    assert.equal(ncmCallbackKeyEvent('constructor'), 'unknown')
  })

  test('NCM declares no cancellation, no reference lookup and no signed callback', ({ assert }) => {
    assert.isFalse(NCM_CAPABILITIES.cancellation)
    assert.isFalse(NCM_CAPABILITIES.reference_lookup)
    assert.isFalse(NCM_CAPABILITIES.signed_callback)
    assert.isTrue(NCM_CAPABILITIES.branches)
  })
})
