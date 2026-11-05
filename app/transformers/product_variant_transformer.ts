import { VariantAttributes } from '#constants/product'
import type ProductVariant from '#models/product_variant'
import { BaseTransformer } from '@adonisjs/core/transformers'

/*
 * Flattens the variant's attribute values into `size` and `color`.
 * Preload `attributeValues.attribute` to get them; otherwise they're null.
 */
export default class ProductVariantTransformer extends BaseTransformer<ProductVariant> {
  #option(attributeSlug: string): string | null {
    const values = this.resource.attributeValues ?? []
    return values.find((value) => value.attribute?.slug === attributeSlug)?.value ?? null
  }

  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'productId', 'sku', 'quantity', 'status']),
      // Paisa (docs/04 §18.1).
      priceMinor: this.resource.priceMinor,
      comparePriceMinor: this.resource.comparePriceMinor,
      size: this.#option(VariantAttributes.SIZE.slug),
      color: this.#option(VariantAttributes.COLOR.slug),
    }
  }
}
