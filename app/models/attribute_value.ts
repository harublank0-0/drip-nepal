import { AttributeValueSchema } from '#database/schema'
import { belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import Attribute from './attribute.js'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import ProductVariant from './product_variant.js'

export default class AttributeValue extends AttributeValueSchema {
  @belongsTo(() => Attribute)
  declare attribute: BelongsTo<typeof Attribute>

  @manyToMany(() => ProductVariant, {
    pivotTable: 'product_variant_attribute_values',
  })
  declare variants: ManyToMany<typeof ProductVariant>
}
