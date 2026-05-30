import { ShopRoleSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Shop from './shop.ts'
import Permission from './permission.ts'
import ShopStaffRole from './shop_staff_role.ts'

export default class ShopRole extends ShopRoleSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @manyToMany(() => Permission)
  declare permissions: ManyToMany<typeof Permission>

  @hasMany(() => ShopStaffRole)
  declare staffRoles: HasMany<typeof ShopStaffRole>
}
