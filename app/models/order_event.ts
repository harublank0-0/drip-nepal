import { OrderEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Order from './order.js'
import ShopOrder from './shop_order.js'
import User from './user.js'

/*
 * docs/04a §11.4 (orders). Append-only (docs/04 §2.12): rows are inserted,
 * never saved again or deleted.
 */
export default class OrderEvent extends OrderEventSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => ShopOrder)
  declare shopOrder: BelongsTo<typeof ShopOrder>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
