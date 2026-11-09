import { ShopMembershipSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/* docs/04a §6.2 (shops). The owner is never a membership row (ADR-0006). */
export default class ShopMembership extends ShopMembershipSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'invitedBy' })
  declare invitedByUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'removedBy' })
  declare removedByUser: BelongsTo<typeof User>
}
