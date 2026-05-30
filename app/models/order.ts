import { OrderSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import User from './user.ts'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import UserAddress from './user_address.ts'
import OrderItem from './order_item.ts'
import Payment from './payment.ts'

export default class Order extends OrderSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => UserAddress)
  declare address: BelongsTo<typeof UserAddress>

  @hasMany(() => OrderItem)
  declare items: HasMany<typeof OrderItem>

  @hasMany(() => Payment)
  declare payments: HasMany<typeof Payment>
}
