import type Shop from '#models/shop'
import { BaseTransformer } from '@adonisjs/core/transformers'

/*
 * A shop as the admin review list shows it. Expects `owner` and
 * `addresses` preloaded and `withCount('products')`.
 */
export default class AdminShopTransformer extends BaseTransformer<Shop> {
  toObject() {
    const shop = this.resource
    const address = (shop.addresses ?? []).find((row) => row.isDefault) ?? shop.addresses?.[0]

    return {
      ...this.pick(shop, [
        'id',
        'name',
        'slug',
        'description',
        'email',
        'phone',
        'status',
        'createdAt',
        'verifiedAt',
      ]),
      owner: shop.owner
        ? { fullName: shop.owner.fullName, email: shop.owner.email, phone: shop.owner.phone }
        : null,
      location: address ? [address.city, address.district, address.province].join(', ') : null,
      productCount: Number(shop.$extras.products_count ?? 0),
    }
  }
}
