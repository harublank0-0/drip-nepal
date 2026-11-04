import { test } from '@japa/runner'
import env from '#start/env'
import {
  clientNetwork,
  guestCheckoutLimiter,
  limiterKey,
  loginNetworkLimiter,
} from '#modules/auth/rate_limits'
import { addressPayload, createCustomer, createShop, createVariant } from '#tests/support/fixtures'

/*
 * The order-placed page links each order to where its buyer can open it:
 * the account's order page for an account's orders, the tracking page for
 * a guest's. A guest's orders stay guest orders when the guest logs in
 * afterwards, so the link follows the orders, not who is looking.
 */

// A browser over HTTP to the test server: keeps cookies, sends the XSRF
// token, and asks for pages the way Inertia does, as JSON.
class Browser {
  #cookies = new Map<string, string>()
  #inertiaVersion = ''
  constructor(private base: string) {}

  #headers() {
    return {
      'Cookie': [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      'X-XSRF-TOKEN': decodeURIComponent(this.#cookies.get('XSRF-TOKEN') ?? ''),
    }
  }

  #remember(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.slice(0, cookie.indexOf(';'))
      const at = pair.indexOf('=')
      this.#cookies.set(pair.slice(0, at), pair.slice(at + 1))
    }
  }

  // Opens a page as a first visit does, and keeps the page's Inertia version
  // (it differs by build), which later JSON requests must send.
  async open(path: string) {
    const response = await fetch(`${this.base}${path}`, {
      redirect: 'manual',
      headers: this.#headers(),
    })
    this.#remember(response)
    const html = await response.text()
    const version = html.match(/(?:"|&quot;)version(?:"|&quot;):(?:"|&quot;)([^"&]*)/)
    if (!version) throw new Error(`${path} answered ${response.status} with no Inertia page`)
    this.#inertiaVersion = version[1]
  }

  async post(path: string, body: unknown) {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...this.#headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    this.#remember(response)
    return response
  }

  async props(path: string) {
    const response = await fetch(`${this.base}${path}`, {
      redirect: 'manual',
      headers: {
        ...this.#headers(),
        'X-Inertia': 'true',
        'X-Inertia-Version': this.#inertiaVersion,
      },
    })
    this.#remember(response)
    if (response.status !== 200) throw new Error(`${path} answered ${response.status}`)
    const page = (await response.json()) as { component: string; props: Record<string, unknown> }
    return page.props
  }
}

const localKeys = ['127.0.0.1', '::1'].map((ip) => clientNetwork(ip))
async function clearLocalLimits() {
  await Promise.all(
    localKeys.flatMap((key) => [
      guestCheckoutLimiter().delete(limiterKey('checkout:ip', key)),
      loginNetworkLimiter().delete(limiterKey('login:ip', key)),
    ])
  )
}

/*
 * Checks out the given variant from a fresh browser, as a guest or after
 * logging in, and returns the browser and the order-placed page's path.
 */
async function checkOut(variantId: string, account?: { email: string; password: string }) {
  const browser = new Browser(`http://${env.get('HOST')}:${env.get('PORT')}`)
  await browser.open('/')
  if (account) {
    const login = await browser.post('/api/v1/login', account)
    if (login.status !== 302) throw new Error(`login answered ${login.status}`)
  }
  const added = await browser.post('/api/v1/cart/items', { variantId, quantity: 1 })
  if (added.status !== 302) throw new Error(`add to cart answered ${added.status}`)
  const placed = await browser.post('/api/v1/checkout', { address: addressPayload() })
  const success = placed.headers.get('location') ?? ''
  if (placed.status !== 302 || !success.includes('/checkout/success/')) {
    throw new Error(`checkout answered ${placed.status} to ${success}`)
  }
  return { browser, success: new URL(success, 'http://localhost').pathname }
}

test.group('Order-placed page: where the order links go [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))
  group.each.setup(async () => {
    await clearLocalLimits()
    return clearLocalLimits
  })

  test("an account's orders link to the account", async ({ assert }) => {
    const variant = await createVariant(await createShop())
    const password = 'a-long-test-password'
    const customer = await createCustomer({ password })

    const { browser, success } = await checkOut(variant.id, { email: customer.email, password })

    const { guest } = await browser.props(success)
    assert.isFalse(guest)
  })

  test("a guest's orders link to tracking, also after the guest logs in", async ({ assert }) => {
    const variant = await createVariant(await createShop())
    const password = 'a-long-test-password'
    const customer = await createCustomer({ password })

    const { browser, success } = await checkOut(variant.id)
    const before = await browser.props(success)
    assert.isTrue(before.guest)

    const login = await browser.post('/api/v1/login', { email: customer.email, password })
    assert.equal(login.status, 302)
    // Still the guest's orders: the account can't open them.
    const after = await browser.props(success)
    assert.isTrue(after.guest)
  })
})
