import { CategorySchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Attribute from './attribute.js'

/*
 * docs/04a §7.1 (catalog), the garment-type tree. The attribute rules of
 * §7.4 (`category_attributes`, a composite-key table, docs/04 §2.15) are read
 * through `attributes` and written with the query builder by the reference
 * seeders.
 */
export default class Category extends CategorySchema {
  @belongsTo(() => Category, { foreignKey: 'parentId' })
  declare parent: BelongsTo<typeof Category>

  @hasMany(() => Category, { foreignKey: 'parentId' })
  declare children: HasMany<typeof Category>

  // docs/04a §7.4
  @manyToMany(() => Attribute, {
    pivotTable: 'category_attributes',
    pivotForeignKey: 'category_id',
    pivotRelatedForeignKey: 'attribute_id',
    pivotColumns: ['usage', 'is_required', 'position'],
  })
  declare attributes: ManyToMany<typeof Attribute>
}
