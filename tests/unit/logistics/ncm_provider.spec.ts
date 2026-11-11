import { test } from '@japa/runner'
import {
  NCM_CAPABILITIES,
  NcmCourierProvider,
  ncmErrorDetail,
} from '#modules/logistics/providers/ncm'
import type {
  CourierAccount,
  CourierBookingRequest,
} from '#modules/logistics/providers/courier_provider'
import { minorToRupeesFixed } from '#shared/format/money'

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
}

type Answer = { status: number; body: string } | Error

function fakeNcm(answers: Answer[]) {
  const sent: Sent[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const answer = answers.shift()
    if (answer === undefined) throw new Error('no answer recorded')
    if (answer instanceof Error) throw answer
    return new Response(answer.body, { status: answer.status })
  }) as typeof globalThis.fetch
  const ncm = new NcmCourierProvider({
    baseUrls: { sandbox: 'https://demo.example.test', production: null },
    fetch,
  })
  return { ncm, sent }
}

const json = (status: number, body: unknown) => ({ status, body: JSON.stringify(body) })

function timeoutError() {
  return new DOMException('The operation was aborted due to timeout', 'TimeoutError')
}

function connectionRefused() {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
}

// Nothing the adapter returns may carry the token or what DripNepal sent about the recipient.
function assertNoSecrets(assert: { notInclude: (a: string, b: string) => void }, value: unknown) {
  const serialised = JSON.stringify(value)
  for (const secret of [TOKEN, RECIPIENT.name, RECIPIENT.phone, RECIPIENT.address]) {
    assert.notInclude(serialised, secret)
  }
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

  test('field errors are a refusal with the field named', async ({ assert }) => {
    const { ncm } = fakeNcm([
      json(400, { Error: { phone: 'Invalid Phone Number', branch: 'Invalid Branch' } }),
    ])
    const outcome = await ncm.book(account, bookingRequest())
    assert.equal(outcome.outcome, 'refused')
    if (outcome.outcome !== 'refused') return
    assert.equal(outcome.error.code, 'invalid_phone')
    assert.equal(outcome.error.httpStatus, 400)
    assert.equal(outcome.error.detail, 'phone: Invalid Phone Number; branch: Invalid Branch')
    assert.isFalse(outcome.error.retryable)
    assertNoSecrets(assert, outcome)
  })

  test('{name}')
    .with([
      {
        name: '401 is a refusal: the credentials are wrong',
        answer: json(401, { detail: 'Invalid token.' }),
        outcome: 'refused',
        code: 'auth_failed',
      },
      {
        name: '429 is a refusal that may be retried later',
        answer: json(429, { detail: 'Request was throttled.' }),
        outcome: 'refused',
        code: 'rate_limited',
      },
      {
        name: '500 is unknown: NCM may have stored it',
        answer: json(500, { detail: 'Server Error' }),
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'an HTML 502 from a proxy is unknown',
        answer: { status: 502, body: '<html><body>Bad Gateway</body></html>' },
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'a 200 without an order ID is unknown',
        answer: json(200, { Message: 'Order Successfully Created' }),
        outcome: 'unknown',
        code: 'unexpected_response',
      },
      { name: 'a timeout is unknown', answer: timeoutError(), outcome: 'unknown', code: 'timeout' },
      {
        name: 'a connection that drops after sending is unknown',
        answer: new TypeError('fetch failed'),
        outcome: 'unknown',
        code: 'courier_error',
      },
      {
        name: 'a refused connection is a refusal: nothing was sent',
        answer: connectionRefused(),
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

  test('a booking without both branches is refused before any call', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    const outcome = await ncm.book(account, bookingRequest({ destinationBranchName: null }))
    assert.equal(outcome.outcome, 'refused')
    assert.lengthOf(sent, 0)
  })

  test('a production account is refused while NCM has no production host', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([])
    const outcome = await ncm.book({ ...account, environment: 'production' }, bookingRequest())
    assert.deepEqual(outcome, {
      outcome: 'refused',
      error: { code: 'not_configured', httpStatus: null, detail: null, retryable: false },
    })
    assert.lengthOf(sent, 0)
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
        returnedToVendor: null,
      },
    })
    assert.equal(sent[0].url, 'https://demo.example.test/api/v1/order?id=1001')
  })

  test('the status history comes back oldest first, sorted by time', async ({ assert }) => {
    const { ncm } = fakeNcm([
      json(200, [
        { orderid: 1001, status: 'Delivered', added_time: '2026-01-02T13:24:30.960365+05:45' },
        {
          orderid: 1001,
          status: 'Pickup Complete',
          added_time: '2026-01-02T13:17:25.326792+05:45',
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
      ['Pickup Order Created', 'Pickup Complete', 'Delivered']
    )
    assert.equal(result.value[0].occurredAt?.toISOString(), '2025-12-30T05:47:18.149Z')
  })

  test('bulk statuses: string keys, and unanswered IDs flagged', async ({ assert }) => {
    const { ncm, sent } = fakeNcm([
      json(200, { result: { '1001': 'Arrived', '1002': 'Delivered' }, errors: [1003] }),
    ])
    const result = await ncm.getStatuses(account, ['1001', '1002', '1003', 'not-ncm'])
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
    const result = await ncm.getStatusHistory(account, '1001; DROP')
    assert.isFalse(result.ok)
    assert.lengthOf(sent, 0)
  })

  test('branches and assigned branches', async ({ assert }) => {
    const { ncm } = fakeNcm([
      json(200, [
        { pk: 12, name: 'TINKUNE', code: 'TINK1', district: 'Kathmandu', phone: '015199684' },
        { name: '' },
        'not a branch',
      ]),
      json(200, ['KATHMANDU', 'POKHARA']),
    ])
    const branches = await ncm.listBranches(account)
    assert.deepEqual(branches, {
      ok: true,
      value: [
        {
          name: 'TINKUNE',
          externalBranchId: '12',
          code: 'TINK1',
          courierDistrict: 'Kathmandu',
          coveredAreas: null,
          phone: '015199684',
        },
      ],
    })
    assert.deepEqual(await ncm.listAssignedBranches(account), {
      ok: true,
      value: ['KATHMANDU', 'POKHARA'],
    })
  })
})

test.group('T-FUL-109 NCM adapter: callbacks, errors and money', () => {
  test('a bulk callback becomes one event per parcel, with a redacted payload', ({ assert }) => {
    const ncm = new NcmCourierProvider({ baseUrls: { sandbox: null, production: null } })
    const parsed = ncm.parseCallback(
      JSON.stringify({
        event: 'pickup_completed',
        order_ids: [1001, '1002'],
        status: 'Pickup Complete',
        timestamp: '2026-01-02T13:17:25+05:45',
        vendor_name: 'Example Vendor',
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
  })

  test('test events, comments and malformed bodies', ({ assert }) => {
    const ncm = new NcmCourierProvider({ baseUrls: { sandbox: null, production: null } })
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
    ]) {
      assert.deepEqual(ncm.parseCallback(body), { kind: 'invalid' })
    }
  })

  test('the four error shapes reduce to NCM wording', ({ assert }) => {
    assert.deepEqual(ncmErrorDetail({ detail: 'Not found.' }), { detail: 'Not found.', fields: [] })
    assert.deepEqual(ncmErrorDetail({ message: 'Order not found' }), {
      detail: 'Order not found',
      fields: [],
    })
    assert.deepEqual(ncmErrorDetail({ success: false, message: 'Please enter a valid URL' }), {
      detail: 'Please enter a valid URL',
      fields: [],
    })
    assert.deepEqual(ncmErrorDetail({ Error: { cod_charge: 'Invalid COD Amount' } }), {
      detail: 'cod_charge: Invalid COD Amount',
      fields: ['cod_charge'],
    })
    assert.deepEqual(ncmErrorDetail('<html>'), { detail: null, fields: [] })
    assert.lengthOf(ncmErrorDetail({ detail: 'x'.repeat(2000) }).detail ?? '', 500)
  })

  test('paisa format as rupees with two decimals, exactly', ({ assert }) => {
    for (const [minor, rupees] of [
      [150000, '1500.00'],
      [129950, '1299.50'],
      [5, '0.05'],
      [0, '0.00'],
      [9007199254740991, '90071992547409.91'],
    ] as const) {
      assert.equal(minorToRupeesFixed(minor), rupees)
    }
    assert.throws(() => minorToRupeesFixed(1.5), RangeError)
  })

  test('NCM declares no cancellation, no reference lookup and no signed callback', ({ assert }) => {
    assert.isFalse(NCM_CAPABILITIES.cancellation)
    assert.isFalse(NCM_CAPABILITIES.reference_lookup)
    assert.isFalse(NCM_CAPABILITIES.signed_callback)
    assert.isTrue(NCM_CAPABILITIES.branches)
  })
})
