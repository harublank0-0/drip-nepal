import { test } from '@japa/runner'
import { formatNPR, minorToRupeesText, parseRupeesToMinor } from '#shared/format/money'

/*
 * Money is whole paisa in v1 (docs/04 §18.1). T-UI-020 for the formatter
 * (docs/08 §5.11) and the parsing part of T-ARCH-013 (docs/04 §18.4).
 */

const NBSP = ' '

test.group('T-UI-020 money formatter [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('{minor} paisa reads {shown}')
    .with([
      { minor: 0, shown: `Rs${NBSP}0` },
      { minor: 50, shown: `Rs${NBSP}0.50` },
      { minor: 5, shown: `Rs${NBSP}0.05` },
      { minor: 725000, shown: `Rs${NBSP}7,250` },
      { minor: 725050, shown: `Rs${NBSP}7,250.50` },
      { minor: 123456750, shown: `Rs${NBSP}12,34,567.50` },
      // Beyond the old decimal(10,2) columns' Rs 9,99,99,999.99.
      { minor: 1_234_567_890_12, shown: `Rs${NBSP}1,23,45,67,890.12` },
      { minor: -100000, shown: `-Rs${NBSP}1,000` },
    ])
    .run(({ assert }, row) => {
      assert.equal(formatNPR(row.minor), row.shown)
    })

  test("it reads as ICU's NPR currency format, which shows the paisa always", ({ assert }) => {
    const icu = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'NPR',
      currencyDisplay: 'narrowSymbol',
    })
    for (const minor of [123456750, 725050, 50]) {
      assert.equal(formatNPR(minor), icu.format(minor / 100))
    }
  })

  test('an amount that is not whole paisa is refused', ({ assert }) => {
    assert.throws(() => formatNPR(1299.5), RangeError)
    assert.throws(() => formatNPR(Number.NaN), RangeError)
  })

  test('paisa read back as rupees for a form field', ({ assert }) => {
    assert.equal(minorToRupeesText(129950), '1299.50')
    assert.equal(minorToRupeesText(129905), '1299.05')
    assert.equal(minorToRupeesText(129900), '1299')
    assert.equal(minorToRupeesText(5), '0.05')
    for (const minor of [129950, 129905, 129900, 5, 0]) {
      assert.equal(parseRupeesToMinor(minorToRupeesText(minor)), minor)
    }
  })
})

test.group('T-ARCH-013 rupees typed by people [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('{typed} is {minor} paisa')
    .with([
      { typed: '1299', minor: 129900 },
      { typed: '1299.5', minor: 129950 },
      { typed: '1299.50', minor: 129950 },
      { typed: '12,99,999.99', minor: 129999999 },
      { typed: '0.05', minor: 5 },
      { typed: ' 1951.23 ', minor: 195123 },
      // A float would make this 114.99999999999999 paisa.
      { typed: '1.15', minor: 115 },
    ])
    .run(({ assert }, row) => {
      assert.strictEqual(parseRupeesToMinor(row.typed), row.minor)
    })

  test('{typed} is refused')
    .with([
      { typed: '1299.' },
      { typed: '1.005' },
      { typed: '-1' },
      { typed: '' },
      { typed: '12a' },
      { typed: '1e3' },
      { typed: '1234567890' },
    ])
    .run(({ assert }, row) => {
      assert.isNull(parseRupeesToMinor(row.typed))
    })
})
