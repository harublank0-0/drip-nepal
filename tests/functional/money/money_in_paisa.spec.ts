import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import Category from '#models/category'
import Order from '#models/order'
import type Product from '#models/product'
import User from '#models/user'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import type OrderAlerts from '#modules/orders/services/order_alerts'
import CatalogService from '#modules/catalog/services/catalog_service'
import { productValidator } from '#modules/shops/validators/product'
import { clientNetwork, limiterKey, loginNetworkLimiter } from '#modules/auth/rate_limits'
import OrderTransformer from '#transformers/order_transformer'
import { OrderStatus } from '#constants/order'
import { ProductGender, ProductStatus } from '#constants/product'
import { PRICE_MAX_MINOR } from '#shared/constants/money'
import { testBrowser } from '#tests/support/browser'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Money is whole paisa in v1 (RF-16, ADR-0007, docs/04 §18.1): bigint
 * columns, integer arithmetic, and rupees only where people type or read
 * them.
 */

const noAlerts = { sendInBackground() {} } as unknown as OrderAlerts
const NBSP = String.fromCharCode(0xa0)

async function checkOut(lines: { priceMinor: number; quantity: number; stock?: number }[]) {
  const shop = await createShop()
  const buyer = guestOwner()
  const variants = []
  for (const line of lines) {
    const variant = await createVariant(shop, {
      priceMinor: line.priceMinor,
      quantity: line.stock ?? line.quantity,
    })
    variants.push({ variant, quantity: line.quantity })
  }
  await fillCart(buyer, variants)
  const summary = new CartService().summarize(await new CartService().items(buyer))
  const { checkoutId } = await new CheckoutService(new CartService(), noAlerts).placeOrders(buyer, {
    address: addressPayload(),
  })
  const order = await Order.query().where('checkout_id', checkoutId).firstOrFail()
  return { shop, summary, order }
}

test.group('Money in paisa: checkout [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test("a shop's part worth exactly Rs 5,000 in prices with paisa ships free", async ({
    assert,
  }) => {
    // Rs 1,951.23 + 2,794.33 + 254.44 = Rs 5,000.00. Added as rupee floats,
    // as v1 did, it came to 4,999.999999999999 and was charged delivery.
    const { summary, order } = await checkOut([
      { priceMinor: 195_123, quantity: 1 },
      { priceMinor: 279_433, quantity: 1 },
      { priceMinor: 25_444, quantity: 1 },
    ])

    assert.strictEqual(summary.subtotalMinor, 500_000)
    assert.strictEqual(summary.shippingTotalMinor, 0)
    assert.strictEqual(order.subtotalMinor, 500_000)
    assert.strictEqual(order.shippingTotalMinor, 0)
    assert.strictEqual(order.grandTotalMinor, 500_000)
  })

  test('an order beyond the old Rs 9,99,99,999.99 columns is kept exactly', async ({ assert }) => {
    // Ten of the highest price: Rs 10,00,00,00,000.00, which decimal(10,2)
    // could not hold.
    const { order } = await checkOut([{ priceMinor: PRICE_MAX_MINOR, quantity: 10 }])

    const stored = await Order.findOrFail(order.id)
    assert.strictEqual(stored.grandTotalMinor, 10_000_000_000)
    const shown = new OrderTransformer(stored).toObject()
    assert.strictEqual(shown.grandTotalMinor, 10_000_000_000)
  })
})

