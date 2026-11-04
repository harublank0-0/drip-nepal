import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { errors as vineErrors } from '@vinejs/vine'
import Order from '#models/order'
import ProductVariant from '#models/product_variant'
import Product from '#models/product'
import Shop from '#models/shop'
import UserAddress from '#models/user_address'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import type { CartOwner } from '#modules/orders/customer'
import { OrderStatus, PaymentProvider, PaymentStatus } from '#constants/order'
import { ProductStatus, VariantStatus } from '#constants/product'
import { ShopStatus } from '#constants/shop_status'
import {
  addressPayload,
  createCustomer,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Checkout of the v1 store: the cart becomes one cash-on-delivery order
 * per shop (app/modules/orders/services/checkout_service.ts). Tagged @v1:
 * M0 rebuilds checkout to docs/05 and replaces these tests with the
 * registered ones they name.
 */

async function stockOf(variant: ProductVariant) {
  const fresh = await ProductVariant.findOrFail(variant.id)
  return fresh.quantity
}

async function cartLines(owner: CartOwner) {
  const items = await new CartService().items(owner)
  return items.length
}

async function placeFailure(...args: Parameters<CheckoutService['placeOrders']>) {
  const error = await new CheckoutService().placeOrders(...args).then(
    () => null,
    (caught) => caught
  )
  if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) {
    throw new Error(`Expected a validation error, got ${error}`)
  }
  return error.messages as { field: string; message: string }[]
}

