import { ReturnRequestSchema } from '#database/schema'
import { belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'
import Order from './order.js'
import ShopOrder from './shop_order.js'
import Shop from './shop.js'
import User from './user.js'
import PlatformStaff from './platform_staff.js'
import OrderItem from './order_item.js'

/*
 * docs/04a §11.7 (orders). The linked support case (`support_case_id`) is a
 * `support_cases` row (§14.1), created by a later baseline file, so it has
 * no relation here. `return_items` (§11.8) is a composite-key table
 * (docs/04 §2.15) with no model of its own: it is read through `items` and
 * written with the query builder in the owning action.
 */
export default class ReturnRequest extends ReturnRequestSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => ShopOrder)
  declare shopOrder: BelongsTo<typeof ShopOrder>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'requestedByUserId' })
  declare requestedBy: BelongsTo<typeof User>

  @belongsTo(() => PlatformStaff, { foreignKey: 'createdByStaffId' })
  declare createdByStaff: BelongsTo<typeof PlatformStaff>

  // docs/04a §11.8
  @manyToMany(() => OrderItem, {
    pivotTable: 'return_items',
    pivotForeignKey: 'return_request_id',
    pivotRelatedForeignKey: 'order_item_id',
    pivotColumns: ['shop_order_id', 'quantity', 'condition_note', 'restock_quantity'],
    pivotTimestamps: true,
  })
  declare items: ManyToMany<typeof OrderItem>
}
