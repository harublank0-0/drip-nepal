import { ShopRoleSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import Permission from './permission.js'
import ShopStaffAssignment from './shop_staff_assignment.js'

export default class ShopRole extends ShopRoleSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @manyToMany(() => Permission)
  declare permissions: ManyToMany<typeof Permission>

  @hasMany(() => ShopStaffAssignment)
  declare staffRoles: HasMany<typeof ShopStaffAssignment>
}
