import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import Category from '#models/category'
import Product from '#models/product'
import ProductVariant from '#models/product_variant'
import type Shop from '#models/shop'
import CheckoutService from '#modules/orders/services/checkout_service'
import ProductService from '#modules/products/services/product_service'
import type { ProductPayload } from '#modules/shops/validators/product'
import { ProductGender, ProductStatus, VariantStatus } from '#constants/product'
import {
  addressPayload,
  createShop,
  createVariant,
  fillCart,
  guestOwner,
} from '#tests/support/fixtures'

/*
 * Stock in the product form of the v1 store. The form can be open for
 * minutes while customers buy, so it sends, for each existing variant, the
 * stock it showed (`expectedQuantity`). A quantity the seller didn't touch
 * is never written, and a changed one is saved only if the stock is still
 * what the form showed; otherwise the seller sees the new number and
 * confirms. This is the stocktake rule of docs/05 §5.9 (`expected_on_hand`)
 * applied to the v1 form.
 */

async function productWithStock(quantity: number) {
  const shop = await createShop()
  const variant = await createVariant(shop, { price: 1000, quantity })
  const product = await Product.findOrFail(variant.productId)
  return { shop, variant, product }
}

async function sell(variant: ProductVariant, quantity: number) {
  const buyer = guestOwner()
  await fillCart(buyer, [{ variant, quantity }])
  await new CheckoutService().placeOrders(buyer, { address: addressPayload() })
}

async function formSave(
  shop: Shop,
  product: Product,
  variant: ProductVariant,
  stock: { quantity: number; expectedQuantity?: number },
  name = product.name
) {
  const category = await Category.findOrFail(product.categoryId)
  const payload = {
    name,
    categoryId: category.id,
    gender: ProductGender.UNISEX,
    status: ProductStatus.ACTIVE,
    variants: [{ id: variant.id, sku: variant.sku, price: 1000, ...stock }],
    keepMediaIds: [],
  } as ProductPayload
  return new ProductService().update(shop, product, payload)
}

async function stockOf(variant: ProductVariant) {
  const fresh = await ProductVariant.findOrFail(variant.id)
  return fresh.quantity
}

function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error) => error
  )
}

test.group('Product form stock [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('saving without touching the stock keeps the sales made while the form was open', async ({
    assert,
  }) => {
    const { shop, variant, product } = await productWithStock(5)
    await sell(variant, 2)

    await formSave(shop, product, variant, { quantity: 5, expectedQuantity: 5 }, 'Renamed Kurta')

    assert.equal(await stockOf(variant), 3)
    const fresh = await Product.findOrFail(product.id)
    assert.equal(fresh.name, 'Renamed Kurta')
  })

  test('a stock change made on a stale screen is refused with the current stock', async ({
    assert,
  }) => {
    const { shop, variant, product } = await productWithStock(5)
    const originalName = product.name
    await sell(variant, 2)

    const error = await refusal(
      formSave(shop, product, variant, { quantity: 8, expectedQuantity: 5 }, 'Renamed Kurta')
    )

    assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
    assert.equal(error.messages[0].field, 'variants.0.expectedQuantity')
    assert.match(error.messages[0].message, /\b3\b/)
    assert.equal(await stockOf(variant), 3)
    const fresh = await Product.findOrFail(product.id)
    assert.equal(fresh.name, originalName, 'nothing of the refused save is kept')
  })

  test('once the form shows the current stock, the new number is saved', async ({ assert }) => {
    const { shop, variant, product } = await productWithStock(5)
    await sell(variant, 2)

    await formSave(shop, product, variant, { quantity: 8, expectedQuantity: 3 })

    assert.equal(await stockOf(variant), 8)
  })

  test('an existing variant saved without the stock its form showed is refused', async ({
    assert,
  }) => {
    const { shop, variant, product } = await productWithStock(5)

    const error = await refusal(formSave(shop, product, variant, { quantity: 9 }))

    assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
    assert.equal(error.messages[0].field, 'variants.0.expectedQuantity')
    assert.equal(await stockOf(variant), 5)
  })

  test('a variant removed in another tab is refused with a reload message', async ({ assert }) => {
    const { shop, variant, product } = await productWithStock(5)
    // What saving the form without this variant (in another tab) leaves.
    await ProductVariant.query().where('id', variant.id).update({ status: VariantStatus.ARCHIVED })

    const error = await refusal(
      formSave(shop, product, variant, { quantity: 8, expectedQuantity: 5 })
    )

    assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
    assert.equal(error.messages[0].field, 'variants.0.id')
    assert.match(error.messages[0].message, /removed while you were editing/)
    const fresh = await ProductVariant.findOrFail(variant.id)
    assert.equal(fresh.status, VariantStatus.ARCHIVED)
    assert.equal(fresh.quantity, 5)
  })

  test('a new variant gets the stock the form gives it', async ({ assert }) => {
    const { shop, product, variant } = await productWithStock(5)
    const category = await Category.findOrFail(product.categoryId)

    await new ProductService().update(shop, product, {
      name: product.name,
      categoryId: category.id,
      gender: ProductGender.UNISEX,
      status: ProductStatus.ACTIVE,
      variants: [
        { id: variant.id, sku: variant.sku, price: 1000, quantity: 5, expectedQuantity: 5 },
        { size: 'XL', price: 1200, quantity: 7 },
      ],
      keepMediaIds: [],
    } as ProductPayload)

    const added = await ProductVariant.query()
      .where('product_id', product.id)
      .whereNot('id', variant.id)
      .firstOrFail()
    assert.equal(added.quantity, 7)
  })
})
