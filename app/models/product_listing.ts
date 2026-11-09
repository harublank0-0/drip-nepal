import { ProductListingSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'

/*
 * docs/04a §7.12 (catalog), the derived read model keyed by `product_id`
 * (ADR-0014). Read-only for application code: `catalog.refresh_listing`
 * rewrites rows with the query builder. Storefront reads need no join, so the
 * only relation is back to the source product.
 */
export default class ProductListing extends ProductListingSchema {
  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>
}
