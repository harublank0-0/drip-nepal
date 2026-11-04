import type Order from '#models/order'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { smallPhotoUrl } from '#modules/products/photo_urls'

type ShippingAddress = {
  recipientName: string
  recipientPhone: string | null
  province: string
  district: string
  municipality: string | null
  city: string
  area: string | null
  streetAddress: string
}

/*
 * An order with its items, for the customer's and the shop's order pages.
 * Expects `items.product.media` and `shop` preloaded; `user` for the shop
 * view.
 */
export default class OrderTransformer extends BaseTransformer<Order> {
  toObject() {
    const order = this.resource

    return {
      ...this.pick(order, [
        'id',
        'orderNumber',
        'checkoutId',
        'status',
        'paymentStatus',
        'notes',
        'placedAt',
        'createdAt',
      ]),
      subtotal: Number(order.subtotal),
      shippingTotal: Number(order.shippingTotal),
      discountTotal: Number(order.discountTotal),
      grandTotal: Number(order.grandTotal),
      paymentMethod: 'Cash on delivery',
      shippingAddress: (order.shippingAddress ?? null) as ShippingAddress | null,
      shop: order.shop ? { name: order.shop.name, slug: order.shop.slug } : null,
      customer: order.user
        ? { fullName: order.user.fullName, email: order.user.email, phone: order.user.phone }
        : null,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        name: item.productNameSnapshot,
        variantLabel: item.productVariantSnapshot,
        sku: item.skuSnapshot,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        subTotal: Number(item.subTotal),
        productSlug: item.product?.slug ?? null,
        image: smallPhotoUrl(item.product?.media?.[0]),
      })),
      itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    }
  }
}
