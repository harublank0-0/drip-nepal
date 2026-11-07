import { UserAddressSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import Province from './province.js'
import District from './district.js'
import LocalLevel from './local_level.js'

/*
 * docs/04a §5.5 (identity). `postal_code` is a generated column: code never
 * assigns it.
 */
export default class UserAddress extends UserAddressSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Province, { foreignKey: 'provinceCode', localKey: 'code' })
  declare province: BelongsTo<typeof Province>

  @belongsTo(() => District, { foreignKey: 'districtCode', localKey: 'code' })
  declare district: BelongsTo<typeof District>

  @belongsTo(() => LocalLevel, { foreignKey: 'localLevelCode', localKey: 'code' })
  declare localLevel: BelongsTo<typeof LocalLevel>
}
