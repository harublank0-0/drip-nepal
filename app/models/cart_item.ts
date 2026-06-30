import { CartItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Cart from './cart.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ProductVariant from './product_variant.js'

export default class CartItem extends CartItemSchema {
  @belongsTo(() => Cart)
  declare cart: BelongsTo<typeof Cart>

  @belongsTo(() => ProductVariant)
  declare productVariant: BelongsTo<typeof ProductVariant>
}
