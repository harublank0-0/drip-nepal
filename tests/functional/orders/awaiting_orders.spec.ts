import { test } from '@japa/runner'
import Order from '#models/order'
import type Shop from '#models/shop'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import type OrderAlerts from '#modules/orders/services/order_alerts'
import { OrderStatus } from '#constants/order'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * The seller dashboard's new-order indicator (FR-NOT-003) shows how many of
 * the shop's orders wait for the shop to confirm them.
 */

const noAlerts = { sendInBackground() {} } as unknown as OrderAlerts

async function placeOrderWith(shop: Shop) {
  const buyer = guestOwner()
  await fillCart(buyer, [{ variant: await createVariant(shop), quantity: 1 }])
  const { orderNumbers } = await new CheckoutService(new CartService(), noAlerts).placeOrders(
    buyer,
    { address: addressPayload() }
  )
  return Order.findByOrFail('order_number', orderNumbers[0])
}

test.group('Orders awaiting confirmation [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test("T-SEC-001 counts only this shop's pending orders", async ({ assert }) => {
    const shop = await createShop()
    const otherShop = await createShop()
    const orders = new OrderService()
    await placeOrderWith(shop)
    await placeOrderWith(shop)
    await orders.transition(await placeOrderWith(shop), OrderStatus.CONFIRMED)
    await orders.transition(await placeOrderWith(shop), OrderStatus.CANCELLED)
    await placeOrderWith(otherShop)

    assert.equal(await orders.awaitingCount(shop), 2)
    assert.equal(await orders.awaitingCount(otherShop), 1)
  })

  test('a shop without orders has none waiting', async ({ assert }) => {
    assert.equal(await new OrderService().awaitingCount(await createShop()), 0)
  })
})
