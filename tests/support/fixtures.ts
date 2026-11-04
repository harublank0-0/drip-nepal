import { randomUUID } from 'node:crypto'
import Category from '#models/category'
import Product from '#models/product'
import ProductVariant from '#models/product_variant'
import Shop from '#models/shop'
import User from '#models/user'
import CartService from '#modules/orders/services/cart_service'
import type { CartOwner } from '#modules/orders/customer'
import type { AddressPayload } from '#modules/orders/validators/checkout'
import { ProductGender, ProductStatus, VariantStatus } from '#constants/product'
import { ShopStatus } from '#constants/shop_status'
import { UserStatus } from '#constants/user_status'

/*
 * Test data for the v1 store. Each call creates its own rows with unique
 * names, slugs and emails, so tests never depend on each other's data and
 * the concurrency suite can isolate by data instead of by rollback
 * (docs/10 §3.3). Reference data (categories, attributes) comes from the
 * reference seeders run by tests/support/database.ts.
 */

function unique(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

export async function createCustomer(fields: Partial<User> = {}) {
  return User.create({
    fullName: 'Test Customer',
    email: `${unique('customer')}@example.test`,
    status: UserStatus.ACTIVE,
    ...fields,
  })
}

export async function createShop(fields: Partial<Shop> = {}) {
  const owner = await createCustomer({ fullName: 'Shop Owner' })
  const name = unique('shop')
  return Shop.create({
    ownerId: owner.id,
    name,
    slug: name,
    status: ShopStatus.ACTIVE,
    ...fields,
  })
}

/*
 * A listed product with one variant. `price` is in rupees, as v1 stores it.
 */
export async function createVariant(
  shop: Shop,
  {
    price = 1000,
    quantity = 5,
    product: productFields = {},
    variant: variantFields = {},
  }: {
    price?: number
    quantity?: number
    product?: Partial<Product>
    variant?: Partial<ProductVariant>
  } = {}
) {
  const category = await Category.query().orderBy('slug', 'asc').firstOrFail()
  const name = unique('product')
  const product = await Product.create({
    shopId: shop.id,
    categoryId: category.id,
    name,
    slug: name,
    status: ProductStatus.ACTIVE,
    gender: ProductGender.UNISEX,
    ...productFields,
  })

  return ProductVariant.create({
    productId: product.id,
    sku: unique('SKU').toUpperCase(),
    price: price.toFixed(2),
    quantity,
    status: VariantStatus.ACTIVE,
    ...variantFields,
  })
}

/*
 * Puts items in a cart the way the storefront does, through CartService,
 * so the cart's own stock and availability checks apply.
 */
export async function fillCart(
  owner: CartOwner,
  lines: { variant: ProductVariant; quantity: number }[]
) {
  const cart = new CartService()
  for (const line of lines) {
    await cart.add(owner, line.variant.id, line.quantity)
  }
}

export function guestOwner(): { guestToken: string } {
  return { guestToken: randomUUID() }
}

export function addressPayload(fields: Partial<AddressPayload> = {}): AddressPayload {
  return {
    recipientName: 'Sita Sharma',
    recipientPhone: '9841234567',
    province: 'Bagmati',
    district: 'Kathmandu',
    city: 'Kathmandu',
    streetAddress: 'Thamel Marg 12',
    ...fields,
  }
}
