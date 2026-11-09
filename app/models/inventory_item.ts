import { InventoryItemSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import ProductVariant from './product_variant.js'
import InventoryReservation from './inventory_reservation.js'
import InventoryMovement from './inventory_movement.js'

/*
 * docs/04a §8.1 (inventory). Keyed by `variant_id`, a 1:1 extension of the
 * variant (docs/04 §2.1); `ProductVariant` sits lower (docs/09 §2.2) and
 * does not relate back.
 */
export default class InventoryItem extends InventoryItemSchema {
  @belongsTo(() => ProductVariant, { foreignKey: 'variantId' })
  declare variant: BelongsTo<typeof ProductVariant>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @hasMany(() => InventoryReservation, { foreignKey: 'variantId' })
  declare reservations: HasMany<typeof InventoryReservation>

  @hasMany(() => InventoryMovement, { foreignKey: 'variantId' })
  declare movements: HasMany<typeof InventoryMovement>
}
