import { ShopCategorySchema } from '#database/schema'
import Shop from '#models/shop'
import { manyToMany } from '@adonisjs/lucid/orm'
import { type ManyToMany } from '@adonisjs/lucid/types/relations'

export default class ShopCategory extends ShopCategorySchema {
  @manyToMany(() => Shop, {
    pivotTable: 'shop_categories_shop',
  })
  declare shops: ManyToMany<typeof Shop>
}
