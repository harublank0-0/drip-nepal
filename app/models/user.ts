import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import UserAddress from './user_address.js'
import UserToken from './user_token.js'
import PlatformStaff from './platform_staff.js'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'passwordHash',
})

/*
 * docs/04a §5.1 (identity). Relations point downward only (docs/09 §3.10):
 * a user does not relate to shops, carts or orders.
 */
export default class User extends compose(UserSchema, AuthFinder) {
  @hasMany(() => UserAddress)
  declare addresses: HasMany<typeof UserAddress>

  @hasMany(() => UserToken)
  declare tokens: HasMany<typeof UserToken>

  @hasOne(() => PlatformStaff)
  declare platformStaff: HasOne<typeof PlatformStaff>
}
