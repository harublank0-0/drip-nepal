import { ProductReviewDecisionSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Shop from './shop.js'
import User from './user.js'
import Product from './product.js'

/* docs/04a §7.11 (catalog). Append-only (docs/04 §2.12): inserted, never saved again. */
export default class ProductReviewDecision extends ProductReviewDecisionSchema {
  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>

  @belongsTo(() => User, { foreignKey: 'decidedBy' })
  declare decidedByUser: BelongsTo<typeof User>
}
