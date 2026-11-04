import { errors as vineErrors } from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Cart from '#models/cart'
import CartItem from '#models/cart_item'
import ProductVariant from '#models/product_variant'
import type User from '#models/user'
import type { CartOwner } from '#modules/orders/customer'
import { ShopStatus } from '#constants/shop_status'
import { ProductStatus, VariantAttributes, VariantStatus } from '#constants/product'
import { MAX_QUANTITY_PER_ITEM, shippingFeeFor } from '#constants/order'
import { smallPhotoUrl } from '#modules/products/photo_urls'

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
  async findCart(owner: CartOwner | null, trx?: TransactionClientContract) {
    if (!owner) return null

    const query = Cart.query({ client: trx })
    if ('userId' in owner) {
      query.where('user_id', owner.userId)
    } else {
      query.where('session_id', owner.guestToken).whereNull('user_id')
    }
    return query.orderBy('created_at', 'asc').first()
  }

  /*
   * Takes the shopper's cart lock for the rest of the transaction. Every
   * cart write and checkout takes it first, so two requests for one cart
   * (a double tap, two tabs) run one after the other and the second sees
   * what the first did: no second cart, no order placed twice. It is a
   * PostgreSQL advisory lock, so it works before the cart row exists, and
   * it is released at commit or rollback. Checkout takes it before any
   * variant lock, and nothing takes it after one, so it can't deadlock.
   */
  async lockOwner(owner: CartOwner, trx: TransactionClientContract) {
    const key = 'userId' in owner ? `cart:user:${owner.userId}` : `cart:guest:${owner.guestToken}`
    await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', [key])
  }

  async getOrCreateCart(owner: CartOwner, trx: TransactionClientContract) {
    return (
      (await this.findCart(owner, trx)) ??
      (await Cart.create(
        'userId' in owner ? { userId: owner.userId } : { sessionId: owner.guestToken },
        { client: trx }
      ))
    )
  }

  /*
   * Cart items with everything needed to show and price them.
   */
  async items(owner: CartOwner | null, trx?: TransactionClientContract) {
    const cart = await this.findCart(owner, trx)
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

  async count(owner: CartOwner | null) {
    const cart = await this.findCart(owner)
    if (!cart) return 0

    const result = await CartItem.query().where('cart_id', cart.id).sum('quantity as total').first()
    return Number(result?.$extras.total ?? 0)
  }

  /*
   * A guest who logs in keeps what they put in the cart: the guest cart
   * becomes theirs, or its items join the cart they already had (the same
   * item adds up, to the per-item maximum).
   */
  async adoptGuestCart(token: string, user: User) {
    await db.transaction(async (trx) => {
      await this.lockOwner({ userId: user.id }, trx)
      await this.lockOwner({ guestToken: token }, trx)
      const guestCart = await this.findCart({ guestToken: token }, trx)
      if (!guestCart) return

      const userCart = await this.findCart({ userId: user.id }, trx)
      if (!userCart) {
        guestCart.useTransaction(trx)
        guestCart.merge({ userId: user.id, sessionId: null })
        await guestCart.save()
        return
      }

      const guestItems = await CartItem.query({ client: trx }).where('cart_id', guestCart.id)
      for (const item of guestItems) {
        const existing = await CartItem.query({ client: trx })
          .where('cart_id', userCart.id)
          .where('product_variant_id', item.productVariantId)
          .first()
        if (existing) {
          existing.useTransaction(trx)
          existing.quantity = Math.min(existing.quantity + item.quantity, MAX_QUANTITY_PER_ITEM)
          await existing.save()
          await item.useTransaction(trx).delete()
        } else {
          item.useTransaction(trx)
          item.cartId = userCart.id
          await item.save()
        }
      }
      await guestCart.useTransaction(trx).delete()
    })
  }

  async add(owner: CartOwner, variantId: string, quantity: number) {
    return db.transaction(async (trx) => {
      await this.lockOwner(owner, trx)
      return this.#add(owner, variantId, quantity, trx)
    })
  }

  async #add(
    owner: CartOwner,
    variantId: string,
    quantity: number,
    trx: TransactionClientContract
  ) {
    const variant = await ProductVariant.query({ client: trx })
      .where('id', variantId)
      .preload('product', (product) => product.preload('shop'))
      .first()

    if (!variant || !isPurchasable(variant)) {
      fieldError('variantId', 'This item is no longer available')
    }

    const cart = await this.getOrCreateCart(owner, trx)
    const existing = await CartItem.query({ client: trx })
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

    return CartItem.create(
      { cartId: cart.id, productVariantId: variant.id, quantity },
      { client: trx }
    )
  }

  async update(owner: CartOwner | null, itemId: string, quantity: number) {
    await db.transaction(async (trx) => {
      const item = await this.#findItem(owner, itemId, trx)
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
    })
  }

  async remove(owner: CartOwner | null, itemId: string) {
    await db.transaction(async (trx) => {
      const item = await this.#findItem(owner, itemId, trx)
      await item.delete()
    })
  }

  /*
   * One of the shopper's cart items, under their cart lock.
   */
  async #findItem(owner: CartOwner | null, itemId: string, trx: TransactionClientContract) {
    if (owner) await this.lockOwner(owner, trx)
    const cart = await this.findCart(owner, trx)
    if (!cart) fieldError('item', 'This item is not in your cart')

    const item = await CartItem.query({ client: trx })
      .where('cart_id', cart.id)
      .where('id', itemId)
      .first()
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
        image: smallPhotoUrl(product.media?.[0]),
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
