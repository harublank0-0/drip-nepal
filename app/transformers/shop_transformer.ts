import type Shop from '#models/shop'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ShopTransformer extends BaseTransformer<Shop> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'name',
      'banner',
      'description',
      'email',
      'logo',
      'ownerId',
      'phone',
      'slug',
      'status',
      'createdAt',
      'verifiedAt',
    ])
  }
}
