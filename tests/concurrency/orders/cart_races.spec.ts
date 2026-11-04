import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import Order from '#models/order'
import ProductVariant from '#models/product_variant'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Races on one shopper's cart in the v1 store, run for real (docs/10 §3.3):
 * every call commits on its own pool connection. Cart writes and checkout
 * take a per-shopper lock first (CartService.lockOwner), so a second
 * request for the same cart waits for the first and then sees what it did.
 */

const ROUNDS = 10

async function stockOf(variant: ProductVariant) {
  const fresh = await ProductVariant.findOrFail(variant.id)
  return fresh.quantity
}

/*
 * Splits settled calls into winners and refusals; anything else (a
 * deadlock, a constraint error) fails the test.
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

test.group('Cart races [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  // The "concurrent duplicates create one" half of T-CHK-004; v1 has no
  // Idempotency-Key, so the second submit is refused instead of replayed.
  test('a cart submitted twice at once is placed once', async ({ assert }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createShop()
      const variant = await createVariant(shop, { quantity: 5 })
      const buyer = guestOwner()
      await fillCart(buyer, [{ variant, quantity: 2 }])

      const results = await Promise.allSettled([
        new CheckoutService().placeOrders(buyer, { address: addressPayload() }),
        new CheckoutService().placeOrders(buyer, { address: addressPayload() }),
      ])

      const { winners, refusals } = settle(results)
      assert.equal(winners, 1, `round ${round}: one checkout places the order`)
      assert.match(refusals[0].message, /cart is empty/i)
      assert.lengthOf(await Order.query().where('shop_id', shop.id), 1)
      assert.equal(await stockOf(variant), 3, `round ${round}: stock taken once`)
    }
  })

  test('T-CHK-009 carts holding the same two items in opposite order never deadlock', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createShop()
      const first = await createVariant(shop, { quantity: 10 })
      const second = await createVariant(shop, { quantity: 10 })
      const buyerA = guestOwner()
      const buyerB = guestOwner()
      await fillCart(buyerA, [
        { variant: first, quantity: 1 },
        { variant: second, quantity: 1 },
      ])
      await fillCart(buyerB, [
        { variant: second, quantity: 1 },
        { variant: first, quantity: 1 },
      ])

      const results = await Promise.allSettled([
        new CheckoutService().placeOrders(buyerA, { address: addressPayload() }),
        new CheckoutService().placeOrders(buyerB, { address: addressPayload() }),
      ])

      assert.equal(settle(results).winners, 2, `round ${round}: both checkouts succeed`)
      assert.equal(await stockOf(first), 8)
      assert.equal(await stockOf(second), 8)
    }
  })

  test('T-CART-101 two first adds for the same shopper make one cart', async ({ assert }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const shop = await createShop()
      const variant = await createVariant(shop, { quantity: 10 })
      const buyer = guestOwner()

      const results = await Promise.allSettled([
        new CartService().add(buyer, variant.id, 1),
        new CartService().add(buyer, variant.id, 1),
      ])

      assert.equal(settle(results).winners, 2, `round ${round}: both adds succeed`)
      const carts = await Cart.query().where('session_id', buyer.guestToken)
      assert.lengthOf(carts, 1, `round ${round}: one cart`)
      const items = await CartItem.query().where('cart_id', carts[0].id)
      assert.lengthOf(items, 1)
      assert.equal(items[0].quantity, 2)
    }
  })
})
