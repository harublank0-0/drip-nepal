import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { orderLookupLimiter, penalizeFailures } from '#modules/auth/rate_limits'

/*
 * Guest order tracking allows 10 failed lookups per 15 minutes per
 * network (app/modules/auth/rate_limits.ts). The limiter's own `penalize`
 * wipes the count after any successful call, so someone holding one real
 * order (their own) could look it up after every 9 guesses and guess
 * forever. `penalizeFailures` counts failures the same way without that
 * reset.
 */

const notFound = async (): Promise<string> => {
  throw new Error('no such order')
}
const found = async () => 'DN261104-ABCDE'

test.group('Order lookup limit [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a successful lookup does not wipe the failed ones before it', async ({ assert }) => {
    const limiter = orderLookupLimiter()
    const key = `test:track:${randomUUID()}`
    const guess = () => penalizeFailures(limiter, key, notFound).catch(() => null)

    for (let attempt = 0; attempt < 9; attempt++) await guess()
    const [notThrottled, order] = await penalizeFailures(limiter, key, found)
    assert.isNull(notThrottled)
    assert.equal(order, 'DN261104-ABCDE')

    await guess()
    const [throttled] = await penalizeFailures(limiter, key, found)
    assert.isNotNull(throttled, 'the tenth failed guess blocks the network')
  })

  test('lookups that find their order are never limited', async ({ assert }) => {
    const limiter = orderLookupLimiter()
    const key = `test:track:${randomUUID()}`

    for (let attempt = 0; attempt < 15; attempt++) {
      const [throttled] = await penalizeFailures(limiter, key, found)
      assert.isNull(throttled, `lookup ${attempt + 1}`)
    }
  })
})