test.group('Money in paisa: product prices [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  async function productWith(variant: Record<string, unknown>) {
    const category = await Category.query().orderBy('slug', 'asc').firstOrFail()
    return {
      name: 'Dhaka topi',
      categoryId: category.id,
      gender: ProductGender.UNISEX,
      status: ProductStatus.ACTIVE,
      variants: [{ quantity: 5, ...variant }],
    }
  }

  async function refusal(variant: Record<string, unknown>) {
    try {
      await productValidator.validate(await productWith(variant))
    } catch (error) {
      if (error instanceof vineErrors.E_VALIDATION_ERROR) {
        return (error.messages as { field: string; message: string }[])[0]
      }
      throw error
    }
    return null
  }

  test('prices arrive as whole paisa, as the form sends them', async ({ assert }) => {
    // A multipart form sends text.
    const valid = await productValidator.validate(
      await productWith({ priceMinor: '129950', comparePriceMinor: null })
    )

    assert.strictEqual(valid.variants[0].priceMinor, 129_950)
    assert.isNull(valid.variants[0].comparePriceMinor)
  })

  test('a price that is not whole paisa, too high, or missing is refused', async ({ assert }) => {
    assert.deepEqual(await refusal({ priceMinor: 1299.5 }), {
      field: 'variants.0.priceMinor',
      message: 'Enter an amount in rupees, such as 1299 or 1299.50',
      rule: 'withoutDecimals',
    })
    const tooHigh = await refusal({ priceMinor: PRICE_MAX_MINOR + 1 })
    assert.equal(tooHigh?.message, `The highest price is Rs${NBSP}1,00,00,000`)
    const missing = await refusal({})
    assert.equal(missing?.message, 'Enter a price')
  })
})

test.group('Money in paisa: catalog prices [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('the price filter takes whole rupees and compares paisa', async ({ assert }) => {
    const shop = await createShop()
    const cheap = await createVariant(shop, { priceMinor: 99_950 })
    const dear = await createVariant(shop, { priceMinor: 150_000 })
    const catalog = new CatalogService()
    const listed = async (filters: { minRupees?: number; maxRupees?: number }) => {
      const page = await catalog.list({ shopId: shop.id, ...filters }, 1)
      return page.all().map((product: Product) => product.id)
    }

    assert.deepEqual(await listed({ minRupees: 1000 }), [dear.productId])
    // Rs 999.50 is above Rs 999 and within Rs 1,000.
    assert.deepEqual(await listed({ maxRupees: 999 }), [])
    assert.deepEqual(await listed({ maxRupees: 1000 }), [cheap.productId])

    const facets = await catalog.facets({ shopId: shop.id })
    assert.deepEqual(facets.price, { minRupees: 999, maxRupees: 1500 })
  })

  test('a price bound beyond any price in the URL lists normally', async ({ assert }) => {
    const browser = testBrowser()
    for (const query of ['max=1e30', 'min=99999999999999999999', 'min=abc&max=-5']) {
      const response = await browser.open(`/search?${query}`).then(
        () => 200,
        (error: Error) => error.message
      )
      assert.equal(response, 200, query)
    }
  })
})

test.group('Money in paisa: seller dashboard [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))
  const localKeys = ['127.0.0.1', '::1'].map((ip) => limiterKey('login:ip', clientNetwork(ip)))
  group.each.setup(async () => {
    const clear = async () => {
      await Promise.all(localKeys.map((key) => loginNetworkLimiter().delete(key)))
    }
    await clear()
    return clear
  })

  test("revenue is the delivered orders' totals in paisa", async ({ assert }) => {
    const shop = await createShop()
    const placeOrder = async (priceMinor: number) => {
      const variant = await createVariant(shop, { priceMinor })
      const buyer = guestOwner()
      await fillCart(buyer, [{ variant, quantity: 1 }])
      const { checkoutId } = await new CheckoutService(new CartService(), noAlerts).placeOrders(
        buyer,
        { address: addressPayload() }
      )
      return checkoutId
    }
    const delivered = [await placeOrder(195_123), await placeOrder(279_433)]
    await placeOrder(100_000)
    await Order.query().whereIn('checkout_id', delivered).update({ status: OrderStatus.DELIVERED })

    const owner = await User.findOrFail(shop.ownerId)
    owner.password = 'a-long-test-password'
    await owner.save()
    const browser = testBrowser()
    await browser.open('/')
    const login = await browser.post('/api/v1/login', {
      email: owner.email,
      password: 'a-long-test-password',
    })
    assert.equal(login.status, 302)

    const props = await browser.props(`/shops/${shop.slug}/dashboard`)
    const stats = props.stats as { revenueMinor: unknown }
    // (Rs 1,951.23 + Rs 100 delivery) + (Rs 2,794.33 + Rs 100 delivery); the
    // pending Rs 1,000 order doesn't count.
    assert.strictEqual(stats.revenueMinor, 494_556)
  })
})
