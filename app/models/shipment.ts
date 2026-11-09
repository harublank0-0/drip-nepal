import { ShipmentSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import ShopOrder from './shop_order.js'
import Shop from './shop.js'
import LogisticsAccount from './logistics_account.js'
import ShopAddress from './shop_address.js'
import ShipmentEvent from './shipment_event.js'
import OrderItem from './order_item.js'

/*
 * docs/04a §11.5 (orders; OD-56). `LogisticsAccount` and `ShopAddress` sit
 * lower (docs/09 §2.2) and do not relate back. `shipment_items` (§11.9) is
 * a composite-key table (docs/04 §2.15) with no model of its own: it is read
 * through `items` and written with the query builder in the owning action.
 */
export default class Shipment extends ShipmentSchema {
  @belongsTo(() => ShopOrder)
  declare shopOrder: BelongsTo<typeof ShopOrder>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  // null in the manual path
  @belongsTo(() => LogisticsAccount)
  declare logisticsAccount: BelongsTo<typeof LogisticsAccount>

  @belongsTo(() => ShopAddress, { foreignKey: 'pickupAddressId' })
  declare pickupAddress: BelongsTo<typeof ShopAddress>

  @hasMany(() => ShipmentEvent)
  declare events: HasMany<typeof ShipmentEvent>

  // docs/04a §11.9
  @manyToMany(() => OrderItem, {
    pivotTable: 'shipment_items',
    pivotForeignKey: 'shipment_id',
    pivotRelatedForeignKey: 'order_item_id',
    pivotColumns: ['shop_order_id', 'quantity'],
    pivotTimestamps: { createdAt: 'created_at', updatedAt: false },
  })
  declare items: ManyToMany<typeof OrderItem>
}
