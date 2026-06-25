import { ShopSchema } from '#database/schema'
import { belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import User from './user.ts'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'
import ShopAddress from './shop_address.ts'
import Product from './product.ts'
import OrderItem from './order_item.ts'
import ShopStaffAssignment from './shop_staff_assignment.ts'

export default class Shop extends ShopSchema {
  @belongsTo(() => User, {
    foreignKey: 'ownerId',
  })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => ShopRole)
  declare roles: HasMany<typeof ShopRole>

  @hasMany(() => ShopStaffAssignment)
  declare staffRoles: HasMany<typeof ShopStaffAssignment>

  @hasMany(() => ShopAddress)
  declare addresses: HasMany<typeof ShopAddress>

  @hasMany(() => Product)
  declare products: HasMany<typeof Product>

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>
}
