import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { hasMany, hasOne } from '@adonisjs/lucid/orm'
import type { HasMany, HasOne } from '@adonisjs/lucid/types/relations'
import type { LucidModel } from '@adonisjs/lucid/types/model'
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
  /*
   * The lookup of `verifyCredentials` (docs/07 §3.6): an anonymised
   * account, or one without a password hash, is not found, so its login
   * takes the unknown-email path, which hashes the submitted password once
   * and answers the same 401. Without this, `verifyPassword` would throw a
   * RuntimeException on the null hash, which the handler reports as a 500
   * that also shows the account existed.
   */
  // Typed over any Lucid model: the mixin's own class type is not exported.
  static findForAuth<T extends LucidModel>(
    this: T,
    uids: string[],
    value: string
  ): Promise<InstanceType<T> | null> {
    return this.query()
      .where((query) => {
        for (const uid of uids) query.orWhere(uid, value)
      })
      .whereNot('status', 'anonymized')
      .whereNotNull('password_hash')
      .first()
  }

  @hasMany(() => UserAddress)
  declare addresses: HasMany<typeof UserAddress>

  @hasMany(() => UserToken)
  declare tokens: HasMany<typeof UserToken>

  @hasOne(() => PlatformStaff)
  declare platformStaff: HasOne<typeof PlatformStaff>
}
