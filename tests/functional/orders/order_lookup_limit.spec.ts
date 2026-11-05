import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import env from '#start/env'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import type OrderAlerts from '#modules/orders/services/order_alerts'
import {
  clientNetwork,
  limiterKey,
  orderLookupLimiter,
  penalizeFailures,
} from '#modules/auth/rate_limits'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Guest order tracking allows 10 failed lookups per 15 minutes per
 * network (app/modules/auth/rate_limits.ts). The limiter's own `penalize`
 * wipes the count after any successful call, so someone holding one real
 * order (their own) could look it up after every 9 guesses and guess
 * forever. `penalizeFailures` counts failures the same way without that
 * reset.
 */

const notFound = async (): Promise<string> => {
  throw new Error('no such order')
}
const found = async () => 'DN261104-ABCDE'

test.group('Order lookup limit [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a successful lookup does not wipe the failed ones before it', async ({ assert }) => {
    const limiter = orderLookupLimiter()
    const key = `test:track:${randomUUID()}`
    const guess = () => penalizeFailures(limiter, key, notFound).catch(() => null)

    for (let attempt = 0; attempt < 9; attempt++) await guess()
    const [notThrottled, order] = await penalizeFailures(limiter, key, found)
    assert.isNull(notThrottled)
    assert.equal(order, 'DN261104-ABCDE')

    await guess()
    const [throttled] = await penalizeFailures(limiter, key, found)
    assert.isNotNull(throttled, 'the tenth failed guess blocks the network')
  })

  test('lookups that find their order are never limited', async ({ assert }) => {
    const limiter = orderLookupLimiter()
    const key = `test:track:${randomUUID()}`

    for (let attempt = 0; attempt < 15; attempt++) {
      const [throttled] = await penalizeFailures(limiter, key, found)
      assert.isNull(throttled, `lookup ${attempt + 1}`)
    }
  })
})

/*
 * The tracking endpoint itself, over HTTP to the test server, with the
 * session and XSRF cookies a browser would send.
 */
class Browser {
  #cookies = new Map<string, string>()
  constructor(private base: string) {}

  #remember(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.slice(0, cookie.indexOf(';'))
      const at = pair.indexOf('=')
      this.#cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }

  async get(path: string) {
    const response = await fetch(`${this.base}${path}`, { redirect: 'manual' })
    this.#remember(response)
    return response
  }

  async postJson(path: string, body: unknown) {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-XSRF-TOKEN': decodeURIComponent(this.#cookies.get('XSRF-TOKEN') ?? ''),
        'Cookie': [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: JSON.stringify(body),
    })
    this.#remember(response)
    return response
  }
}

// The test server sees requests from this machine on IPv4 or IPv6.
const localKeys = ['127.0.0.1', '::1'].map((ip) => limiterKey('track:ip', clientNetwork(ip)))
async function clearLocalLimits() {
  await Promise.all(localKeys.map((key) => orderLookupLimiter().delete(key)))
}

test.group('Order lookup limit, over HTTP [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))
  group.each.setup(async () => {
    await clearLocalLimits()
    return clearLocalLimits
  })

  test('looking up your own order between guesses does not reset the limit', async ({ assert }) => {
    const shop = await createShop()
    const buyer = guestOwner()
    await fillCart(buyer, [{ variant: await createVariant(shop), quantity: 1 }])
    const noAlerts = { sendInBackground() {} } as unknown as OrderAlerts
    const { orderNumbers } = await new CheckoutService(new CartService(), noAlerts).placeOrders(
      buyer,
      { address: addressPayload({ recipientPhone: '9812345678' }) }
    )
    const own = { orderNumber: orderNumbers[0], phone: '9812345678' }
    const guess = (index: number) => ({ orderNumber: `DN000000-GUES${index}`, phone: '9812345678' })

    const browser = new Browser(`http://${env.get('HOST')}:${env.get('PORT')}`)
    await browser.get('/track-order')
    for (let index = 0; index < 9; index++) {
      const response = await browser.postJson('/api/v1/track-order', guess(index))
      assert.equal(response.status, 422, `guess ${index + 1} is refused as not found`)
    }
    const ownLookup = await browser.postJson('/api/v1/track-order', own)
    assert.equal(ownLookup.status, 302, 'the own order is found after 9 guesses')

    await browser.postJson('/api/v1/track-order', guess(9))
    const blocked = await browser.postJson('/api/v1/track-order', own)
    const body = (await blocked.json()) as { errors: { message: string }[] }
    assert.equal(blocked.status, 422)
    assert.match(body.errors[0].message, /Too many attempts/)
  })
})
