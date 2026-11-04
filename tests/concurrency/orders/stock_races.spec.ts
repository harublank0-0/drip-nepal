import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import Order from '#models/order'
import OrderItem from '#models/order_item'
import type Payment from '#models/payment'
import ProductVariant from '#models/product_variant'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import { OrderStatus, PaymentStatus } from '#constants/order'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Races in the v1 store, run for real: every call commits, and parallel
 * calls run on separate pool connections, so the row locks in
 * CheckoutService and OrderService make the losers wait (docs/10 §3.3).
 * Each round creates its own shop and products, so tests isolate by data.
 * Removing `.forUpdate()` from either service makes these tests fail.
 */

const ROUNDS = 10

async function stockOf(variant: ProductVariant) {
  const fresh = await ProductVariant.findOrFail(variant.id)
  return fresh.quantity
}

/*
 * Splits settled calls into winners and refusals. Anything other than a
 * refusal the customer would see (a deadlock, a constraint error) fails
 * the test.
 */
function settle(results: PromiseSettledResult<unknown>[]) {
  const refusals: { field: string; message: string }[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') continue
    if (!(result.reason instanceof vineErrors.E_VALIDATION_ERROR)) throw result.reason
    refusals.push(result.reason.messages[0])
  }
  return { winners: results.length - refusals.length, refusals }
}

async function placeOne(quantity: number) {
  const shop = await createShop()
  const variant = await createVariant(shop, { quantity })
  const buyer = guestOwner()
  await fillCart(buyer, [{ variant, quantity: 1 }])
  const { orderNumbers } = await new CheckoutService().placeOrders(buyer, {
    address: addressPayload(),
  })
  return { variant, orderNumber: orderNumbers[0] }
}

/*
 * Two separately loaded copies of one order, as two browser tabs or the
 * customer and the shop would hold them.
 */
function twoCopies(orderNumber: string) {
  return Promise.all([
    Order.findByOrFail('order_number', orderNumber),
    Order.findByOrFail('order_number', orderNumber),
  ])
}

test.group('Stock races [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('T-INV-003 four buyers race for the last unit: one order, stock never below zero', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createShop()
      const variant = await createVariant(shop, { quantity: 1 })
      const buyers = [guestOwner(), guestOwner(), guestOwner(), guestOwner()]
      for (const buyer of buyers) {
        await fillCart(buyer, [{ variant, quantity: 1 }])
      }

      const { winners, refusals } = settle(
        await Promise.allSettled(
          buyers.map((buyer) =>
            new CheckoutService().placeOrders(buyer, { address: addressPayload() })
          )
        )
      )

      assert.equal(winners, 1, `round ${round}`)
      for (const refusal of refusals) {
        assert.match(refusal.message, /just sold out/)
      }
      assert.equal(await stockOf(variant), 0)
      assert.lengthOf(await OrderItem.query().where('product_variant_id', variant.id), 1)
    }
  })

  test('T-CHK-009 two carts with the same two items in opposite order both check out, no deadlock', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createShop()
      const shirt = await createVariant(shop, { quantity: 10 })
      const pants = await createVariant(shop, { quantity: 10 })
      const first = guestOwner()
      const second = guestOwner()
      await fillCart(first, [
        { variant: shirt, quantity: 1 },
        { variant: pants, quantity: 1 },
      ])
      await fillCart(second, [
        { variant: pants, quantity: 1 },
        { variant: shirt, quantity: 1 },
      ])

      const { winners } = settle(
        await Promise.allSettled(
          [first, second].map((buyer) =>
            new CheckoutService().placeOrders(buyer, { address: addressPayload() })
          )
        )
      )

      assert.equal(winners, 2, `round ${round}`)
      assert.equal(await stockOf(shirt), 8)
      assert.equal(await stockOf(pants), 8)
    }
  })
})

test.group('Order status races [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('T-ORD-002 customer cancel racing the shop confirm: exactly one wins, stock matches', async ({
    assert,
  }) => {
    const orders = new OrderService()

    for (let round = 0; round < ROUNDS; round++) {
      const { variant, orderNumber } = await placeOne(3)
      const [customerCopy, shopCopy] = await twoCopies(orderNumber)

      const { winners } = settle(
        await Promise.allSettled([
          orders.cancelByCustomer(customerCopy),
          orders.transition(shopCopy, OrderStatus.CONFIRMED),
        ])
      )

      assert.equal(winners, 1, `round ${round}`)
      const final = await Order.findByOrFail('order_number', orderNumber)
      assert.include([OrderStatus.CANCELLED, OrderStatus.CONFIRMED], final.status)
      // Cancelled puts the unit back; confirmed keeps it sold.
      assert.equal(await stockOf(variant), final.status === OrderStatus.CANCELLED ? 3 : 2)
    }
  })

  test('the shop and the customer cancel at once: stock comes back once', async ({ assert }) => {
    const orders = new OrderService()

    for (let round = 0; round < ROUNDS; round++) {
      const { variant, orderNumber } = await placeOne(3)
      const [customerCopy, shopCopy] = await twoCopies(orderNumber)

      const { winners } = settle(
        await Promise.allSettled([
          orders.cancelByCustomer(customerCopy),
          orders.transition(shopCopy, OrderStatus.CANCELLED),
        ])
      )

      assert.equal(winners, 1, `round ${round}`)
      assert.equal(await stockOf(variant), 3)
      const final = await Order.query()
        .where('order_number', orderNumber)
        .preload('payments')
        .firstOrFail()
      assert.equal(final.status, OrderStatus.CANCELLED)
      assert.deepEqual(
        final.payments.map((payment: Payment) => payment.status),
        [PaymentStatus.VOIDED]
      )
    }
  })
})
