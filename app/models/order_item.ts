import { OrderItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Order from './order.js'
import ShopOrder from './shop_order.js'
import Shop from './shop.js'
import Product from './product.js'
import ProductVariant from './product_variant.js'

/*
 * docs/04a §11.3 (orders). The `*_snapshot` columns are what receipts and
 * disputes read (docs/04 §2.13); the product and variant are kept for
 * navigation only, and `ProductVariant` does not relate back.
 */
export default class OrderItem extends OrderItemSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => ShopOrder)
  declare shopOrder: BelongsTo<typeof ShopOrder>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => ProductVariant, { foreignKey: 'variantId' })
  declare variant: BelongsTo<typeof ProductVariant>
}
