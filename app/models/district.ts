import { DistrictSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Province from './province.js'
import LocalLevel from './local_level.js'

/* docs/04a §9.2 (logistics) */
export default class District extends DistrictSchema {
  @belongsTo(() => Province, { foreignKey: 'provinceCode', localKey: 'code' })
  declare province: BelongsTo<typeof Province>

  @hasMany(() => LocalLevel, { foreignKey: 'districtCode', localKey: 'code' })
  declare localLevels: HasMany<typeof LocalLevel>
}
