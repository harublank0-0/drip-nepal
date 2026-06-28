import ShopCategory from '#models/shop_category'
import { ShopCategories } from '#shared/constants/shop_categories'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    await ShopCategory.updateOrCreateMany(
      'slug',
      ShopCategories.map((shopCategory) => ({
        id: shopCategory.id,
        description: shopCategory.description,
        label: shopCategory.label,
        slug: shopCategory.slug,
      }))
    )
  }
}
