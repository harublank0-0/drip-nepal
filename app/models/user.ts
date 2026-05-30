import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Role from './role.ts'
import ShopStaffRole from './shop_staff_role.ts'
import UserAddress from './user_address.ts'
import Cart from './cart.ts'
import Order from './order.ts'

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }

  @hasMany(() => Shop)
  declare shops: HasMany<typeof Shop>

  @manyToMany(() => Role, {
    pivotTable: 'user_roles',
  })
  declare roles: ManyToMany<typeof Role>

  @hasMany(() => ShopStaffRole)
  declare shopStaffRoles: HasMany<typeof ShopStaffRole>

  @hasMany(() => UserAddress)
  declare addresses: HasMany<typeof UserAddress>

  @hasMany(() => Cart)
  declare carts: HasMany<typeof Cart>

  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>
}
