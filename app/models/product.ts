import { ProductSchema } from '#database/schema'
import { belongsTo, hasMany, hasOne, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasOne, ManyToMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'
import MediaAsset from './media_asset.js'
import Category from './category.js'
import Brand from './brand.js'
import Attribute from './attribute.js'
import AttributeValue from './attribute_value.js'
import ProductVariant from './product_variant.js'
import ProductReviewDecision from './product_review_decision.js'
import ProductListing from './product_listing.js'

/*
 * docs/04a §7.6 (catalog). Relations point downward only (docs/09 §2.2,
 * §3.10): to shops, media and identity models and to the catalog's own
 * tables; `Shop` and `MediaAsset` do not relate back.
 *
 * The composite-key tables (docs/04 §2.15) have no model of their own: they
 * are read through the `manyToMany` relations below and written with the
 * query builder in the owning action's transaction.
 */
export default class Product extends ProductSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @belongsTo(() => Brand)
  declare brand: BelongsTo<typeof Brand>

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare createdByUser: BelongsTo<typeof User>

  // docs/04a §7.9
  @hasMany(() => ProductVariant)
  declare variants: HasMany<typeof ProductVariant>

  // docs/04a §7.11, append-only (docs/04 §2.12)
  @hasMany(() => ProductReviewDecision)
  declare reviewDecisions: HasMany<typeof ProductReviewDecision>

  // docs/04a §7.12: no row while the product is not visible
  @hasOne(() => ProductListing)
  declare listing: HasOne<typeof ProductListing>

  // docs/04a §7.7
  @manyToMany(() => AttributeValue, {
    pivotTable: 'product_attribute_values',
    pivotForeignKey: 'product_id',
    pivotRelatedForeignKey: 'attribute_value_id',
    pivotColumns: ['shop_id', 'attribute_id'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare attributeValues: ManyToMany<typeof AttributeValue>

  // docs/04a §7.8
  @manyToMany(() => Attribute, {
    pivotTable: 'product_option_axes',
    pivotForeignKey: 'product_id',
    pivotRelatedForeignKey: 'attribute_id',
    pivotColumns: ['position'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare optionAxes: ManyToMany<typeof Attribute>

  // docs/04a §7.14 (module media)
  @manyToMany(() => MediaAsset, {
    pivotTable: 'product_media',
    pivotForeignKey: 'product_id',
    pivotRelatedForeignKey: 'media_asset_id',
    pivotColumns: ['shop_id', 'media_kind', 'color_value_id', 'position', 'alt_text'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare media: ManyToMany<typeof MediaAsset>
}
