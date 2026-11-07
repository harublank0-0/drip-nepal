import { ShopAgreementSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/* docs/04a §6.4 (shops). Append-only (docs/04 §2.12): inserted, never saved again. */
export default class ShopAgreement extends ShopAgreementSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'acceptedByUserId' })
  declare acceptedByUser: BelongsTo<typeof User>
}