test.group('Checkout: placing orders [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('T-CHK-010 one shop: one order with its totals, a COD payment, stock taken, cart emptied', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    const owner = { userId: customer.id }
    const shop = await createShop()
    const shirt = await createVariant(shop, { price: 1200, quantity: 5 })
    const cap = await createVariant(shop, { price: 450.5, quantity: 3 })
    await fillCart(owner, [
      { variant: shirt, quantity: 2 },
      { variant: cap, quantity: 1 },
    ])

    const { checkoutId, orderNumbers } = await new CheckoutService().placeOrders(
      { user: customer },
      { address: addressPayload() }
    )

    const orders = await Order.query()
      .where('checkout_id', checkoutId)
      .preload('items')
      .preload('payments')
    assert.lengthOf(orders, 1)
    const [order] = orders
    assert.deepEqual(orderNumbers, [order.orderNumber])
    assert.match(order.orderNumber, /^DN\d{6}-[A-Z0-9]{5}$/)
    assert.equal(order.shopId, shop.id)
    assert.equal(order.userId, customer.id)
    assert.equal(order.status, OrderStatus.PENDING)
    assert.equal(order.paymentStatus, PaymentStatus.PENDING)

    // 2 × 1,200 + 450.50 = 2,850.50: under Rs 5,000, so Rs 100 delivery.
    assert.equal(Number(order.subtotal), 2850.5)
    assert.equal(Number(order.shippingTotal), 100)
    assert.equal(Number(order.grandTotal), 2950.5)

    const lines = order.items.map((item) => ({
      variant: item.productVariantId,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
      subTotal: Number(item.subTotal),
      shop: item.shopId,
    }))
    assert.sameDeepMembers(lines, [
      { variant: shirt.id, unitPrice: 1200, quantity: 2, subTotal: 2400, shop: shop.id },
      { variant: cap.id, unitPrice: 450.5, quantity: 1, subTotal: 450.5, shop: shop.id },
    ])

    assert.lengthOf(order.payments, 1)
    assert.equal(order.payments[0].provider, PaymentProvider.CASH_ON_DELIVERY)
    assert.equal(order.payments[0].status, PaymentStatus.PENDING)
    assert.equal(Number(order.payments[0].amount), 2950.5)

    assert.equal(await stockOf(shirt), 3)
    assert.equal(await stockOf(cap), 2)
    assert.equal(await cartLines(owner), 0)

    // A logged-in customer's new address goes to their address book.
    const saved = await UserAddress.query().where('user_id', customer.id)
    assert.lengthOf(saved, 1)
    assert.isTrue(saved[0].isDefault)
    assert.equal(order.userAddressId, saved[0].id)
    assert.equal(order.shippingAddress.recipientPhone, '9841234567')
  })

  test('T-CHK-010 two shops: one order each, sharing the checkout, each with its own delivery fee', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    const shopA = await createShop()
    const shopB = await createShop()
    // Rs 5,000 exactly ships free; Rs 4,999 pays the fee.
    const jacket = await createVariant(shopA, { price: 2500, quantity: 4 })
    const kurta = await createVariant(shopB, { price: 4999, quantity: 1 })
    await fillCart({ userId: customer.id }, [
      { variant: jacket, quantity: 2 },
      { variant: kurta, quantity: 1 },
    ])

    const { checkoutId, orderNumbers } = await new CheckoutService().placeOrders(
      { user: customer },
      { address: addressPayload() }
    )

    const orders = await Order.query()
      .where('checkout_id', checkoutId)
      .preload('items')
      .preload('payments')
    assert.lengthOf(orders, 2)
    assert.sameMembers(
      orderNumbers,
      orders.map((order) => order.orderNumber)
    )

    const byShop = new Map(orders.map((order) => [order.shopId, order]))
    const orderA = byShop.get(shopA.id)!
    const orderB = byShop.get(shopB.id)!

    assert.deepEqual(
      [Number(orderA.subtotal), Number(orderA.shippingTotal), Number(orderA.grandTotal)],
      [5000, 0, 5000]
    )
    assert.deepEqual(
      [Number(orderB.subtotal), Number(orderB.shippingTotal), Number(orderB.grandTotal)],
      [4999, 100, 5099]
    )

    // Each order holds only its own shop's lines and its own payment.
    assert.deepEqual(
      orderA.items.map((item) => item.productVariantId),
      [jacket.id]
    )
    assert.deepEqual(
      orderB.items.map((item) => item.productVariantId),
      [kurta.id]
    )
    assert.deepEqual(
      orders.map((order) => order.payments.map((payment) => Number(payment.amount))),
      orders.map((order) => [Number(order.grandTotal)])
    )

    assert.equal(await stockOf(jacket), 2)
    assert.equal(await stockOf(kurta), 0)
  })

  test('a guest order has no user and saves no address', async ({ assert }) => {
    const owner = guestOwner()
    const shop = await createShop()
    const variant = await createVariant(shop, { price: 800, quantity: 2 })
    await fillCart(owner, [{ variant, quantity: 1 }])
    const before = await UserAddress.all()

    const { checkoutId } = await new CheckoutService().placeOrders(owner, {
      address: addressPayload({ recipientName: 'Guest Buyer', recipientPhone: '9801234567' }),
    })

    const order = await Order.query().where('checkout_id', checkoutId).firstOrFail()
    assert.isNull(order.userId)
    assert.isNull(order.userAddressId)
    assert.equal(order.shippingAddress.recipientName, 'Guest Buyer')
    assert.equal(order.shippingAddress.recipientPhone, '9801234567')
    assert.lengthOf(await UserAddress.all(), before.length)
    assert.equal(await cartLines(owner), 0)
  })

  test('T-ORD-105 later address and price edits do not change a placed order', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    const address = await new CheckoutService().saveAddress(customer, addressPayload())
    const shop = await createShop()
    const variant = await createVariant(shop, { price: 1500, quantity: 3 })
    await fillCart({ userId: customer.id }, [{ variant, quantity: 1 }])

    const { checkoutId } = await new CheckoutService().placeOrders(
      { user: customer },
      { addressId: address.id }
    )

    address.streetAddress = 'Somewhere else 99'
    await address.save()
    variant.price = '2500.00'
    await variant.save()

    const order = await Order.query()
      .where('checkout_id', checkoutId)
      .preload('items')
      .firstOrFail()
    assert.equal(order.userAddressId, address.id)
    assert.equal(order.shippingAddress.streetAddress, 'Thamel Marg 12')
    assert.equal(Number(order.items[0].unitPrice), 1500)
    assert.equal(Number(order.grandTotal), 1600)
  })
})

