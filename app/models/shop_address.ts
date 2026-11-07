import { ShopAddressSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import Province from './province.js'
import District from './district.js'
import LocalLevel from './local_level.js'

/*
 * docs/04a §6.6 (shops). `postal_code` is a generated column: code never
 * assigns it.
 */
export default class ShopAddress extends ShopAddressSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => Province, { foreignKey: 'provinceCode', localKey: 'code' })
  declare province: BelongsTo<typeof Province>

  @belongsTo(() => District, { foreignKey: 'districtCode', localKey: 'code' })
  declare district: BelongsTo<typeof District>

  @belongsTo(() => LocalLevel, { foreignKey: 'localLevelCode', localKey: 'code' })
  declare localLevel: BelongsTo<typeof LocalLevel>
}
