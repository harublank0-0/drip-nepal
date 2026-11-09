import { OrderSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import District from './district.js'
import IdempotencyKey from './idempotency_key.js'
import ShopOrder from './shop_order.js'
import OrderItem from './order_item.js'
import OrderEvent from './order_event.js'
import ReturnRequest from './return_request.js'

/*
 * docs/04a §11.1 (orders). Relations point downward only (docs/09 §2.2,
 * §3.10): to identity, logistics and platform models and to the orders
 * module's own tables; `User` does not relate back. `shipping_address` is a
 * snapshot read through the module's typed parser (docs/04 §2.11), never a
 * reference to `user_addresses`.
 */
export default class Order extends OrderSchema {
  @belongsTo(() => User, { foreignKey: 'customerUserId' })
  declare customer: BelongsTo<typeof User>

  @belongsTo(() => District, { foreignKey: 'shippingDistrictCode', localKey: 'code' })
  declare shippingDistrict: BelongsTo<typeof District>

  @belongsTo(() => IdempotencyKey)
  declare idempotencyKey: BelongsTo<typeof IdempotencyKey>

  @hasMany(() => ShopOrder)
  declare shopOrders: HasMany<typeof ShopOrder>

  @hasMany(() => OrderItem)
  declare items: HasMany<typeof OrderItem>

  @hasMany(() => OrderEvent)
  declare events: HasMany<typeof OrderEvent>

  @hasMany(() => ReturnRequest)
  declare returnRequests: HasMany<typeof ReturnRequest>
}
