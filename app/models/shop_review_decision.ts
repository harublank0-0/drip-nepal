import { ShopReviewDecisionSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/* docs/04a §6.5 (shops). Append-only (docs/04 §2.12): inserted, never saved again. */
export default class ShopReviewDecision extends ShopReviewDecisionSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'decidedBy' })
  declare decidedByUser: BelongsTo<typeof User>
}
