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
 * An order with its items. `toObject` is for the customer's pages,
 * including guest tracking, and carries no buyer account details: whoever
 * tracks a gift with the recipient's phone must not get the buyer's email
 * and phone (docs/07 §5). `forShop` adds the buyer's account for the
 * shop's pages. Expects `items.product.media` and `shop` preloaded, and
 * `user` for `forShop`.
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
      // Paisa (docs/04 §18.1).
      subtotalMinor: order.subtotalMinor,
      shippingTotalMinor: order.shippingTotalMinor,
      discountTotalMinor: order.discountTotalMinor,
      grandTotalMinor: order.grandTotalMinor,
      paymentMethod: 'Cash on delivery',
      shippingAddress: (order.shippingAddress ?? null) as ShippingAddress | null,
      shop: order.shop ? { name: order.shop.name, slug: order.shop.slug } : null,
      items: (order.items ?? []).map((item) => ({
        id: item.id,
        name: item.productNameSnapshot,
        variantLabel: item.productVariantSnapshot,
        sku: item.skuSnapshot,
        unitPriceMinor: item.unitPriceMinor,
        quantity: item.quantity,
        subTotalMinor: item.subTotalMinor,
        productSlug: item.product?.slug ?? null,
        image: smallPhotoUrl(item.product?.media?.[0]),
      })),
      itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    }
  }

  /*
   * The shop's view: the order plus the buyer's account, so the shop can
   * reach a customer who ordered for someone else.
   */
  forShop() {
    const user = this.resource.user
    return {
      ...this.toObject(),
      customer: user ? { fullName: user.fullName, email: user.email, phone: user.phone } : null,
    }
  }
}
