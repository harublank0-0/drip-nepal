import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import { errors } from '@adonisjs/limiter'

/*
 * T-ARCH-013, the limiter smoke test of docs/04 §18.4: the global int8
 * parser also reads `rate_limits.expire` (bigint epoch milliseconds), and the
 * database store must still count and block. The store writes on its own
 * connection and commits, so the test is here, keyed by a fresh UUID
 * (docs/10 §3.3).
 */
test.group('T-ARCH-013 limiter on the int8 parser', () => {
  test('T-ARCH-013 the database limiter store counts, blocks and reports its expiry', async ({
    assert,
  }) => {
    const key = `t-arch-013:${randomUUID()}`
    const store = limiter.use('database', { requests: 2, duration: '1 minute' })

    const first = await store.consume(key)
    assert.equal(first.remaining, 1)
    await store.consume(key)
    await assert.rejects(() => store.consume(key), errors.E_TOO_MANY_REQUESTS)
    assert.equal(await store.remaining(key), 0)

    const availableIn = await store.availableIn(key)
    assert.isAbove(availableIn, 0)
    assert.isAtMost(availableIn, 60)

    // rate-limiter-flexible prefixes the key with `rlflx:`
    const row = await db.from('rate_limits').where('key', `rlflx:${key}`).firstOrFail()
    assert.isNumber(row.expire)
    assert.isTrue(Number.isSafeInteger(row.expire))
    assert.closeTo(row.expire, Date.now() + availableIn * 1000, 2000)

    await store.delete(key)
  })
})
