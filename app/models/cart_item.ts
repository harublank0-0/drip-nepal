import { CartItemSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Cart from './cart.js'
import ProductVariant from './product_variant.js'

/* docs/04a §10.2 (cart). A line's shop is its variant's shop; there is no `shop_id`. */
export default class CartItem extends CartItemSchema {
  @belongsTo(() => Cart)
  declare cart: BelongsTo<typeof Cart>

  @belongsTo(() => ProductVariant, { foreignKey: 'variantId' })
  declare variant: BelongsTo<typeof ProductVariant>
}
