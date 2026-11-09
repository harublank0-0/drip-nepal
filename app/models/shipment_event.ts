import { ShipmentEventSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shipment from './shipment.js'
import Shop from './shop.js'
import User from './user.js'

/*
 * docs/04a §11.6 (orders). Append-only (docs/04 §2.12). A courier update is
 * inserted with `ON CONFLICT DO NOTHING` on
 * `shipment_events_provider_event_key`, so a repeat adds no row.
 */
export default class ShipmentEvent extends ShipmentEventSchema {
  @belongsTo(() => Shipment)
  declare shipment: BelongsTo<typeof Shipment>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
