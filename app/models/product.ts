import { ProductSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Category from './category.ts'
import ProductVariant from './product_variant.ts'
import ProductMedia from './product_media.ts'
import OrderItem from './order_item.ts'

export default class Product extends ProductSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @hasMany(() => ProductVariant)
  declare variants: HasMany<typeof ProductVariant>

  @hasMany(() => ProductMedia)
  declare media: HasMany<typeof ProductMedia>

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>
}
