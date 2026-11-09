import { test } from '@japa/runner'
import { ESLint } from 'eslint'

/*
 * T-ARCH-014, the lint half (docs/09 §11.2 "money" block, §13.6; ADR-0007):
 * `parseFloat`, `Number.parseFloat`, `toFixed` and `toLocaleString` are
 * banned in money code (`app/modules/**`, `shared/format/**`, `inertia/**`)
 * except in the formatter, shared/format/money.ts. Each fixture is linted
 * with the repository's eslint.config.js at a path it would have, so a
 * selector or `files` glob that matches nothing fails here (docs/09 §11.2,
 * notes: "a selector that matches nothing is a silent hole").
 */

const BANNED = `export function rupees(text: string, minor: number) {
  const a = parseFloat(text)
  const b = Number.parseFloat(text)
  const c = (minor / 100).toFixed(2)
  const d = minor.toLocaleString('en-IN')
  return [a, b, c, d]
}
`

const ALLOWED = `import { formatNPR, parseRupeesToMinor } from '#shared/format/money'

export function price(text: string) {
  const minor = parseRupeesToMinor(text)
  return minor === null ? null : formatNPR(minor)
}
`

const MONEY_RULES = new Set(['no-restricted-globals', 'no-restricted-properties'])

async function moneyMessages(code: string, filePath: string) {
  const eslint = new ESLint()
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((message) => message.ruleId !== null && MONEY_RULES.has(message.ruleId))
    .map((message) => `${message.line}:${message.ruleId}`)
}

test.group('T-ARCH-014 parseFloat, toFixed and toLocaleString in money code', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-014 the four uses fail in {filePath}')
    .with([
      { filePath: 'app/modules/pricing/domain/money.ts' },
      { filePath: 'app/modules/orders/actions/place_order.ts' },
      { filePath: 'shared/format/date.ts' },
      { filePath: 'inertia/components/catalog/price_tag.tsx' },
      { filePath: 'inertia/pages/seller/products/edit.tsx' },
    ])
    .run(async ({ assert }, { filePath }) => {
      assert.deepEqual(await moneyMessages(BANNED, filePath), [
        '2:no-restricted-globals',
        '3:no-restricted-properties',
        '4:no-restricted-properties',
        '5:no-restricted-properties',
      ])
    })

  test('T-ARCH-014 money code that formats with formatNPR passes in {filePath}')
    .with([
      { filePath: 'app/modules/pricing/domain/money.ts' },
      { filePath: 'inertia/components/catalog/price_tag.tsx' },
    ])
    .run(async ({ assert }, { filePath }) => {
      assert.deepEqual(await moneyMessages(ALLOWED, filePath), [])
    })

  test('T-ARCH-014 the formatter and code outside money code are not in the ban: {filePath}')
    .with([{ filePath: 'shared/format/money.ts' }, { filePath: 'start/env_policy.ts' }])
    .run(async ({ assert }, { filePath }) => {
      assert.deepEqual(await moneyMessages(BANNED, filePath), [])
    })
})
