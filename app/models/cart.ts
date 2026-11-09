import { CartSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from './user.js'
import CartItem from './cart_item.js'

/*
 * docs/04a §10.1 (cart). `guest_token_hash` is Secret and never serialises;
 * `User` does not relate back (docs/09 §3.10).
 */
export default class Cart extends CartSchema {
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => CartItem)
  declare items: HasMany<typeof CartItem>
}
