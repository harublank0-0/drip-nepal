import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import {
  FALLBACK_RETRY_SECONDS,
  retryWaitSeconds,
  secondsUntil,
  waitText,
} from '#shared/ui/retry_wait'
import { createTranslator, type Catalog } from '#shared/i18n/translator'

const common = JSON.parse(
  readFileSync(join(process.cwd(), 'resources', 'lang', 'en', 'common.json'), 'utf8')
) as Catalog

/*
 * T-UI-037, the rules part (docs/08 §8.3, AC-J00-04): after 429
 * `RATE_LIMITED` the action waits for `Retry-After`, never less, and the
 * form says how long is left: seconds under a minute, then whole minutes
 * rounded up. The countdown in the browser and its announcements (once at
 * the start, once at the end) are checked in a browser.
 */
test.group('T-UI-037 the RATE_LIMITED wait', () => {
  test('T-UI-037 the wait is Retry-After in whole seconds, at least 1', ({ assert }) => {
    assert.equal(retryWaitSeconds(40), 40)
    assert.equal(retryWaitSeconds(0.2), 1)
    assert.equal(retryWaitSeconds(59.1), 60)
    assert.equal(retryWaitSeconds(3600), 3600)
  })

  test('T-UI-037 a missing or unusable Retry-After falls back to {expected} seconds: {value}')
    .with([
      { value: undefined, expected: FALLBACK_RETRY_SECONDS },
      { value: null, expected: FALLBACK_RETRY_SECONDS },
      { value: '40', expected: FALLBACK_RETRY_SECONDS },
      { value: 0, expected: FALLBACK_RETRY_SECONDS },
      { value: -5, expected: FALLBACK_RETRY_SECONDS },
      { value: Number.NaN, expected: FALLBACK_RETRY_SECONDS },
      { value: Number.POSITIVE_INFINITY, expected: FALLBACK_RETRY_SECONDS },
    ])
    .run(({ assert }, { value, expected }) => {
      assert.equal(retryWaitSeconds(value), expected)
    })

  test('T-UI-037 the seconds left round up and stop at 0', ({ assert }) => {
    const until = 1_000_000
    assert.equal(secondsUntil(until, until - 40_000), 40)
    assert.equal(secondsUntil(until, until - 39_001), 40)
    assert.equal(secondsUntil(until, until - 1), 1)
    assert.equal(secondsUntil(until, until), 0)
    assert.equal(secondsUntil(until, until + 5000), 0)
  })

  test('T-UI-037 a wait reads in seconds under a minute, else in whole minutes rounded up', ({
    assert,
  }) => {
    assert.deepEqual(waitText(1), { unit: 'seconds', count: 1 })
    assert.deepEqual(waitText(40), { unit: 'seconds', count: 40 })
    assert.deepEqual(waitText(59), { unit: 'seconds', count: 59 })
    assert.deepEqual(waitText(60), { unit: 'minutes', count: 1 })
    assert.deepEqual(waitText(61), { unit: 'minutes', count: 2 })
    assert.deepEqual(waitText(2820), { unit: 'minutes', count: 47 })
  })

  test('T-UI-037 the catalog message names the wait', ({ assert }) => {
    const t = createTranslator({ common })
    assert.equal(
      t('common.rate_limited.wait', waitText(40)),
      'Too many attempts. Try again in 40 seconds.'
    )
    assert.equal(
      t('common.rate_limited.wait', waitText(1)),
      'Too many attempts. Try again in 1 second.'
    )
    assert.equal(
      t('common.rate_limited.wait', waitText(61)),
      'Too many attempts. Try again in 2 minutes.'
    )
    assert.equal(
      t('common.rate_limited.wait', waitText(60)),
      'Too many attempts. Try again in 1 minute.'
    )
  })
})
