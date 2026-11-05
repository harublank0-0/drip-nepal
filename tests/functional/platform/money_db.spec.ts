import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { sumMinor, toMinor } from '#modules/platform/money'

/*
 * T-ARCH-013 for the v1 store (docs/04 §18.4): PostgreSQL bigints, which
 * hold money in paisa, arrive as safe numbers, never strings, and sums of
 * money stay bigints.
 */
test.group('T-ARCH-013 bigint money from PostgreSQL [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('the largest safe bigint reads back as a number', async ({ assert }) => {
    const { rows } = await db.rawQuery('select 9007199254740991::int8 as amount')
    assert.strictEqual(rows[0].amount, 9007199254740991)
  })

  test('a bigint beyond the safe range refuses to read', async ({ assert }) => {
    await assert.rejects(() => db.rawQuery('select 9007199254740992::int8 as amount'), /int8 value/)
  })

  test('sumMinor returns a number; a plain SUM of a bigint is a string', async ({ assert }) => {
    // Rolled back with the test's transaction.
    await db.rawQuery('create temporary table test_amounts (amount_minor bigint)')
    await db
      .table('test_amounts')
      .multiInsert([{ amount_minor: 195123 }, { amount_minor: 279433 }, { amount_minor: 25444 }])

    assert.strictEqual(await sumMinor(db.from('test_amounts'), 'amount_minor'), 500000)
    assert.strictEqual(
      await sumMinor(db.from('test_amounts').where('amount_minor', '<', 0), 'amount_minor'),
      0
    )

    const { rows } = await db.rawQuery(
      'select sum(amount_minor) as total from (values (1::int8), (2::int8)) as t(amount_minor)'
    )
    assert.strictEqual(rows[0].total, '3')
  })

  test('toMinor takes paisa only as safe integers', ({ assert }) => {
    assert.strictEqual(toMinor(129950), 129950)
    assert.strictEqual(toMinor('129950'), 129950)
    assert.strictEqual(toMinor(129950n), 129950)
    for (const bad of [1299.5, '1299.50', '9007199254740992', 2n ** 60n, null, undefined]) {
      assert.throws(() => toMinor(bad), RangeError)
    }
  })
})
