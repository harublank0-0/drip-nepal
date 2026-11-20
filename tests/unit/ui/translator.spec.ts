import { test } from '@japa/runner'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import { createTranslator, type Catalog } from '#shared/i18n/translator'

/*
 * T-UI-034: the message catalogs of docs/08 §11.8 and the `t()` of
 * docs/09 §13.10. ICU messages format with their values, keys carry their
 * file name, a missing key renders as itself, and every message in
 * resources/lang/en compiles as ICU MessageFormat.
 */

const CATALOG_DIR = join(process.cwd(), 'resources', 'lang', 'en')

function catalogs(): Record<string, Catalog> {
  return Object.fromEntries(
    readdirSync(CATALOG_DIR)
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file.replace(/\.json$/, ''),
        JSON.parse(readFileSync(join(CATALOG_DIR, file), 'utf8')) as Catalog,
      ])
  )
}

test.group('T-UI-034 message catalogs', () => {
  const t = createTranslator({
    cart: {
      'notice.price_changed': 'Price changed from {old} to {new}',
      'items': '{count, plural, one {# item} other {# items}}',
      'plain': 'Your cart',
    },
  })

  test('T-UI-034 {label}')
    .with([
      { label: 'a plain message', key: 'cart.plain', values: undefined, expected: 'Your cart' },
      {
        label: 'named placeholders',
        key: 'cart.notice.price_changed',
        values: { old: 'Rs 500', new: 'Rs 450' },
        expected: 'Price changed from Rs 500 to Rs 450',
      },
      { label: 'ICU plural, one', key: 'cart.items', values: { count: 1 }, expected: '1 item' },
      { label: 'ICU plural, other', key: 'cart.items', values: { count: 3 }, expected: '3 items' },
      {
        label: 'a missing key renders as itself',
        key: 'cart.nope',
        values: undefined,
        expected: 'cart.nope',
      },
      {
        label: 'a key without its file name is missing',
        key: 'plain',
        values: undefined,
        expected: 'plain',
      },
    ])
    .run(({ assert }, { key, values, expected }) => {
      assert.equal(t(key, values), expected)
    })

  test('T-UI-034 every message in resources/lang/en compiles as ICU', ({ assert }) => {
    const all = catalogs()
    assert.includeMembers(Object.keys(all), ['common', 'errors'])
    for (const [file, catalog] of Object.entries(all)) {
      for (const [key, message] of Object.entries(catalog)) {
        assert.doesNotThrow(() => new IntlMessageFormat(message, 'en'), `${file}.${key}`)
      }
    }
  })

  test('T-UI-034 the error pages find every key they use', ({ assert }) => {
    const translate = createTranslator(catalogs())
    for (const key of [
      'common.support.need_help',
      'common.support.contact',
      'errors.not_found.heading',
      'errors.server_error.heading',
    ]) {
      assert.notEqual(translate(key), key, key)
    }
  })
})
