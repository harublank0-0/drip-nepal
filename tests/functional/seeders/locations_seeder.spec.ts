import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { readLocations, seedLocations } from '#database/seeders/reference/01_locations_seeder'
import DeliveryZonesSeeder, {
  VALLEY_DISTRICTS,
} from '#database/seeders/reference/02_delivery_zones_seeder'
import { MIGRATOR_CONNECTION } from '#tests/support/database'

/*
 * T-SHOP-117 and T-SHOP-108 (docs/10 §6.2) on the seeded test database:
 * the run setup has run every reference seeder (docs/10 §3.2). Writes run
 * as the migrator in a transaction that is rolled back, so the reference
 * rows stay as seeded for every other test.
 */

async function rows(sql: string) {
  const result = await db.rawQuery(sql)
  return result.rows
}

test.group('T-SHOP-117 the locations seeder', () => {
  test('T-SHOP-117 the seeded tables hold the dataset of docs/04 §21.4', async ({ assert }) => {
    const [counts] = await rows(
      `SELECT (SELECT count(*)::int FROM provinces) AS provinces,
              (SELECT count(*)::int FROM districts) AS districts,
              (SELECT count(*)::int FROM local_levels) AS local_levels,
              (SELECT sum(ward_count)::int FROM local_levels) AS wards,
              (SELECT count(*)::int FROM local_levels WHERE NOT is_active) AS inactive`
    )
    assert.deepEqual(counts, {
      provinces: 7,
      districts: 77,
      local_levels: 753,
      wards: 6743,
      inactive: 0,
    })
    const byType = await rows(
      `SELECT type, count(*)::int AS n FROM local_levels GROUP BY type ORDER BY type`
    )
    assert.deepEqual(byType, [
      { type: 'metropolitan', n: 6 },
      { type: 'municipality', n: 276 },
      { type: 'rural_municipality', n: 460 },
      { type: 'sub_metropolitan', n: 11 },
    ])
    const examples = await rows(
      `SELECT l.code, l.name_en, l.ward_count, d.name_en AS district, p.name_en AS province
         FROM local_levels l
         JOIN districts d ON d.code = l.district_code
         JOIN provinces p ON p.code = d.province_code
        WHERE l.code IN ('30608', '40504') ORDER BY l.code`
    )
    assert.deepEqual(examples, [
      {
        code: '30608',
        name_en: 'Kathmandu Metropolitan City',
        ward_count: 32,
        district: 'Kathmandu',
        province: 'Bagmati',
      },
      {
        code: '40504',
        name_en: 'Pokhara Metropolitan City',
        ward_count: 33,
        district: 'Kaski',
        province: 'Gandaki',
      },
    ])
  })

  test('T-SHOP-117 a second run restores a changed name and leaves is_active alone', async ({
    assert,
  }) => {
    const dataset = await readLocations()
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    try {
      await trx.rawQuery(`UPDATE local_levels SET name_en = 'Changed' WHERE code = '30608'`)
      await trx.rawQuery(`UPDATE districts SET name_ne = 'अन्यत्र' WHERE code = '306'`)
      // A code retired by a reviewed migration stays retired (docs/04a §9 "Changes").
      await trx.rawQuery(`UPDATE local_levels SET is_active = false WHERE code = '40504'`)

      await seedLocations(trx, dataset)

      const result = await trx.rawQuery(
        `SELECT l.code, l.name_en, l.is_active, d.name_ne AS district_ne
           FROM local_levels l JOIN districts d ON d.code = l.district_code
          WHERE l.code IN ('30608', '40504') ORDER BY l.code`
      )
      assert.deepEqual(result.rows, [
        {
          code: '30608',
          name_en: 'Kathmandu Metropolitan City',
          is_active: true,
          district_ne: 'काठमाडौँ',
        },
        {
          code: '40504',
          name_en: 'Pokhara Metropolitan City',
          is_active: false,
          district_ne: 'कास्की',
        },
      ])
    } finally {
      await trx.rollback()
    }
  })

  test('T-SHOP-117 a dataset that breaks a check is refused before anything is written', async ({
    assert,
  }) => {
    const dataset = await readLocations()
    const broken = dataset
      .filter((row) => row.code !== '10101')
      .map((row) => (row.code === '30608' ? { ...row, nameEn: 'Changed' } : row))
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    try {
      await assert.rejects(() => seedLocations(trx, broken), /752 local levels, expected 753/)
      const result = await trx.rawQuery(`SELECT name_en FROM local_levels WHERE code = '30608'`)
      assert.equal(result.rows[0].name_en, 'Kathmandu Metropolitan City')
    } finally {
      await trx.rollback()
    }
  })
})

test.group('T-SHOP-108 delivery zones of the districts', () => {
  test('T-SHOP-108 every active district has exactly one zone, and the valley is 306 to 308', async ({
    assert,
  }) => {
    const zoned = await rows(
      `SELECT d.code, count(z.zone_code)::int AS zones, min(z.zone_code) AS zone
         FROM districts d LEFT JOIN delivery_zone_districts z ON z.district_code = d.code
        WHERE d.is_active GROUP BY d.code ORDER BY d.code`
    )
    assert.lengthOf(zoned, 77)
    assert.deepEqual(
      zoned.filter((row: { zones: number }) => row.zones !== 1),
      []
    )
    assert.deepEqual(
      zoned
        .filter((row: { zone: string }) => row.zone === 'ktm_valley')
        .map((row: { code: string }) => row.code),
      [...VALLEY_DISTRICTS]
    )
    assert.lengthOf(
      zoned.filter((row: { zone: string }) => row.zone === 'outside_valley'),
      74
    )
  })

  test('T-SHOP-108 the seeder puts a moved district back in its zone', async ({ assert }) => {
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    try {
      await trx.rawQuery(
        `UPDATE delivery_zone_districts SET zone_code = 'ktm_valley' WHERE district_code = '405'`
      )
      await new DeliveryZonesSeeder(trx).run()
      const result = await trx.rawQuery(
        `SELECT zone_code FROM delivery_zone_districts WHERE district_code = '405'`
      )
      assert.deepEqual(result.rows, [{ zone_code: 'outside_valley' }])
    } finally {
      await trx.rollback()
    }
  })

  test('T-SHOP-108 the seeder refuses when the active districts are not the 77 of the dataset', async ({
    assert,
  }) => {
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    try {
      await trx.rawQuery(
        `INSERT INTO districts (code, province_code, name_en, name_ne)
         VALUES ('399', '3', 'Elsewhere', 'अन्यत्र')`
      )
      await assert.rejects(
        () => new DeliveryZonesSeeder(trx).run(),
        /78 active districts, expected 77/
      )
    } finally {
      await trx.rollback()
    }
  })
})
