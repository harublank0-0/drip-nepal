import { BaseSeeder } from '@adonisjs/lucid/seeders'
import type { BrandStatus } from '#modules/catalog/domain/brand_status'

/*
 * Brands, upserted by `slug` (docs/04 §3.10, §20.3, docs/04a §7.5, docs/09
 * §8.8). In R1 a new brand is requested through a support case and added
 * here, in a reviewed change. The list starts with the launch vendors' own
 * brands (docs/04 §20.3), which nobody has supplied yet, so it is empty
 * until then; the brand rules of OD-21 block M3 code (risks §5). Never
 * deletes.
 */

type BrandRow = { slug: string; name: string; status: BrandStatus; requiresModeration: boolean }

export const BRANDS: BrandRow[] = []

export default class BrandsSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      for (const brand of BRANDS) {
        await trx.rawQuery(
          `INSERT INTO brands (slug, name, status, requires_moderation)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (slug) DO UPDATE
              SET name = EXCLUDED.name, status = EXCLUDED.status,
                  requires_moderation = EXCLUDED.requires_moderation
            WHERE (brands.name, brands.status, brands.requires_moderation)
                  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.status, EXCLUDED.requires_moderation)`,
          [brand.slug, brand.name, brand.status, brand.requiresModeration]
        )
      }
    })
  }
}
