import type Shop from '#models/shop'
import { BaseTransformer } from '@adonisjs/core/transformers'

/*
 * A shop as anyone on the storefront may see it. Unlike ShopTransformer
 * (owners only), it leaves out the owner's user id, the contact email and
 * phone, and the status (RF-36).
 */
export default class PublicShopTransformer extends BaseTransformer<Shop> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'name',
      'slug',
      'description',
      'logo',
      'banner',
      'verifiedAt',
    ])
  }
}
