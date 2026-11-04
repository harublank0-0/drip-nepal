import { test } from '@japa/runner'

// inertia/ is a separate TypeScript project, which the server build won't
// compile into this one, so the module is loaded at run time.
const frontendFormat = '../../../inertia/lib/format.js'
const { formatDate } = (await import(frontendFormat)) as {
  formatDate: (value: string | Date | null | undefined) => string
}

/*
 * Dates on order pages are shown in Nepal time (docs/01: times are in
 * Asia/Kathmandu, UTC+05:45). The server renders pages in UTC and the
 * browser in the customer's zone, so a date that depends on the machine's
 * zone renders differently in the two and React re-renders the page.
 */

test.group('formatDate [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('{instant} is {expected} in Nepal')
    .with([
      // 00:30 in Nepal on 4 November, still 3 November in UTC.
      { instant: '2026-11-03T18:45:00Z', expected: '4 Nov 2026' },
      // 05:44 in Nepal, the last minute where UTC is still the day before.
      { instant: '2026-11-03T23:59:00Z', expected: '4 Nov 2026' },
      { instant: '2026-11-04T06:00:00Z', expected: '4 Nov 2026' },
      // 23:59 in Nepal on 4 November.
      { instant: '2026-11-04T18:14:00Z', expected: '4 Nov 2026' },
    ])
    .run(({ assert }, row) => {
      assert.equal(formatDate(row.instant), row.expected)
    })

  test('an empty value formats as nothing', ({ assert }) => {
    assert.equal(formatDate(null), '')
    assert.equal(formatDate(undefined), '')
  })
})
