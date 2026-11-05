import type { CartSummary } from '#modules/orders/services/cart_service'
import { BaseTransformer } from '@adonisjs/core/transformers'

/*
 * Passes the cart summary through unchanged. It exists so the frontend
 * gets the type as `Data.CartSummary`. Amounts are paisa (`*Minor`).
 */
export default class CartSummaryTransformer extends BaseTransformer<CartSummary> {
  toObject() {
    return this.pick(this.resource, [
      'shops',
      'itemCount',
      'subtotalMinor',
      'shippingTotalMinor',
      'totalMinor',
      'hasUnavailableItems',
    ])
  }
}
