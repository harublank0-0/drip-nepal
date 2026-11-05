import { test } from '@japa/runner'
import mail from '@adonisjs/mail/services/main'
import type { BaseMail } from '@adonisjs/mail'
import Order from '#models/order'
import User from '#models/user'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderAlerts from '#modules/orders/services/order_alerts'
import type NewOrderAlert from '#modules/orders/mails/new_order_alert'
import {
  addressPayload,
  createCustomer,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * New-order alerts of the v1 store (FR-NOT-002, the shop part): after
 * checkout commits, each shop is emailed about its order. The email names
 * the order, not the customer, and never holds up or fails a checkout.
 */

async function twoShopCheckout() {
  const shopA = await createShop()
  const shopB = await createShop()
  const shirt = await createVariant(shopA, { priceMinor: 250_000, quantity: 5 })
  const scarf = await createVariant(shopB, { priceMinor: 45_000, quantity: 5 })
  const buyer = guestOwner()
  await fillCart(buyer, [
    { variant: shirt, quantity: 1 },
    { variant: scarf, quantity: 2 },
  ])
  return { shopA, shopB, buyer }
}

function recordingAlerts(onCall?: (orderNumbers: string[]) => Promise<void> | void) {
  const calls: string[][] = []
  const pending: Promise<void>[] = []
  return {
    calls,
    pending,
    alerts: {
      sendInBackground(orderNumbers: string[]) {
        calls.push(orderNumbers)
        if (onCall) pending.push(Promise.resolve(onCall(orderNumbers)))
      },
    } as unknown as OrderAlerts,
  }
}

/*
 * A mailer that holds each send until `together` sends are in flight at
 * once (or 500 ms pass), and counts the most it saw at the same time.
 * Sending one after another never gets past one; sending in parallel
 * reaches `together`, whatever order the orders come in.
 */
function overlapCountingMailer(together: number) {
  let inFlight = 0
  let most = 0
  let sent = 0
  let release!: () => void
  const allIn = new Promise<void>((resolve) => (release = resolve))
  return {
    async send() {
      inFlight++
      most = Math.max(most, inFlight)
      if (inFlight >= together) release()
      await Promise.race([allIn, new Promise((resolve) => setTimeout(resolve, 500))])
      inFlight--
      sent++
    },
    mostAtOnce: () => most,
    sent: () => sent,
  }
}

test.group('Order alerts: checkout triggers them [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('one call with every order of the checkout, after the orders are saved', async ({
    assert,
  }) => {
    const { buyer } = await twoShopCheckout()
    const seenInDatabase: number[] = []
    const { calls, pending, alerts } = recordingAlerts(async (orderNumbers) => {
      const saved = await Order.query().whereIn('order_number', orderNumbers)
      seenInDatabase.push(saved.length)
    })

    const { orderNumbers } = await new CheckoutService(new CartService(), alerts).placeOrders(
      buyer,
      { address: addressPayload() }
    )
    await Promise.all(pending)

    assert.deepEqual(calls, [orderNumbers])
    assert.deepEqual(seenInDatabase, [2])
  })

  test('a refused checkout alerts nobody', async ({ assert }) => {
    const { calls, alerts } = recordingAlerts()
    const customer = await createCustomer()

    await new CheckoutService(new CartService(), alerts)
      .placeOrders({ user: customer }, { address: addressPayload() })
      .catch(() => null)

    assert.deepEqual(calls, [])
  })

  test('an alert that throws does not fail the checkout', async ({ assert }) => {
    const { buyer } = await twoShopCheckout()
    const alerts = {
      sendInBackground() {
        throw new Error('mail is down')
      },
    } as unknown as OrderAlerts

    const { orderNumbers } = await new CheckoutService(new CartService(), alerts).placeOrders(
      buyer,
      { address: addressPayload() }
    )

    assert.lengthOf(await Order.query().whereIn('order_number', orderNumbers), 2)
  })
})

