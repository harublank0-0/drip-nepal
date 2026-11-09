import { InventoryMovementSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'
import ProductVariant from './product_variant.js'
import InventoryItem from './inventory_item.js'

/*
 * docs/04a §8.3 (inventory). Append-only (docs/04 §2.12): inserted, never
 * saved again. `reference_id` is polymorphic and has no relation.
 */
export default class InventoryMovement extends InventoryMovementSchema {
  @belongsTo(() => InventoryItem, { foreignKey: 'variantId' })
  declare inventoryItem: BelongsTo<typeof InventoryItem>

  @belongsTo(() => ProductVariant, { foreignKey: 'variantId' })
  declare variant: BelongsTo<typeof ProductVariant>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  // null for jobs
  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
