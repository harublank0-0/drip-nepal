import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { errors as vineErrors } from '@vinejs/vine'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import CartItem from '#models/cart_item'
import Order from '#models/order'
import OrderItem from '#models/order_item'
import Payment from '#models/payment'
import ProductVariant from '#models/product_variant'
import UserAddress from '#models/user_address'
import type User from '#models/user'
import { randomCode } from '#utils/random'
import { OrderStatus, PaymentProvider, PaymentStatus, shippingFeeFor } from '#constants/order'
import CartService, { isPurchasable } from '#modules/orders/services/cart_service'
import type { AddressPayload, CheckoutPayload } from '#modules/orders/validators/checkout'

/*
 * Who is checking out: a logged-in user, or a guest with the cart token
 * from their session.
 */
export type Buyer = { user: User } | { guestToken: string }

type AddressFields = {
  recipientName: string
  recipientPhone: string | null
  province: string
  district: string
  municipality?: string | null
  city: string
  area?: string | null
  streetAddress: string
}

function checkoutError(field: string, message: string): never {
  throw new vineErrors.E_VALIDATION_ERROR([{ field, message, rule: 'checkout' }])
}

export function addressSnapshot(address: AddressFields) {
  return {
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    province: address.province,
    district: address.district,
    municipality: address.municipality ?? null,
    city: address.city,
    area: address.area ?? null,
    streetAddress: address.streetAddress,
  }
}

export default class CheckoutService {
  constructor(protected cart = new CartService()) {}

  /*
   * Turns the cart into one cash-on-delivery order per shop. Stock is
   * re-checked under a row lock so two buyers can't take the last item.
   * Returns the checkout id that groups the orders, and their numbers.
   */
  async placeOrders(buyer: Buyer, payload: CheckoutPayload) {
    const user = 'user' in buyer ? buyer.user : null
    const owner = 'user' in buyer ? { userId: buyer.user.id } : { guestToken: buyer.guestToken }

    return db.transaction(async (trx) => {
      const items = await this.cart.items(owner, trx)
      if (items.length === 0) {
        checkoutError('cart', 'Your cart is empty')
      }

      const lockedVariants = await ProductVariant.query({ client: trx })
        .whereIn(
          'id',
          items.map((item) => item.productVariantId)
        )
        .forUpdate()
      const stockById = new Map(lockedVariants.map((variant) => [variant.id, variant]))

      for (const item of items) {
        const locked = stockById.get(item.productVariantId)
        const name = item.productVariant.product.name
        if (!locked || !isPurchasable(item.productVariant)) {
          checkoutError('cart', `${name} is no longer available. Remove it to continue.`)
        }
        if (locked.quantity < item.quantity) {
          checkoutError(
            'cart',
            locked.quantity === 0
              ? `${name} just sold out. Remove it to continue.`
              : `Only ${locked.quantity} of ${name} left. Lower the quantity to continue.`
          )
        }
      }

      const { snapshot, savedAddressId } = await this.#resolveAddress(user, payload, trx)
      const checkoutId = randomUUID()
      const orderNumbers: string[] = []
      const summary = this.cart.summarize(items)

      for (const group of summary.shops) {
        const shopItems = items.filter(
          (item) => item.productVariant.product.shopId === group.shop.id
        )
        const subtotal = shopItems.reduce(
          (sum, item) => sum + Number(item.productVariant.price) * item.quantity,
          0
        )
        const shipping = shippingFeeFor(subtotal)
        const grandTotal = subtotal + shipping

        const order = await Order.create(
          {
            userId: user?.id ?? null,
            shopId: group.shop.id,
            checkoutId,
            userAddressId: savedAddressId,
            shippingAddress: snapshot,
            orderNumber: this.#orderNumber(),
            status: OrderStatus.PENDING,
            paymentStatus: PaymentStatus.PENDING,
            subtotal: subtotal.toFixed(2),
            discountTotal: '0.00',
            shippingTotal: shipping.toFixed(2),
            grandTotal: grandTotal.toFixed(2),
            notes: payload.notes ?? null,
            placedAt: DateTime.now(),
          },
          { client: trx }
        )
        orderNumbers.push(order.orderNumber)

        for (const item of shopItems) {
          const variant = item.productVariant
          const line = this.cart.line(item)
          await OrderItem.create(
            {
              orderId: order.id,
              shopId: group.shop.id,
              productId: variant.productId,
              productVariantId: variant.id,
              productNameSnapshot: variant.product.name.slice(0, 100),
              productVariantSnapshot: line.variant.label ? line.variant.label.slice(0, 100) : null,
              skuSnapshot: variant.sku,
              unitPrice: Number(variant.price).toFixed(2),
              quantity: item.quantity,
              subTotal: (Number(variant.price) * item.quantity).toFixed(2),
            },
            { client: trx }
          )

          await ProductVariant.query({ client: trx })
            .where('id', variant.id)
            .decrement('quantity', item.quantity)
        }

        await Payment.create(
          {
            orderId: order.id,
            provider: PaymentProvider.CASH_ON_DELIVERY,
            status: PaymentStatus.PENDING,
            amount: grandTotal.toFixed(2),
          },
          { client: trx }
        )
      }

      await CartItem.query({ client: trx })
        .whereIn(
          'id',
          items.map((item) => item.id)
        )
        .delete()

      return { checkoutId, orderNumbers }
    })
  }

  /*
   * A saved address, or a new one: saved to a user's address book, or used
   * only for this order when a guest checks out.
   */
  async #resolveAddress(
    user: User | null,
    payload: CheckoutPayload,
    trx: TransactionClientContract
  ) {
    if (payload.addressId) {
      const address = user
        ? await UserAddress.query({ client: trx })
            .where('id', payload.addressId)
            .where('user_id', user.id)
            .first()
        : null
      if (!address) checkoutError('addressId', 'Choose one of your saved addresses')
      return { snapshot: addressSnapshot(address), savedAddressId: address.id }
    }

    if (!user) {
      return { snapshot: addressSnapshot(payload.address!), savedAddressId: null }
    }
    const address = await this.saveAddress(user, payload.address!, trx)
    return { snapshot: addressSnapshot(address), savedAddressId: address.id }
  }

  /*
   * Adds an address to the user's address book. The first one becomes
   * the default.
   */
  async saveAddress(user: User, address: AddressPayload, trx?: TransactionClientContract) {
    const hasDefault = await UserAddress.query({ client: trx })
      .where('user_id', user.id)
      .where('is_default', true)
      .first()

    return UserAddress.create(
      {
        userId: user.id,
        label: address.label ?? null,
        recipientName: address.recipientName,
        recipientPhone: address.recipientPhone,
        country: 'nepal',
        province: address.province,
        district: address.district,
        municipality: address.municipality ?? null,
        city: address.city,
        area: address.area ?? null,
        streetAddress: address.streetAddress,
        isDefault: !hasDefault,
      },
      { client: trx }
    )
  }

  /*
   * e.g. DN261103-7K2QX. Date for humans, random part for uniqueness.
   */
  #orderNumber() {
    return `DN${DateTime.now().toFormat('yyMMdd')}-${randomCode(5).toUpperCase()}`
  }
}
