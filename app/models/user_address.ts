import { UserAddressSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import User from './user.ts'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Order from './order.ts'

export default class UserAddress extends UserAddressSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Order)
  declare orders: HasMany<typeof Order>
}
