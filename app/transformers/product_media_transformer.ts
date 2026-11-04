import type ProductMedia from '#models/product_media'
import { BaseTransformer } from '@adonisjs/core/transformers'

export default class ProductMediaTransformer extends BaseTransformer<ProductMedia> {
  toObject() {
    return this.pick(this.resource, [
      'id',
      'url',
      'thumbnailUrl',
      'altText',
      'sortOrder',
      'variantId',
    ])
  }
}
