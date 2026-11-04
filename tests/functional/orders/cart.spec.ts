import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import Cart from '#models/cart'
import Shop from '#models/shop'
import CartService from '#modules/orders/services/cart_service'
import type { CartOwner } from '#modules/orders/customer'
import { MAX_QUANTITY_PER_ITEM } from '#constants/order'
import { ShopStatus } from '#constants/shop_status'
import { createCustomer, createShop, createVariant, guestOwner } from '#tests/support/fixtures'

/*
 * The v1 cart (app/modules/orders/services/cart_service.ts): stock and
 * per-item limits when adding, what the cart totals count, and the guest
 * cart joining the account cart at login.
 */

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

async function quantities(owner: CartOwner) {
  const items = await new CartService().items(owner)
  return Object.fromEntries(items.map((item) => [item.productVariantId, item.quantity]))
}

test.group('Cart: adding items [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('no more than the stock left, counting what is already in the cart', async ({ assert }) => {
    const owner = guestOwner()
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 2 })
    const cart = new CartService()

    assert.equal(await refusal(cart.add(owner, variant.id, 3)), 'Only 2 left in stock')
    await cart.add(owner, variant.id, 2)
    assert.equal(
      await refusal(cart.add(owner, variant.id, 1)),
      'Only 2 left in stock (2 already in your cart)'
    )
    assert.deepEqual(await quantities(owner), { [variant.id]: 2 })
  })

  test('an out-of-stock item cannot be added', async ({ assert }) => {
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 0 })

    const message = await refusal(new CartService().add(guestOwner(), variant.id, 1))

    assert.equal(message, 'This item is out of stock')
  })

  test(`at most ${MAX_QUANTITY_PER_ITEM} of one item, even with more in stock`, async ({
    assert,
  }) => {
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 50 })

    const message = await refusal(
      new CartService().add(guestOwner(), variant.id, MAX_QUANTITY_PER_ITEM + 1)
    )

    assert.equal(message, `You can buy at most ${MAX_QUANTITY_PER_ITEM} of an item`)
  })

  test("an item from a shop that isn't active cannot be added", async ({ assert }) => {
    const shop = await createShop({ status: ShopStatus.PENDING })
    const variant = await createVariant(shop, { quantity: 5 })

    const message = await refusal(new CartService().add(guestOwner(), variant.id, 1))

    assert.equal(message, 'This item is no longer available')
  })

  test('changing a quantity above the stock left is refused', async ({ assert }) => {
    const owner = guestOwner()
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 3 })
    const cart = new CartService()
    const item = await cart.add(owner, variant.id, 1)

    assert.equal(await refusal(cart.update(owner, item.id, 4)), 'Only 3 left in stock')
    await cart.update(owner, item.id, 3)
    assert.deepEqual(await quantities(owner), { [variant.id]: 3 })
  })

  test("T-SEC-001 another cart's item cannot be changed or removed", async ({ assert }) => {
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 3 })
    const cart = new CartService()
    const owner = guestOwner()
    const item = await cart.add(owner, variant.id, 1)
    const stranger = guestOwner()
    const otherVariant = await createVariant(shop)
    await cart.add(stranger, otherVariant.id, 1)

    assert.equal(await refusal(cart.update(stranger, item.id, 2)), 'This item is not in your cart')
    assert.equal(await refusal(cart.remove(stranger, item.id)), 'This item is not in your cart')
    assert.deepEqual(await quantities(owner), { [variant.id]: 1 })
  })
})

test.group('Cart: totals [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('lines that became unavailable are listed but left out of the totals', async ({
    assert,
  }) => {
    const owner = guestOwner()
    const shopA = await createShop()
    const shopB = await createShop()
    const cart = new CartService()
    const shirt = await createVariant(shopA, { price: 1200, quantity: 5 })
    const sold = await createVariant(shopA, { price: 700, quantity: 1 })
    const scarf = await createVariant(shopB, { price: 300, quantity: 5 })
    await cart.add(owner, shirt.id, 2)
    await cart.add(owner, sold.id, 1)
    await cart.add(owner, scarf.id, 1)
    // The last one sells elsewhere, and shop B is suspended.
    sold.quantity = 0
    await sold.save()
    await Shop.query().where('id', shopB.id).update({ status: ShopStatus.SUSPENDED })

    const summary = cart.summarize(await cart.items(owner))

    assert.isTrue(summary.hasUnavailableItems)
    assert.equal(summary.subtotal, 2400)
    assert.equal(summary.shippingTotal, 100)
    assert.equal(summary.total, 2500)
    const problems = summary.shops.flatMap((shopGroup) =>
      shopGroup.items.map((line) => [line.variant.id, line.problem])
    )
    assert.sameDeepMembers(problems, [
      [shirt.id, null],
      [sold.id, 'Out of stock'],
      [scarf.id, 'No longer available'],
    ])
  })
})

test.group('Cart: logging in with a guest cart [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('the guest cart becomes the account cart when the account had none', async ({ assert }) => {
    const guest = guestOwner()
    const customer = await createCustomer()
    const shop = await createShop()
    const variant = await createVariant(shop, { quantity: 5 })
    const cart = new CartService()
    await cart.add(guest, variant.id, 2)

    await cart.adoptGuestCart(guest.guestToken, customer)

    assert.deepEqual(await quantities({ userId: customer.id }), { [variant.id]: 2 })
    assert.deepEqual(await quantities(guest), {})
  })

  test('the guest items join the account cart; the same item adds up, to the per-item maximum', async ({
    assert,
  }) => {
    const guest = guestOwner()
    const customer = await createCustomer()
    const account = { userId: customer.id }
    const shop = await createShop()
    const cart = new CartService()
    const shirt = await createVariant(shop, { quantity: 50 })
    const cap = await createVariant(shop, { quantity: 50 })
    const socks = await createVariant(shop, { quantity: 50 })
    await cart.add(account, shirt.id, 1)
    await cart.add(account, socks.id, 9)
    await cart.add(guest, shirt.id, 2)
    await cart.add(guest, cap.id, 1)
    await cart.add(guest, socks.id, 5)

    await cart.adoptGuestCart(guest.guestToken, customer)

    assert.deepEqual(await quantities(account), {
      [shirt.id]: 3,
      [cap.id]: 1,
      [socks.id]: MAX_QUANTITY_PER_ITEM,
    })
    assert.lengthOf(await Cart.query().where('user_id', customer.id), 1)
    assert.isNull(await cart.findCart(guest))
  })
})
