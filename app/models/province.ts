import { ProvinceSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import District from './district.js'

/* docs/04a §9.1 (logistics) */
export default class Province extends ProvinceSchema {
  @hasMany(() => District, { foreignKey: 'provinceCode', localKey: 'code' })
  declare districts: HasMany<typeof District>
}
