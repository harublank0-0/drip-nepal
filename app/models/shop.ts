import { ShopSchema } from '#database/schema'
import { belongsTo, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import User from './user.ts'
import type { BelongsTo, HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import ShopRole from './shop_role.ts'
import ShopAddress from './shop_address.ts'
import Product from './product.ts'
import OrderItem from './order_item.ts'
import ShopStaffAssignment from './shop_staff_assignment.ts'
import ShopCategory from '#models/shop_category'

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

  @manyToMany(() => ShopCategory, {
    pivotTable: 'shop_categories_shop',
  })
  declare shopCategories: ManyToMany<typeof ShopCategory>
}
