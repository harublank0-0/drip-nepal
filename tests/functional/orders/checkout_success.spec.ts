import { test } from '@japa/runner'
import {
  clientNetwork,
  guestCheckoutLimiter,
  limiterKey,
  loginNetworkLimiter,
} from '#modules/auth/rate_limits'
import { testBrowser } from '#tests/support/browser'
import { addressPayload, createCustomer, createShop, createVariant } from '#tests/support/fixtures'

/*
 * The order-placed page links each order to where its buyer can open it:
 * the account's order page for an account's orders, the tracking page for
 * a guest's. A guest's orders stay guest orders when the guest logs in
 * afterwards, so the link follows the orders, not who is looking.
 */

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
  const browser = testBrowser()
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
