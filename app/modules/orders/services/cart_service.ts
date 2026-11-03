import { errors as vineErrors } from '@vinejs/vine'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import ProductVariant from '#models/product_variant'
import type User from '#models/user'
import { ShopStatus } from '#constants/shop_status'
import { ProductStatus, VariantAttributes, VariantStatus } from '#constants/product'
import { MAX_QUANTITY_PER_ITEM, shippingFeeFor } from '#constants/order'

export type CartSummary = ReturnType<CartService['summarize']>

function fieldError(field: string, message: string): never {
  throw new vineErrors.E_VALIDATION_ERROR([{ field, message, rule: 'cart' }])
}

/*
 * Whether a variant can be bought right now: the variant, its product and
 * its shop are all live.
 */
export function isPurchasable(variant: ProductVariant) {
  const product = variant.product
  return (
    variant.status === VariantStatus.ACTIVE &&
    product?.status === ProductStatus.ACTIVE &&
    !product.deletedAt &&
    product.shop?.status === ShopStatus.ACTIVE &&
    !product.shop.deletedAt
  )
}

function optionLabel(variant: ProductVariant) {
  const values = variant.attributeValues ?? []
  const pick = (slug: string) => values.find((value) => value.attribute?.slug === slug)?.value
  return [pick(VariantAttributes.SIZE.slug), pick(VariantAttributes.COLOR.slug)]
    .filter(Boolean)
    .join(' / ')
}

export default class CartService {
  async findCart(user: User, trx?: TransactionClientContract) {
    return Cart.query({ client: trx })
      .where('user_id', user.id)
      .orderBy('created_at', 'asc')
      .first()
  }

  async getOrCreateCart(user: User) {
    return (await this.findCart(user)) ?? (await Cart.create({ userId: user.id }))
  }

  /*
   * Cart items with everything needed to show and price them.
   */
  async items(user: User, trx?: TransactionClientContract) {
    const cart = await this.findCart(user, trx)
    if (!cart) return []

    return CartItem.query({ client: trx })
      .where('cart_id', cart.id)
      .orderBy('created_at', 'asc')
      .preload('productVariant', (variant) =>
        variant
          .preload('attributeValues', (values) => values.preload('attribute'))
          .preload('product', (product) =>
            product.preload('shop').preload('media', (media) => media.orderBy('sort_order', 'asc'))
          )
      )
  }

  async count(user: User) {
    const cart = await this.findCart(user)
    if (!cart) return 0

    const result = await CartItem.query().where('cart_id', cart.id).sum('quantity as total').first()
    return Number(result?.$extras.total ?? 0)
  }

  async add(user: User, variantId: string, quantity: number) {
    const variant = await ProductVariant.query()
      .where('id', variantId)
      .preload('product', (product) => product.preload('shop'))
      .first()

    if (!variant || !isPurchasable(variant)) {
      fieldError('variantId', 'This item is no longer available')
    }

    const cart = await this.getOrCreateCart(user)
    const existing = await CartItem.query()
      .where('cart_id', cart.id)
      .where('product_variant_id', variant.id)
      .first()

    const nextQuantity = (existing?.quantity ?? 0) + quantity
    if (nextQuantity > variant.quantity) {
      fieldError(
        'quantity',
        variant.quantity === 0
          ? 'This item is out of stock'
          : `Only ${variant.quantity} left in stock${existing ? ` (${existing.quantity} already in your cart)` : ''}`
      )
    }
    if (nextQuantity > MAX_QUANTITY_PER_ITEM) {
      fieldError('quantity', `You can buy at most ${MAX_QUANTITY_PER_ITEM} of an item`)
    }

    if (existing) {
      existing.quantity = nextQuantity
      await existing.save()
      return existing
    }

    return CartItem.create({ cartId: cart.id, productVariantId: variant.id, quantity })
  }

  async update(user: User, itemId: string, quantity: number) {
    const item = await this.#findItem(user, itemId)
    if (quantity === 0) {
      await item.delete()
      return
    }

    await item.load('productVariant')
    const stock = item.productVariant.quantity
    if (quantity > stock) {
      fieldError(
        'quantity',
        stock === 0 ? 'This item is out of stock' : `Only ${stock} left in stock`
      )
    }

    item.quantity = Math.min(quantity, MAX_QUANTITY_PER_ITEM)
    await item.save()
  }

  async remove(user: User, itemId: string) {
    const item = await this.#findItem(user, itemId)
    await item.delete()
  }

  async #findItem(user: User, itemId: string) {
    const cart = await this.findCart(user)
    if (!cart) fieldError('item', 'This item is not in your cart')

    const item = await CartItem.query().where('cart_id', cart.id).where('id', itemId).first()
    if (!item) fieldError('item', 'This item is not in your cart')
    return item
  }

  /*
   * The cart grouped by shop, the way checkout splits it into orders.
   * Unavailable lines are listed but excluded from the totals.
   */
  summarize(items: CartItem[]) {
    const groups = new Map<
      string,
      {
        shop: { id: string; name: string; slug: string }
        items: ReturnType<CartService['line']>[]
        subtotal: number
        shipping: number
      }
    >()

    for (const item of items) {
      const shop = item.productVariant.product.shop
      if (!groups.has(shop.id)) {
        groups.set(shop.id, {
          shop: { id: shop.id, name: shop.name, slug: shop.slug },
          items: [],
          subtotal: 0,
          shipping: 0,
        })
      }

      const line = this.line(item)
      const group = groups.get(shop.id)!
      group.items.push(line)
      if (line.available) group.subtotal += line.lineTotal
    }

    const shops = [...groups.values()].map((group) => ({
      ...group,
      shipping: group.subtotal > 0 ? shippingFeeFor(group.subtotal) : 0,
    }))

    const subtotal = shops.reduce((sum, group) => sum + group.subtotal, 0)
    const shippingTotal = shops.reduce((sum, group) => sum + group.shipping, 0)

    return {
      shops,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      shippingTotal,
      total: subtotal + shippingTotal,
      hasUnavailableItems: shops.some((group) => group.items.some((line) => !line.available)),
    }
  }

  line(item: CartItem) {
    const variant = item.productVariant
    const product = variant.product
    const price = Number(variant.price)
    const purchasable = isPurchasable(variant)
    const inStock = variant.quantity >= item.quantity

    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        name: product.name,
        slug: product.slug,
        image: product.media?.[0]?.url ?? null,
      },
      variant: {
        id: variant.id,
        label: optionLabel(variant),
        price,
        comparePrice: variant.comparePrice ? Number(variant.comparePrice) : null,
        stock: variant.quantity,
      },
      lineTotal: price * item.quantity,
      available: purchasable && inStock,
      problem: !purchasable
        ? 'No longer available'
        : !inStock
          ? variant.quantity === 0
            ? 'Out of stock'
            : `Only ${variant.quantity} left`
          : null,
    }
  }
}
