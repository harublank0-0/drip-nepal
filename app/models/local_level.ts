import { LocalLevelSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import District from './district.js'

/* docs/04a §9.3 (logistics) */
export default class LocalLevel extends LocalLevelSchema {
  @belongsTo(() => District, { foreignKey: 'districtCode', localKey: 'code' })
  declare district: BelongsTo<typeof District>
}