test.group('Order alerts: the email [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))
  let sent: () => BaseMail[]
  group.each.setup(() => {
    const { mails } = mail.fake()
    sent = () => mails.sent()
    return () => mail.restore()
  })

  test('one email per shop order, each to its own shop', async ({ assert }) => {
    const { shopA, shopB, buyer } = await twoShopCheckout()
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })

    await new OrderAlerts({ enabled: true }).sendNewOrderAlerts(orderNumbers)

    const emails = sent()
    assert.lengthOf(emails, 2)
    for (const shop of [shopA, shopB]) {
      const owner = await User.findOrFail(shop.ownerId)
      assert.isTrue(
        emails.some((email) => email.message.hasTo(owner.email)),
        `${shop.name}'s owner got no email`
      )
    }
  })

  test("it goes to the owner and the shop's contact address, once each", async ({ assert }) => {
    const shop = await createShop({ email: 'orders@shop.example' })
    const sameAddressShop = await createShop()
    const owner = await User.findOrFail(sameAddressShop.ownerId)
    sameAddressShop.email = owner.email
    await sameAddressShop.save()
    const buyer = guestOwner()
    await fillCart(buyer, [
      { variant: await createVariant(shop), quantity: 1 },
      { variant: await createVariant(sameAddressShop), quantity: 1 },
    ])
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })

    await new OrderAlerts({ enabled: true }).sendNewOrderAlerts(orderNumbers)

    const shopOwner = await User.findOrFail(shop.ownerId)
    const [toShop] = sent().filter((email) => email.message.hasTo(shopOwner.email))
    assert.isTrue(toShop.message.hasTo('orders@shop.example'))
    const [toSame] = sent().filter((email) => email.message.hasTo(owner.email))
    assert.lengthOf(toSame.message.toObject().message.to as unknown[], 1)
  })

  test('it names the order and links to it, without the customer', async ({ assert }) => {
    const shop = await createShop({ name: 'Thamel Threads', slug: `thamel-${Date.now()}` })
    const variant = await createVariant(shop, {
      priceMinor: 250_000,
      quantity: 5,
      product: { name: 'Linen Kurta' },
    })
    const buyer = guestOwner()
    await fillCart(buyer, [{ variant, quantity: 1 }])
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, {
      address: addressPayload({
        recipientName: 'Sita Sharma',
        recipientPhone: '9841234567',
        streetAddress: 'Thamel Marg 12',
      }),
    })

    await new OrderAlerts({ enabled: true }).sendNewOrderAlerts(orderNumbers)

    const [email] = sent()
    const message = email.message
    // The storefront's format: "Rs", a no-break space, lakh grouping.
    const rupees = (amount: string) => `Rs\u00A0${amount}`
    message.assertSubject(`New order ${orderNumbers[0]} · ${rupees('2,600')} · Thamel Threads`)
    message.assertTextIncludes('Linen Kurta × 1')
    message.assertTextIncludes(`Delivery: ${rupees('100')}`)
    message.assertTextIncludes(`Total: ${rupees('2,600')}`)
    message.assertTextIncludes('Guest order')
    message.assertTextIncludes(`/shops/${shop.slug}/orders/${orderNumbers[0]}`)
    message.assertHtmlIncludes('Linen Kurta')
    const everything = JSON.stringify(message.toObject())
    for (const personal of ['Sita', 'Sharma', '9841234567', 'Thamel Marg']) {
      assert.notInclude(everything, personal)
    }
  })

  test('nothing is sent when mail is not configured', async ({ assert }) => {
    const { buyer } = await twoShopCheckout()
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })

    await new OrderAlerts({ enabled: false }).sendNewOrderAlerts(orderNumbers)

    assert.lengthOf(sent(), 0)
  })
})

test.group('Order alerts: when sending fails [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test("one shop's email doesn't wait for another's: they are sent together", async ({
    assert,
  }) => {
    const { buyer } = await twoShopCheckout()
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })
    const mailer = overlapCountingMailer(2)

    await new OrderAlerts({ enabled: true, mailer, retryDelaysMs: [0, 0] }).sendNewOrderAlerts(
      orderNumbers
    )

    assert.equal(mailer.mostAtOnce(), 2, 'both emails were in flight at the same time')
  })

  test('a checkout with many shops sends at most three emails at once', async ({ assert }) => {
    const buyer = guestOwner()
    for (let shop = 0; shop < 5; shop++) {
      await fillCart(buyer, [{ variant: await createVariant(await createShop()), quantity: 1 }])
    }
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })
    const mailer = overlapCountingMailer(3)

    await new OrderAlerts({ enabled: true, mailer, retryDelaysMs: [0, 0] }).sendNewOrderAlerts(
      orderNumbers
    )

    assert.lengthOf(orderNumbers, 5)
    assert.equal(mailer.sent(), 5)
    assert.equal(mailer.mostAtOnce(), 3)
  })

  test('a failed send is retried, and given up after three attempts without throwing', async ({
    assert,
  }) => {
    const { buyer } = await twoShopCheckout()
    const { orderNumbers } = await new CheckoutService(
      new CartService(),
      recordingAlerts().alerts
    ).placeOrders(buyer, { address: addressPayload() })
    const attempts = new Map<string, number>()
    const failTwice = {
      async send(alert: NewOrderAlert) {
        const count = (attempts.get(alert.orderNumber) ?? 0) + 1
        attempts.set(alert.orderNumber, count)
        if (alert.orderNumber === orderNumbers[0] || count < 3) throw new Error('SMTP down')
      },
    }
    const neverSends = {
      async send() {
        throw new Error('SMTP down')
      },
    }

    await new OrderAlerts({
      enabled: true,
      mailer: failTwice,
      retryDelaysMs: [0, 0],
    }).sendNewOrderAlerts(orderNumbers)
    await new OrderAlerts({
      enabled: true,
      mailer: neverSends,
      retryDelaysMs: [0, 0],
    }).sendNewOrderAlerts(orderNumbers)

    assert.deepEqual(
      orderNumbers.map((number) => attempts.get(number)),
      [3, 3]
    )
  })
})
