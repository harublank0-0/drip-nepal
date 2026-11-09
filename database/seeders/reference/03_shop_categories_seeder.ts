import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { ShopCategories } from '#shared/constants/shop_categories'

/*
 * The 13 shop categories of shared/constants/shop_categories.ts, upserted by
 * `code` (docs/04 §20.3, docs/04a §6.8). `beauty-and-personal-care` is seeded
 * inactive while DripNepal lists fashion only (docs/04 §21.1), so onboarding
 * does not offer it. `position` follows the order of the constant. Never
 * deletes.
 */
const INACTIVE = new Set(['beauty-and-personal-care'])

export default class ShopCategoriesSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      for (const [index, category] of ShopCategories.entries()) {
        await trx.rawQuery(
          `INSERT INTO shop_categories (code, label, description, icon, position, is_active)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (code) DO UPDATE
              SET label = EXCLUDED.label, description = EXCLUDED.description, icon = EXCLUDED.icon,
                  position = EXCLUDED.position, is_active = EXCLUDED.is_active
            WHERE (shop_categories.label, shop_categories.description, shop_categories.icon,
                   shop_categories.position, shop_categories.is_active)
                  IS DISTINCT FROM (EXCLUDED.label, EXCLUDED.description, EXCLUDED.icon,
                                    EXCLUDED.position, EXCLUDED.is_active)`,
          [
            category.id,
            category.label,
            category.description,
            category.icon,
            index + 1,
            !INACTIVE.has(category.id),
          ]
        )
      }
    })
  }
}
