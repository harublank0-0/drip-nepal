import { NotificationDeliverySchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Shop from './shop.js'

/*
 * docs/04a §14.3 (notifications). `notifications` may read any module and
 * nothing imports it (docs/09 §2.2), so it relates down to its recipients
 * and nothing relates back.
 */
export default class NotificationDelivery extends NotificationDeliverySchema {
  @belongsTo(() => User, { foreignKey: 'recipientUserId' })
  declare recipient: BelongsTo<typeof User>

  // a shop's contact address as recipient
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>
}
