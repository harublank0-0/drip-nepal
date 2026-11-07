import { ShopPayoutAccountSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/* docs/04a §6.7 (shops) */
export default class ShopPayoutAccount extends ShopPayoutAccountSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare createdByUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'verifiedBy' })
  declare verifiedByUser: BelongsTo<typeof User>
}
