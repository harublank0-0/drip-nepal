import type Product from '#models/product'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { smallPhotoUrl } from '#modules/products/photo_urls'

/*
 * The compact product shape used by product cards and grids. Expects
 * `media`, `variants` (active only), `shop` and `category` preloaded.
 */
export default class ProductCardTransformer extends BaseTransformer<Product> {
  toObject() {
    const media = this.resource.media ?? []
    const variants = this.resource.variants ?? []
    const cheapest = variants.reduce<(typeof variants)[number] | null>(
      (min, variant) => (!min || Number(variant.price) < Number(min.price) ? variant : min),
      null
    )

    return {
      ...this.pick(this.resource, ['id', 'name', 'slug', 'brand', 'gender']),
      image: smallPhotoUrl(media[0]),
      hoverImage: smallPhotoUrl(media[1]),
      price: cheapest ? Number(cheapest.price) : 0,
      comparePrice: cheapest?.comparePrice ? Number(cheapest.comparePrice) : null,
      inStock: variants.some((variant) => variant.quantity > 0),
      shop: this.resource.shop
        ? { name: this.resource.shop.name, slug: this.resource.shop.slug }
        : null,
      category: this.resource.category
        ? { name: this.resource.category.name, slug: this.resource.category.slug }
        : null,
    }
  }
}
