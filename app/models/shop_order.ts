import { ShopOrderSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Order from './order.js'
import Shop from './shop.js'
import OrderItem from './order_item.js'
import OrderEvent from './order_event.js'
import Shipment from './shipment.js'
import ReturnRequest from './return_request.js'

/*
 * docs/04a §11.2 (orders). `Shop` does not relate back (docs/09 §3.10).
 * `shipments` holds the live shipment and its cancelled bookings (§11.5).
 */
export default class ShopOrder extends ShopOrderSchema {
  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @hasMany(() => OrderItem)
  declare items: HasMany<typeof OrderItem>

  @hasMany(() => OrderEvent)
  declare events: HasMany<typeof OrderEvent>

  @hasMany(() => Shipment)
  declare shipments: HasMany<typeof Shipment>

  @hasMany(() => ReturnRequest)
  declare returnRequests: HasMany<typeof ReturnRequest>
}
