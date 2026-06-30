import { OrderSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import User from './user.js'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import UserAddress from './user_address.js'
import OrderItem from './order_item.js'
import Payment from './payment.js'

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
