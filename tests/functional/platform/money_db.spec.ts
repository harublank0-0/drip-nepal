import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { sumMinor, toMinor } from '#modules/platform/money'

/*
 * T-ARCH-013 (docs/04 §18.4, ADR-0007): PostgreSQL bigints, which hold money
 * in paisa, arrive through the int8 parser of start/database_types.ts as safe
 * numbers, never strings; a value beyond Number.MAX_SAFE_INTEGER refuses to
 * read; sums of money go through `sumMinor`. The rupee parsing and eSewa
 * cases are unit tests (tests/unit/money/money_format.spec.ts), and the
 * limiter smoke test commits, so it is in the concurrency suite
 * (tests/concurrency/platform/limiter.spec.ts).
 */

// A bigint column of a temporary table, dropped with the test's transaction.
async function amounts(...values: number[]) {
  await db.rawQuery('CREATE TEMPORARY TABLE test_amounts (amount_minor bigint) ON COMMIT DROP')
  if (values.length > 0) {
    await db.table('test_amounts').multiInsert(values.map((value) => ({ amount_minor: value })))
  }
}

test.group('T-ARCH-013 bigint money from PostgreSQL', () => {
  test('T-ARCH-013 9007199254740991 in a bigint column reads back as that number', async ({
    assert,
  }) => {
    await amounts(Number.MAX_SAFE_INTEGER)
    const row = await db.from('test_amounts').select('amount_minor').firstOrFail()
    assert.strictEqual(row.amount_minor, 9007199254740991)
  })

  test('T-ARCH-013 9007199254740992 in a bigint column raises RangeError on read', async ({
    assert,
  }) => {
    await amounts()
    // Written as SQL text: the number 2^53 has no exact JavaScript form to send.
    await db.rawQuery('INSERT INTO test_amounts (amount_minor) VALUES (9007199254740992)')
    const error = await db
      .from('test_amounts')
      .select('amount_minor')
      .then(
        () => null,
        (e: unknown) => e
      )
    assert.instanceOf(error, RangeError)
    assert.match((error as RangeError).message, /int8 value 9007199254740992/)
  })

  test('T-ARCH-013 sumMinor returns a number; a raw SUM of a bigint is a string', async ({
    assert,
  }) => {
    await amounts(195123, 279433, 25444)

    assert.strictEqual(await sumMinor(db.from('test_amounts'), 'amount_minor'), 500000)
    assert.strictEqual(
      await sumMinor(db.from('test_amounts').where('amount_minor', '<', 0), 'amount_minor'),
      0
    )

    // Why the helper exists: SUM(bigint) is numeric, which has no parser.
    const { rows } = await db.rawQuery('SELECT SUM(amount_minor) AS total FROM test_amounts')
    assert.strictEqual(rows[0].total, '500000')
  })

  test('T-ARCH-013 sumMinor beyond the int8 range fails in PostgreSQL, not as a string', async ({
    assert,
  }) => {
    await amounts()
    await db.rawQuery(
      'INSERT INTO test_amounts (amount_minor) VALUES (9000000000000000000), (9000000000000000000)'
    )
    // docs/04 §18.4 "Aggregates": the ::bigint cast makes PostgreSQL refuse the
    // sum (22003 numeric_value_out_of_range). A savepoint keeps the test's
    // transaction usable.
    const error = await db
      .transaction((trx) => sumMinor(trx.from('test_amounts'), 'amount_minor'))
      .then(
        () => null,
        (e: { code?: string }) => e
      )
    assert.equal(error?.code, '22003')
  })

  test('T-ARCH-013 toMinor takes paisa only as safe integers', ({ assert }) => {
    assert.strictEqual(toMinor(129950), 129950)
    assert.strictEqual(toMinor('129950'), 129950)
    assert.strictEqual(toMinor(129950n), 129950)
    for (const bad of [1299.5, '1299.50', '9007199254740992', 2n ** 60n, null, undefined]) {
      assert.throws(() => toMinor(bad), RangeError)
    }
  })
})
