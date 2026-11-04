import type Shop from '#models/shop'
import { BaseTransformer } from '@adonisjs/core/transformers'

/*
 * A shop as shown on the storefront. `productCount` comes from
 * `withCount('products')` when the query loaded it.
 */
export default class StoreCardTransformer extends BaseTransformer<Shop> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'name', 'slug', 'description', 'logo', 'banner']),
      productCount: Number(this.resource.$extras.products_count ?? 0),
    }
  }
}
