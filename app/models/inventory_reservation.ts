import { InventoryReservationSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import ProductVariant from './product_variant.js'
import InventoryItem from './inventory_item.js'

/*
 * docs/04a §8.2 (inventory). The order and order item it holds stock for
 * belong to `orders`, a higher module (docs/09 §2.2), so this model does not
 * relate to them; `OrderItem.inventoryReservations` reads the other way.
 */
export default class InventoryReservation extends InventoryReservationSchema {
  @belongsTo(() => InventoryItem, { foreignKey: 'variantId' })
  declare inventoryItem: BelongsTo<typeof InventoryItem>

  @belongsTo(() => ProductVariant, { foreignKey: 'variantId' })
  declare variant: BelongsTo<typeof ProductVariant>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>
}
