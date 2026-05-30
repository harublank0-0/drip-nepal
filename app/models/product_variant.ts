import { ProductVariantSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Product from './product.ts'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import AttributeValue from './attribute_value.ts'
import ProductMedia from './product_media.ts'
import CartItem from './cart_item.ts'
import OrderItem from './order_item.ts'

export default class ProductVariant extends ProductVariantSchema {
  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @manyToMany(() => AttributeValue, {
    pivotTable: 'product_variant_attribute_values',
  })
  declare attributeValues: ManyToMany<typeof AttributeValue>

  @hasMany(() => ProductMedia)
  declare media: HasMany<typeof ProductMedia>

  @hasMany(() => CartItem)
  declare cartItems: HasMany<typeof CartItem>

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>
}
