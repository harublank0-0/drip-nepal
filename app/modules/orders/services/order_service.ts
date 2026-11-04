import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { errors as vineErrors } from '@vinejs/vine'
import Order from '#models/order'
import OrderItem from '#models/order_item'
import Payment from '#models/payment'
import ProductVariant from '#models/product_variant'
import type Shop from '#models/shop'
import type User from '#models/user'
import { ORDER_TRANSITIONS, OrderStatus, PaymentStatus } from '#constants/order'

function statusError(message: string): never {
  throw new vineErrors.E_VALIDATION_ERROR([{ field: 'status', message, rule: 'order' }])
}

export default class OrderService {
  /*
   * An order with everything the order pages show.
   */
  detailQuery() {
    return Order.query()
      .preload('shop')
      .preload('user')
      .preload('payments')
      .preload('items', (items) =>
        items
          .orderBy('created_at', 'asc')
          .preload('product', (product) =>
            product.preload('media', (media) => media.orderBy('sort_order', 'asc'))
          )
      )
  }

  /*
   * The order with this number placed with this phone (its last ten
   * digits, compared with the shipping address), or null.
   */
  async findByNumberAndPhone(orderNumber: string, digits: string) {
    if (digits.length < 10) return null
    return Order.query()
      .where('order_number', orderNumber)
      .whereRaw(
        `right(regexp_replace(shipping_address->>'recipientPhone', '[^0-9]', '', 'g'), 10) = ?`,
        [digits]
      )
      .first()
  }

  async findForCustomer(user: User, orderNumber: string) {
    return this.detailQuery()
      .where('user_id', user.id)
      .where('order_number', orderNumber)
      .firstOrFail()
  }

  async findForShop(shop: Shop, orderNumber: string) {
    return this.detailQuery()
      .where('shop_id', shop.id)
      .where('order_number', orderNumber)
      .firstOrFail()
  }

  /*
   * Moves an order along pending -> confirmed -> shipped -> delivered, or
   * cancels it. Cancelling puts the stock back; delivering records the cash
   * on delivery as paid.
   */
  async transition(order: Order, to: OrderStatus) {
    const allowed = ORDER_TRANSITIONS[order.status as OrderStatus] ?? []
    if (!allowed.includes(to)) {
      statusError(`An order that is ${order.status} can't be marked ${to}`)
    }

    await db.transaction(async (trx) => {
      const locked = await Order.query({ client: trx })
        .where('id', order.id)
        .forUpdate()
        .firstOrFail()
      if (locked.status !== order.status) {
        statusError('This order was just updated. Reload and try again.')
      }

      locked.status = to

      if (to === OrderStatus.CANCELLED) {
        const items = await OrderItem.query({ client: trx }).where('order_id', order.id)
        for (const item of items) {
          if (item.productVariantId) {
            await ProductVariant.query({ client: trx })
              .where('id', item.productVariantId)
              .increment('quantity', item.quantity)
          }
        }
        locked.paymentStatus = PaymentStatus.VOIDED
        await Payment.query({ client: trx })
          .where('order_id', order.id)
          .where('status', PaymentStatus.PENDING)
          .update({ status: PaymentStatus.VOIDED })
      }

      if (to === OrderStatus.DELIVERED) {
        locked.paymentStatus = PaymentStatus.PAID
        await Payment.query({ client: trx })
          .where('order_id', order.id)
          .where('status', PaymentStatus.PENDING)
          .update({ status: PaymentStatus.PAID, paid_at: DateTime.now().toSQL() })
      }

      await locked.save()
    })

    order.status = to
  }

  /*
   * Customers can cancel until the shop confirms.
   */
  async cancelByCustomer(order: Order) {
    if (order.status === OrderStatus.CANCELLED) {
      statusError('This order is already cancelled.')
    }
    if (order.status !== OrderStatus.PENDING) {
      statusError('This order has been confirmed by the shop. Contact them to cancel it.')
    }
    await this.transition(order, OrderStatus.CANCELLED)
  }
}
