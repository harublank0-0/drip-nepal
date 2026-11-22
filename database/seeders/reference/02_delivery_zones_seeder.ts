import { BaseSeeder } from '@adonisjs/lucid/seeders'

/*
 * The two delivery zones of docs/04 §21.5 (A-27), upserted by `code`
 * (docs/04a §9.4, docs/09 §8.8). `name_ne` is left alone: it is filled for
 * the R2 Nepali UI. Zones are never deleted.
 *
 * Then the district mapping (docs/04a §9.5): Kathmandu, Bhaktapur and
 * Lalitpur in `ktm_valley`, every other district in `outside_valley`. It
 * needs the districts, so it runs after the locations seeder (01). A
 * district in the wrong zone is moved back, which changes fees for future
 * quotes only (docs/04a §9.5). Last, the seeder asserts that the active
 * districts are the 77 of the locations dataset and each has exactly one
 * zone (T-SHOP-108); otherwise it throws and the release step fails.
 */
export const DELIVERY_ZONES = [
  { code: 'ktm_valley', nameEn: 'Kathmandu Valley' },
  { code: 'outside_valley', nameEn: 'Outside Kathmandu Valley' },
] as const

// Kathmandu, Bhaktapur, Lalitpur (docs/04 §21.5).
export const VALLEY_DISTRICTS = ['306', '307', '308'] as const

const EXPECTED_DISTRICTS = 77

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

      await trx.rawQuery(
        `INSERT INTO delivery_zone_districts (zone_code, district_code)
         SELECT CASE WHEN d.code IN (SELECT jsonb_array_elements_text(?::jsonb))
                     THEN 'ktm_valley' ELSE 'outside_valley' END,
                d.code
           FROM districts d
         ON CONFLICT (district_code) DO UPDATE
            SET zone_code = EXCLUDED.zone_code
          WHERE delivery_zone_districts.zone_code IS DISTINCT FROM EXCLUDED.zone_code`,
        [JSON.stringify(VALLEY_DISTRICTS)]
      )

      const result = await trx.rawQuery(
        `SELECT count(*)::int AS active,
                count(*) FILTER (WHERE z.zones <> 1)::int AS unzoned,
                count(*) FILTER (WHERE z.valley)::int AS valley
           FROM districts d
           LEFT JOIN LATERAL (
                SELECT count(*) AS zones, bool_or(zone_code = 'ktm_valley') AS valley
                  FROM delivery_zone_districts WHERE district_code = d.code) z ON true
          WHERE d.is_active`
      )
      const { active, unzoned, valley } = result.rows[0]
      if (active !== EXPECTED_DISTRICTS) {
        throw new Error(
          `delivery zones: ${active} active districts, expected ${EXPECTED_DISTRICTS} (run the locations seeder first)`
        )
      }
      if (unzoned !== 0 || valley !== VALLEY_DISTRICTS.length) {
        throw new Error(
          `delivery zones: ${unzoned} district(s) without exactly one zone, ${valley} in ktm_valley`
        )
      }
    })
  }
}
