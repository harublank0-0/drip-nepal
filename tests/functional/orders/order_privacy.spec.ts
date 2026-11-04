import { test } from '@japa/runner'
import User from '#models/user'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import type OrderAlerts from '#modules/orders/services/order_alerts'
import CartService from '#modules/orders/services/cart_service'
import OrderTransformer from '#transformers/order_transformer'
import {
  addressPayload,
  createCustomer,
  createShop,
  createVariant,
  fillCart,
} from '#tests/support/fixtures'

/*
 * What an order page sends to the browser (docs/07 §5). The shop sees the
 * buyer's account (name, email, phone) to reach them; the customer pages,
 * including guest tracking with an order number and the recipient's
 * phone, never carry it. Before this, someone tracking a gift saw the
 * buyer's account email and phone in the page data.
 */

const noAlerts = { sendInBackground() {} } as unknown as OrderAlerts

async function giftOrder() {
  const shop = await createShop()
  const buyer = await createCustomer({ phone: '9800000077' })
  await fillCart({ userId: buyer.id }, [{ variant: await createVariant(shop), quantity: 1 }])
  const { orderNumbers } = await new CheckoutService(new CartService(), noAlerts).placeOrders(
    { user: buyer },
    { address: addressPayload({ recipientName: 'Gift Friend', recipientPhone: '9812345678' }) }
  )
  return { shop, buyer: await User.findOrFail(buyer.id), orderNumber: orderNumbers[0] }
}

test.group('Order data privacy [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('the customer and tracking pages carry no buyer account details', async ({ assert }) => {
    const { buyer, orderNumber } = await giftOrder()
    const order = await new OrderService()
      .detailQuery()
      .where('order_number', orderNumber)
      .firstOrFail()

    const page = JSON.stringify(new OrderTransformer(order).toObject())

    assert.notInclude(page, buyer.email)
    assert.notInclude(page, '9800000077')
    assert.notInclude(page, '"customer"')
    assert.include(page, 'Gift Friend', 'the recipient on the parcel is still shown')
  })

  test("the shop's order page still shows the buyer's account", async ({ assert }) => {
    const { shop, buyer, orderNumber } = await giftOrder()
    const order = await new OrderService().findForShop(shop, orderNumber)

    const page = new OrderTransformer(order).forShop()

    assert.deepEqual(page.customer, {
      fullName: buyer.fullName,
      email: buyer.email,
      phone: buyer.phone,
    })
  })
})
