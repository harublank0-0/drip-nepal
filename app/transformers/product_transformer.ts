import type Product from '#models/product'
import { BaseTransformer } from '@adonisjs/core/transformers'
import CategoryTransformer from '#transformers/category_transformer'
import ShopTransformer from '#transformers/shop_transformer'
import ProductVariantTransformer from '#transformers/product_variant_transformer'
import ProductMediaTransformer from '#transformers/product_media_transformer'

export default class ProductTransformer extends BaseTransformer<Product> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'shopId',
        'categoryId',
        'name',
        'slug',
        'description',
        'gender',
        'brand',
        'status',
        'isFeatured',
        'createdAt',
        'updatedAt',
      ]),
      category: CategoryTransformer.transform(this.whenLoaded(this.resource.category)),
      shop: ShopTransformer.transform(this.whenLoaded(this.resource.shop)),
      variants: ProductVariantTransformer.transform(this.whenLoaded(this.resource.variants)),
      media: ProductMediaTransformer.transform(this.whenLoaded(this.resource.media)),
    }
  }
}
