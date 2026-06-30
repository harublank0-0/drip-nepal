import { ProductSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import Shop from './shop.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Category from './category.js'
import ProductVariant from './product_variant.js'
import ProductMedia from './product_media.js'
import OrderItem from './order_item.js'

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