test.group('Checkout: refusals write nothing [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('more than the stock left is refused; no order, stock and cart unchanged', async ({
    assert,
  }) => {
    const customer = await createCustomer()
    const owner = { userId: customer.id }
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 2 })
    await fillCart(owner, [{ variant, quantity: 2 }])
    // Someone else bought one after this customer filled their cart.
    variant.quantity = 1
    await variant.save()

    const messages = await placeFailure({ user: customer }, { address: addressPayload() })

    assert.equal(messages[0].field, 'cart')
    assert.match(messages[0].message, /^Only 1 of .+ left/)
    assert.lengthOf(await Order.query().where('shop_id', shop.id), 0)
    assert.equal(await stockOf(variant), 1)
    assert.equal(await cartLines(owner), 1)
    assert.lengthOf(await UserAddress.query().where('user_id', customer.id), 0)
  })

  test('a sold-out item is refused', async ({ assert }) => {
    const owner = guestOwner()
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 1 })
    await fillCart(owner, [{ variant, quantity: 1 }])
    variant.quantity = 0
    await variant.save()

    const messages = await placeFailure(owner, { address: addressPayload() })

    assert.match(messages[0].message, /just sold out/)
    assert.lengthOf(await Order.query().where('shop_id', shop.id), 0)
  })

  test('an item taken off sale after it was added is refused: {case}')
    .with([
      {
        case: 'shop suspended',
        apply: async (variant: ProductVariant) => {
          const product = await Product.findOrFail(variant.productId)
          await Shop.query().where('id', product.shopId).update({ status: ShopStatus.SUSPENDED })
        },
      },
      {
        case: 'product back to draft',
        apply: async (variant: ProductVariant) => {
          await Product.query()
            .where('id', variant.productId)
            .update({ status: ProductStatus.DRAFT })
        },
      },
      {
        case: 'product deleted',
        apply: async (variant: ProductVariant) => {
          await Product.query()
            .where('id', variant.productId)
            .update({ deleted_at: DateTime.now().toSQL() })
        },
      },
      {
        case: 'variant archived',
        apply: async (variant: ProductVariant) => {
          await ProductVariant.query()
            .where('id', variant.id)
            .update({ status: VariantStatus.ARCHIVED })
        },
      },
    ])
    .run(async ({ assert }, { apply }) => {
      const customer = await createCustomer()
      const shop = await createShop()
      const variant = await createVariant(shop, { quantity: 3 })
      await fillCart({ userId: customer.id }, [{ variant, quantity: 1 }])
      await apply(variant)

      const messages = await placeFailure({ user: customer }, { address: addressPayload() })

      assert.match(messages[0].message, /is no longer available/)
      assert.lengthOf(await Order.query().where('shop_id', shop.id), 0)
      assert.equal(await stockOf(variant), 3)
    })

  test('an empty cart is refused', async ({ assert }) => {
    const customer = await createCustomer()

    const messages = await placeFailure({ user: customer }, { address: addressPayload() })

    assert.equal(messages[0].field, 'cart')
    assert.equal(messages[0].message, 'Your cart is empty')
  })

  test("T-SEC-001 another customer's saved address is refused, like a missing one", async ({
    assert,
  }) => {
    const other = await createCustomer()
    const othersAddress = await new CheckoutService().saveAddress(other, addressPayload())
    const customer = await createCustomer()
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 2 })
    await fillCart({ userId: customer.id }, [{ variant, quantity: 1 }])

    const messages = await placeFailure({ user: customer }, { addressId: othersAddress.id })

    assert.equal(messages[0].field, 'addressId')
    assert.lengthOf(await Order.query().where('shop_id', shop.id), 0)
    assert.equal(await stockOf(variant), 2)
  })
})
