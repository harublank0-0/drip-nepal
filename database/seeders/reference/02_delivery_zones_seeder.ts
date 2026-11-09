import { BaseSeeder } from '@adonisjs/lucid/seeders'

/*
 * The two delivery zones of docs/04 §21.5 (A-27), upserted by `code`
 * (docs/04a §9.4, docs/09 §8.8). `name_ne` is left alone: it is filled for
 * the R2 Nepali UI. Zones are never deleted.
 *
 * Not here yet: the `delivery_zone_districts` mapping (Kathmandu, Bhaktapur
 * and Lalitpur to `ktm_valley`, the other 74 districts to `outside_valley`)
 * and the assertion that all 77 districts map to exactly one zone. Both need
 * the districts, which come from the locations seeder (01, docs/04 §21.4);
 * they arrive with it (product owner decision, 2026-11-09, docs/04 §20.3).
 */
export const DELIVERY_ZONES = [
  { code: 'ktm_valley', nameEn: 'Kathmandu Valley' },
  { code: 'outside_valley', nameEn: 'Outside Kathmandu Valley' },
] as const

export default class DeliveryZonesSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      for (const [index, zone] of DELIVERY_ZONES.entries()) {
        await trx.rawQuery(
          `INSERT INTO delivery_zones (code, name_en, position, is_active)
           VALUES (?, ?, ?, true)
           ON CONFLICT (code) DO UPDATE
              SET name_en = EXCLUDED.name_en, position = EXCLUDED.position, is_active = true
            WHERE (delivery_zones.name_en, delivery_zones.position, delivery_zones.is_active)
                  IS DISTINCT FROM (EXCLUDED.name_en, EXCLUDED.position, true)`,
          [zone.code, zone.nameEn, index + 1]
        )
      }
    })
  }
}
