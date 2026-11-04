import { test } from '@japa/runner'
import { errors as lucidErrors } from '@adonisjs/lucid'
import { errors as vineErrors } from '@vinejs/vine'
import Order from '#models/order'
import ProductVariant from '#models/product_variant'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import { phoneDigits } from '#modules/orders/customer'
import { OrderStatus, PaymentStatus } from '#constants/order'
import {
  addressPayload,
  createCustomer,
  createShop,
  createVariant,
  fillCart,
} from '#tests/support/fixtures'

/*
 * What happens to an order after checkout in the v1 store: the shop moves
 * it pending -> confirmed -> shipped -> delivered or cancels it, and the
 * customer may cancel while it is pending
 * (app/modules/orders/services/order_service.ts, ORDER_TRANSITIONS).
 */

async function stockOf(variant: ProductVariant) {
  const fresh = await ProductVariant.findOrFail(variant.id)
  return fresh.quantity
}

/*
 * A customer orders `quantity` of one item (stock 5) from a fresh shop.
 */
async function placedOrder(quantity = 2) {
  const customer = await createCustomer()
  const shop = await createShop()
  const variant = await createVariant(shop, { price: 1000, quantity: 5 })
  await fillCart({ userId: customer.id }, [{ variant, quantity }])
  const { orderNumbers } = await new CheckoutService().placeOrders(
    { user: customer },
    { address: addressPayload() }
  )
  const order = await Order.findByOrFail('order_number', orderNumbers[0])
  return { customer, shop, variant, order }
}

async function statusOf(order: Order) {
  const fresh = await Order.findOrFail(order.id)
  return fresh.status
}

async function reload(order: Order) {
  return Order.query().where('id', order.id).preload('payments').firstOrFail()
}

async function refusal(action: Promise<unknown>) {
  const error = await action.then(
    () => null,
    (caught) => caught
  )
  if (!(error instanceof vineErrors.E_VALIDATION_ERROR)) {
    throw new Error(`Expected a validation error, got ${error}`)
  }
  return (error.messages as { message: string }[])[0].message
}

test.group('Order status: the shop moves an order along [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('pending -> confirmed -> shipped -> delivered; delivery records the cash as paid', async ({
    assert,
  }) => {
    const { variant, order } = await placedOrder(2)
    const orders = new OrderService()

    await orders.transition(order, OrderStatus.CONFIRMED)
    assert.equal(await statusOf(order), OrderStatus.CONFIRMED)
    await orders.transition(order, OrderStatus.SHIPPED)
    assert.equal(await statusOf(order), OrderStatus.SHIPPED)
    await orders.transition(order, OrderStatus.DELIVERED)

    const delivered = await reload(order)
    assert.equal(delivered.status, OrderStatus.DELIVERED)
    assert.equal(delivered.paymentStatus, PaymentStatus.PAID)
    assert.lengthOf(delivered.payments, 1)
    assert.equal(delivered.payments[0].status, PaymentStatus.PAID)
    assert.isNotNull(delivered.payments[0].paidAt)
    // Taken once at checkout; the status changes never touch stock.
    assert.equal(await stockOf(variant), 3)
  })

  test('{from} -> {to} is refused and changes nothing')
    .with([
      { from: OrderStatus.PENDING, to: OrderStatus.SHIPPED },
      { from: OrderStatus.PENDING, to: OrderStatus.DELIVERED },
      { from: OrderStatus.CONFIRMED, to: OrderStatus.DELIVERED },
      { from: OrderStatus.SHIPPED, to: OrderStatus.CANCELLED },
      { from: OrderStatus.DELIVERED, to: OrderStatus.CANCELLED },
      { from: OrderStatus.CANCELLED, to: OrderStatus.CONFIRMED },
    ])
    .run(async ({ assert }, { from, to }) => {
      const { variant, order } = await placedOrder(2)
      await Order.query().where('id', order.id).update({ status: from })
      const current = await reload(order)

      const message = await refusal(new OrderService().transition(current, to))

      assert.equal(message, `An order that is ${from} can't be marked ${to}`)
      assert.equal(await statusOf(order), from)
      assert.equal(await stockOf(variant), 3)
    })

  test('cancelling puts the stock back and voids the COD payment: {from}')
    .with([{ from: OrderStatus.PENDING }, { from: OrderStatus.CONFIRMED }])
    .run(async ({ assert }, { from }) => {
      const { variant, order } = await placedOrder(2)
      const orders = new OrderService()
      if (from === OrderStatus.CONFIRMED) await orders.transition(order, OrderStatus.CONFIRMED)
      assert.equal(await stockOf(variant), 3)

      await orders.transition(order, OrderStatus.CANCELLED)

      const cancelled = await reload(order)
      assert.equal(cancelled.status, OrderStatus.CANCELLED)
      assert.equal(cancelled.paymentStatus, PaymentStatus.VOIDED)
      assert.equal(cancelled.payments[0].status, PaymentStatus.VOIDED)
      assert.equal(await stockOf(variant), 5)
    })

  test('an out-of-date copy of an order cannot move it again, so stock comes back once', async ({
    assert,
  }) => {
    const { variant, order } = await placedOrder(2)
    const staleCopy = await Order.findOrFail(order.id)
    const orders = new OrderService()

    await orders.transition(order, OrderStatus.CANCELLED)
    const message = await refusal(orders.transition(staleCopy, OrderStatus.CANCELLED))

    assert.equal(message, 'This order was just updated. Reload and try again.')
    assert.equal(await stockOf(variant), 5)
  })
})

