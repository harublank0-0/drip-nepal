import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { hasMany, manyToMany } from '@adonisjs/lucid/orm'
import Shop from './shop.js'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import UserAddress from './user_address.js'
import Cart from './cart.js'
import Order from './order.js'
import GlobalRole from './global_role.js'
import ShopStaffAssignment from './shop_staff_assignment.js'
import { GlobalRoles } from '#constants/global_roles'

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

  @hasMany(() => Shop, {
    foreignKey: 'ownerId',
  })
  declare shops: HasMany<typeof Shop>

  @manyToMany(() => GlobalRole, {
    pivotTable: 'global_user_roles',
    pivotForeignKey: 'user_id',
    pivotRelatedForeignKey: 'global_role_id',
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

  /*
   * Platform admins approve shops. Granted with `node ace admin:grant <email>`.
   */
  async isAdmin() {
    const user: User = this
    const role = await user.related('roles').query().where('slug', GlobalRoles.ADMIN.slug).first()
    return role !== null
  }

  isEmailVerified() {
    return this.emailVerifiedAt !== null
  }

  isPhoneVerified() {
    return this.phoneVerifiedAt !== null
  }
}
