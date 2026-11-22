import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ATTRIBUTES, seedAttributes } from '#database/seeders/reference/05_attributes_seeder'
import PlatformSettingsSeeder from '#database/seeders/reference/08_platform_settings_seeder'
import { MIGRATOR_CONNECTION, runReferenceSeeders } from '#tests/support/database'

/*
 * T-ARCH-018 (docs/10 §6.2, docs/09 §8.8): `db:seed` twice gives identical
 * row counts. The run setup has seeded once (docs/10 §3.2); the test seeds
 * again, through `db:seed` as the migrator with the reference files, and
 * compares every reference table: the number of rows, and a digest of
 * their full contents, so an upsert that rewrote a row (even only its
 * `updated_at`) fails too. A second run changes nothing (AC-FR-CAT-001-1).
 *
 * The second run commits, which is harmless only because it writes
 * nothing. It runs in the functional suite, before the concurrency suite
 * commits rows of its own (adonisrc.ts suite order).
 */

// The tables the reference seeders write, with the row count docs/04 §21 gives.
const SEEDED: Record<string, number> = {
  provinces: 7, // §21.4
  districts: 77, // §21.4
  local_levels: 753, // §21.4
  delivery_zones: 2, // §21.5
  delivery_zone_districts: 77, // §21.5: every district in exactly one zone
  shop_categories: 13, // §20.3
  categories: 50, // §21.1: 6 top-level, 2 groups, 42 leaves
  attributes: 8, // §21.2, without the R2 `kids_age`
  attribute_values: 85, // §21.2
  category_attributes: 36, // §21.3, one row per category named
  brands: 0, // §20.3: the launch vendors' list, not supplied yet
  platform_settings: 15, // docs/04a §15.1, with `platform_account_cod_enabled` (OD-58)
  logistics_providers: 1, // §21.6
}

// Fixed table names from SEEDED, never input.
async function snapshot() {
  const tables: Record<string, { rows: number; digest: string }> = {}
  for (const table of Object.keys(SEEDED)) {
    const result = await db.rawQuery(
      `SELECT count(*)::int AS rows,
              md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest
         FROM ${table} t`
    )
    tables[table] = result.rows[0]
  }
  return tables
}

test.group('T-ARCH-018 reference seeders are idempotent', () => {
  test('T-ARCH-018 db:seed twice gives identical rows in every reference table', async ({
    assert,
  }) => {
    const first = await snapshot()
    for (const [table, rows] of Object.entries(SEEDED)) {
      assert.equal(first[table].rows, rows, `${table} after the first run`)
    }

    await runReferenceSeeders()

    assert.deepEqual(await snapshot(), first)
  })

  test('T-ARCH-018 a second run keeps a setting an operator changed and restores a missing key', async ({
    assert,
  }) => {
    // As the migrator, in a transaction that is rolled back: the seeder
    // runs on the transaction, so it sees the edits (docs/09 §8.8).
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    try {
      await trx.rawQuery(
        `UPDATE platform_settings SET value = 'false'::jsonb WHERE key = 'checkout_enabled'`
      )
      await trx.rawQuery(`DELETE FROM platform_settings WHERE key = 'maintenance_banner'`)

      await new PlatformSettingsSeeder(trx).run()

      const result = await trx.rawQuery(
        `SELECT key, value FROM platform_settings
          WHERE key IN ('checkout_enabled', 'maintenance_banner') ORDER BY key`
      )
      assert.deepEqual(result.rows, [
        { key: 'checkout_enabled', value: false },
        { key: 'maintenance_banner', value: '' },
      ])
    } finally {
      await trx.rollback()
    }
  })

  test('T-ARCH-018 a value retired with active: false is deactivated once and then left alone', async ({
    assert,
  }) => {
    // A reviewed seeder change retires `printed` (docs/04a §7.3: deactivated,
    // never deleted); seeding twice must give the same rows.
    const retired = ATTRIBUTES.map((attribute) => ({
      ...attribute,
      values: attribute.values.map((value) =>
        attribute.code === 'color' && value.code === 'printed'
          ? { ...value, active: false as const }
          : value
      ),
    }))
    const rows = `SELECT md5(string_agg(v::text, '|' ORDER BY v::text)) AS digest,
                         count(*) FILTER (WHERE NOT is_active)::int AS inactive
                    FROM attribute_values v`
    const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
    const valuesNow = async () => {
      const result = await trx.rawQuery(rows)
      return result.rows[0]
    }
    try {
      await seedAttributes(trx, retired)
      const first = await valuesNow()
      assert.equal(first.inactive, 1)
      await seedAttributes(trx, retired)
      const second = await valuesNow()
      assert.deepEqual(second, first)
    } finally {
      await trx.rollback()
    }
  })
})
