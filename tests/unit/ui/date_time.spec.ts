import { test } from '@japa/runner'
import { formatDateTime } from '#shared/format/date_time'

/*
 * T-UI-020, the date part (docs/08 §11.8): UTC in, Kathmandu time out
 * (UTC+05:45), whatever the process's own zone. 18:15 UTC is midnight in
 * Kathmandu, so the date changes there.
 */
test.group('T-UI-020 Kathmandu dates', () => {
  test('T-UI-020 the Kathmandu day starts at 18:15 UTC', ({ assert }) => {
    assert.equal(formatDateTime('2026-11-21T18:14:00Z'), '21 Nov 2026, 11:59 pm')
    assert.equal(formatDateTime('2026-11-21T18:15:00Z'), '22 Nov 2026, 12:00 am')
  })

  test('T-UI-020 a timestamp with microseconds formats in Kathmandu time', ({ assert }) => {
    assert.equal(formatDateTime('2026-01-05T06:30:00.123456Z'), '5 Jan 2026, 12:15 pm')
  })
})
