import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { MIGRATOR_CONNECTION } from '#tests/support/database'

/*
 * T-ARCH-014, the schema half: the INV-06 schema lint of docs/04 §16.3, run
 * against the migrated database (ADR-0007, docs/04 §2.3). No inexact numeric
 * type anywhere in `public`; every money column (`*_minor`, `*_minor_*`) is
 * bigint; and every table with a money column carries `currency` with its
 * `<table>_currency_check` (docs/04 §16.2 INV-06, ADR-0007 "every `*_minor`
 * has a currency").
 *
 * The queries run as the migrator, which owns every table:
 * `information_schema.columns` lists only the columns the current role holds
 * a privilege on, so as `dripnepal_app` a table without a grant would drop
 * out of the lint unseen.
 */

const owner = () => db.connection(MIGRATOR_CONNECTION)

type Column = { table_name: string; column_name: string; data_type: string }

test.group('T-ARCH-014 money columns', () => {
  test('T-ARCH-014 no numeric, real, double precision or money column exists', async ({
    assert,
  }) => {
    const { rows } = await owner().rawQuery(`
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND data_type IN ('numeric', 'real', 'double precision', 'money')
    `)
    assert.deepEqual(rows as Column[], [])
  })

  test('T-ARCH-014 every money column is bigint', async ({ assert }) => {
    const { rows } = await owner().rawQuery(String.raw`
      SELECT table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name LIKE '%\_minor%' AND data_type <> 'bigint'
    `)
    assert.deepEqual(rows as Column[], [])

    const { rows: money } = await owner().rawQuery(String.raw`
      SELECT count(*) AS columns FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name LIKE '%\_minor%'
    `)
    assert.isAbove(money[0].columns, 0, 'the lint finds the money columns')
  })

  test('T-ARCH-014 every table with a money column has currency and its NPR CHECK', async ({
    assert,
  }) => {
    const { rows } = await owner().rawQuery(String.raw`
      SELECT DISTINCT money.table_name AS table,
             currency.data_type AS currency_type,
             currency.character_maximum_length AS currency_length,
             pg_get_constraintdef(con.oid) AS currency_check
        FROM information_schema.columns money
        JOIN information_schema.tables t
          ON t.table_schema = money.table_schema AND t.table_name = money.table_name
         AND t.table_type = 'BASE TABLE'
        LEFT JOIN information_schema.columns currency
          ON currency.table_schema = money.table_schema AND currency.table_name = money.table_name
         AND currency.column_name = 'currency'
        LEFT JOIN pg_constraint con
          ON con.conrelid = format('public.%I', money.table_name)::regclass
         AND con.conname = money.table_name || '_currency_check'
       WHERE money.table_schema = 'public' AND money.column_name LIKE '%\_minor%'
       ORDER BY 1
    `)
    const tables = rows as {
      table: string
      currency_type: string
      currency_length: number
      currency_check: string
    }[]
    assert.isNotEmpty(tables)
    for (const row of tables) {
      assert.equal(row.currency_type, 'character', `${row.table}.currency is char(3)`)
      assert.equal(row.currency_length, 3, `${row.table}.currency is char(3)`)
      assert.equal(
        row.currency_check,
        "CHECK ((currency = 'NPR'::bpchar))",
        `${row.table}_currency_check`
      )
    }
  })
})
