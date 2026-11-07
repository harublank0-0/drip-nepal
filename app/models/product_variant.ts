import { ProductVariantSchema } from '#database/schema'
import { belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import Product from './product.js'
import AttributeValue from './attribute_value.js'

/*
 * docs/04a §7.9 (catalog). Stock is in `inventory_items` (§8.1), a higher
 * module, so it has no relation here.
 */
export default class ProductVariant extends ProductVariantSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  // docs/04a §7.10, a composite-key table (docs/04 §2.15)
  @manyToMany(() => AttributeValue, {
    pivotTable: 'variant_option_values',
    pivotForeignKey: 'variant_id',
    pivotRelatedForeignKey: 'attribute_value_id',
    pivotColumns: ['product_id', 'attribute_id'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare optionValues: ManyToMany<typeof AttributeValue>
}
