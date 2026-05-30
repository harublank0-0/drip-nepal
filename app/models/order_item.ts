import { OrderItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Order from './order.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.ts'
import Product from './product.ts'
import ProductVariant from './product_variant.ts'

export default class OrderItem extends OrderItemSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => ProductVariant)
  declare productVariant: BelongsTo<typeof ProductVariant>
}
