import { ShopInvitationSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/* docs/04a §6.3 (shops). `token_hash` is Secret and never serialises. */
export default class ShopInvitation extends ShopInvitationSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'invitedBy' })
  declare invitedByUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'acceptedByUserId' })
  declare acceptedByUser: BelongsTo<typeof User>
}
