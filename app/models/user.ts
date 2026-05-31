import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import UserAddress from './user_address.ts'
import Cart from './cart.ts'
import Order from './order.ts'
import GlobalRole from './global_role.ts'
import ShopStaffAssignment from './shop_staff_assignment.ts'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(UserSchema, AuthFinder) {
  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }

  @hasMany(() => Shop)
  declare shops: HasMany<typeof Shop>

  @manyToMany(() => GlobalRole, {
    pivotTable: 'user_roles',
  })
  declare roles: ManyToMany<typeof GlobalRole>

  @hasMany(() => ShopStaffAssignment)
  declare shopStaffRoles: HasMany<typeof ShopStaffAssignment>

  @hasMany(() => UserAddress)
  declare addresses: HasMany<typeof UserAddress>

  @hasMany(() => Cart)
  declare carts: HasMany<typeof Cart>

  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>

  isVerified() {
    return this.emailVerifiedAt !== null
  }
}
