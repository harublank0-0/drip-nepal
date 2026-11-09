import { MediaAssetSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'

/*
 * docs/04a §7.13 (media). `derived_keys` is read through a typed parser
 * (docs/04 §2.11).
 */
export default class MediaAsset extends MediaAssetSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'uploadedBy' })
  declare uploadedByUser: BelongsTo<typeof User>
}
