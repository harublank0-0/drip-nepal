import { ShopSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import User from './user.ts'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'
import ShopStaffRole from './shop_staff_role.ts'
import Product from './product.ts'
import OrderItem from './order_item.ts'

export default class Shop extends ShopSchema {
  @belongsTo(() => User)
  declare owner: BelongsTo<typeof User>

  @hasMany(() => ShopRole)
  declare roles: HasMany<typeof ShopRole>

  @hasMany(() => ShopStaffRole)
  declare staffRoles: HasMany<typeof ShopStaffRole>

  @hasMany(() => Product)
  declare products: HasMany<typeof Product>

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>
}
