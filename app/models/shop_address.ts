import { ShopAddressSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import Shop from './shop.ts'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ShopAddress extends ShopAddressSchema {
  @belongsTo(() => Shop)
  declare shop: BelongsTo<typeof Shop>
}
