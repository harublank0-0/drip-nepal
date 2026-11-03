import { ProductMediaSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import ProductVariant from './product_variant.js'

export default class ProductMedia extends ProductMediaSchema {
  /*
   * "media" is already plural; Lucid would otherwise look for "product_medias".
   */
  static table = 'product_media'

  @belongsTo(() => Product)
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => ProductVariant)
  declare productVariant: BelongsTo<typeof ProductVariant>
}