test.group('Order status: the customer cancels [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a pending order can be cancelled by its customer', async ({ assert }) => {
    const { variant, order } = await placedOrder(1)

    await new OrderService().cancelByCustomer(order)

    assert.equal(await statusOf(order), OrderStatus.CANCELLED)
    assert.equal(await stockOf(variant), 5)
  })

  test('once the shop confirms, the customer can no longer cancel', async ({ assert }) => {
    const { variant, order } = await placedOrder(1)
    const orders = new OrderService()
    await orders.transition(order, OrderStatus.CONFIRMED)

    const message = await refusal(orders.cancelByCustomer(order))

    assert.match(message, /confirmed by the shop/)
    assert.equal(await statusOf(order), OrderStatus.CONFIRMED)
    assert.equal(await stockOf(variant), 4)
  })

  test('cancelling twice is refused the second time', async ({ assert }) => {
    const { variant, order } = await placedOrder(1)
    const orders = new OrderService()
    await orders.cancelByCustomer(order)

    const message = await refusal(orders.cancelByCustomer(order))

    assert.equal(message, 'This order is already cancelled.')
    assert.equal(await stockOf(variant), 5)
  })
})

test.group('Order access [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test("T-SEC-001 another shop's or customer's order is not found, exactly like a missing one", async ({
    assert,
  }) => {
    const { customer, shop, order } = await placedOrder(1)
    const otherShop = await createShop()
    const otherCustomer = await createCustomer()
    const orders = new OrderService()

    // The owners find it.
    const forShop = await orders.findForShop(shop, order.orderNumber)
    const forCustomer = await orders.findForCustomer(customer, order.orderNumber)
    assert.equal(forShop.id, order.id)
    assert.equal(forCustomer.id, order.id)

    // Anyone else gets the same not-found error as a number that doesn't exist.
    for (const lookup of [
      () => orders.findForShop(otherShop, order.orderNumber),
      () => orders.findForCustomer(otherCustomer, order.orderNumber),
      () => orders.findForShop(shop, 'DN000000-NOPE0'),
    ]) {
      await assert.rejects(lookup, lucidErrors.E_ROW_NOT_FOUND)
    }
  })

  test('order tracking finds an order only with its number and mobile number', async ({
    assert,
  }) => {
    const { order } = await placedOrder(1)
    const second = await placedOrder(1)
    const orders = new OrderService()

    // The checkout phone is 9841234567; the customer may type it any way.
    for (const typed of ['9841234567', '+977-9841234567', '984 123 4567']) {
      const found = await orders.findByNumberAndPhone(order.orderNumber, phoneDigits(typed))
      assert.equal(found?.id, order.id, typed)
    }
    await second.order.merge({ shippingAddress: { recipientPhone: '+977-980 111 2222' } }).save()
    const formatted = await orders.findByNumberAndPhone(second.order.orderNumber, '9801112222')
    assert.equal(formatted?.id, second.order.id)

    // A wrong phone, another order's number, or too few digits finds nothing.
    assert.isNull(await orders.findByNumberAndPhone(order.orderNumber, '9800000000'))
    assert.isNull(await orders.findByNumberAndPhone(second.order.orderNumber, '9841234567'))
    assert.isNull(await orders.findByNumberAndPhone(order.orderNumber, phoneDigits('1234567')))
  })
})
