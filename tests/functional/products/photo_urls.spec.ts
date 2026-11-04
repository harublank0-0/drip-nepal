import { test } from '@japa/runner'
import Product from '#models/product'
import ProductMedia from '#models/product_media'
import type ProductVariant from '#models/product_variant'
import CatalogService from '#modules/catalog/services/catalog_service'
import CartService from '#modules/orders/services/cart_service'
import CheckoutService from '#modules/orders/services/checkout_service'
import OrderService from '#modules/orders/services/order_service'
import ProductCardTransformer from '#transformers/product_card_transformer'
import OrderTransformer from '#transformers/order_transformer'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Small places (product cards, cart and order lines, the home page's
 * category tiles) load the 640 px photo, not the 1600 px one. A photo
 * uploaded before resizing has no 640 px file until `node ace
 * media:optimize` runs, so those fall back to the photo they have.
 */

async function addPhoto(variant: ProductVariant, name: string, withSmall = true) {
  return ProductMedia.create({
    productId: variant.productId,
    type: 'image',
    provider: 'drive',
    url: `/uploads/${name}-1600.webp`,
    thumbnailUrl: withSmall ? `/uploads/${name}-640.webp` : null,
    sortOrder: name === 'front' || name === 'old' ? 0 : 1,
  })
}

async function cardFor(variant: ProductVariant) {
  const catalog = new CatalogService()
  const product = await catalog
    .withCardRelations(Product.query().where('id', variant.productId))
    .firstOrFail()
  return new ProductCardTransformer(product).toObject()
}

test.group('Photos in small places use the 640 px file [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('product cards, including the hover photo', async ({ assert }) => {
    const variant = await createVariant(await createShop())
    await addPhoto(variant, 'front')
    await addPhoto(variant, 'back')

    const card = await cardFor(variant)

    assert.equal(card.image, '/uploads/front-640.webp')
    assert.equal(card.hoverImage, '/uploads/back-640.webp')
  })

  test('a photo without a 640 px file falls back to the one it has', async ({ assert }) => {
    const variant = await createVariant(await createShop())
    await addPhoto(variant, 'old', false)

    const card = await cardFor(variant)

    assert.equal(card.image, '/uploads/old-1600.webp')
  })

  test('cart lines and order lines', async ({ assert }) => {
    const variant = await createVariant(await createShop())
    await addPhoto(variant, 'front')
    const buyer = guestOwner()
    await fillCart(buyer, [{ variant, quantity: 1 }])
    const cart = new CartService()

    const [item] = await cart.items(buyer)
    assert.equal(cart.line(item).product.image, '/uploads/front-640.webp')

    const { orderNumbers } = await new CheckoutService().placeOrders(buyer, {
      address: addressPayload(),
    })
    const order = await new OrderService()
      .detailQuery()
      .where('order_number', orderNumbers[0])
      .firstOrFail()
    const [line] = new OrderTransformer(order).toObject().items
    assert.equal(line.image, '/uploads/front-640.webp')
  })

  test("the home page's category tiles", async ({ assert }) => {
    const variant = await createVariant(await createShop())
    await addPhoto(variant, 'front')
    const product = await Product.findOrFail(variant.productId)

    const tiles = await new CatalogService().homeCategories(50)

    const tile = tiles.find((category) => category.image?.startsWith('/uploads/front-'))
    assert.exists(tile, `no tile uses this product's photo (category ${product.categoryId})`)
    assert.equal(tile!.image, '/uploads/front-640.webp')
  })
})
