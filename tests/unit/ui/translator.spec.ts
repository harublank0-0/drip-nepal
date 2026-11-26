import { test } from '@japa/runner'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IntlMessageFormat } from 'intl-messageformat'
import {
  createSurfaceTranslator,
  createTranslator,
  type Catalog,
  type Translate,
} from '#shared/i18n/translator'
import { catalogsFor, LATER_CATALOGS } from '#shared/i18n/surface_catalogs'

/*
 * T-UI-034: the message catalogs of docs/08 §11.8 and the `t()` of
 * docs/09 §13.10. ICU messages format with their values, keys carry their
 * file name, a missing key or placeholder value renders the key, every
 * message in resources/lang/en compiles as ICU MessageFormat, and every
 * key the frontend passes to t() exists. The key type catches a typo at
 * typecheck; these cases cover what reaches run time anyway. Since R1-S
 * part 2f-i a surface catalog may load with its surface (seller.json with
 * the seller pages): its keys render as keys until it has loaded, it loads
 * once, a failed load is tried again, and no file outside the surface uses
 * one of its keys, which would show raw on another page.
 */

const CATALOG_DIR = join(process.cwd(), 'resources', 'lang', 'en')
const FRONTEND_DIR = join(process.cwd(), 'inertia')

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

// The t('…') keys in the frontend's source, outside the upstream ui/ copies.
function frontendKeys(): string[] {
  const keys = new Set<string>()
  for (const entry of readdirSync(FRONTEND_DIR, { recursive: true, encoding: 'utf8' })) {
    if (!/\.tsx?$/.test(entry) || entry.startsWith(join('components', 'ui'))) continue
    const source = readFileSync(join(FRONTEND_DIR, entry), 'utf8')
    for (const match of source.matchAll(/\bt\(\s*(['"`])([^'"`]+)\1/g)) {
      // A key built at run time (StatusBadge's `status.<entity>.<state>`) is T-UI-008's to check.
      if (!match[2].includes('${')) keys.add(match[2])
    }
  }
  return [...keys]
}

test.group('T-UI-034 message catalogs', () => {
  // Untyped, so the cases can pass keys the key type would refuse.
  const t = createTranslator({
    cart: {
      'notice.price_changed': 'Price changed from {old} to {new}',
      'items': '{count, plural, one {# item} other {# items}}',
      'plain': 'Your cart',
    },
  }) as Translate

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
        label: 'a missing placeholder value renders the key',
        key: 'cart.items',
        values: undefined,
        expected: 'cart.items',
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

  test('T-UI-034 a key that is not in the catalogs fails the typecheck', ({ assert }) => {
    const typed = createTranslator({ cart: { plain: 'Your cart' } })
    assert.equal(typed('cart.plain'), 'Your cart')
    // @ts-expect-error: 'cart.plian' is not a key of the catalogs.
    assert.equal(typed('cart.plian'), 'cart.plian')
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

  test('T-UI-034 every key the frontend passes to t() exists', ({ assert }) => {
    // Membership, not translation: a message with a placeholder renders its
    // key when called without values, which says nothing about the key.
    const known = new Set(
      Object.entries(catalogs()).flatMap(([file, catalog]) =>
        Object.keys(catalog).map((key) => `${file}.${key}`)
      )
    )
    const keys = frontendKeys()
    // The error pages and the error screen use 13 keys today.
    assert.isAtLeast(keys.length, 13)
    for (const key of keys) assert.isTrue(known.has(key), key)
  })

  test('T-UI-034 a surface catalog renders its keys once it has loaded, and loads once', async ({
    assert,
  }) => {
    let calls = 0
    const translator = createSurfaceTranslator(
      { common: { ok: 'OK' } },
      {
        seller: async () => {
          calls += 1
          return { default: { 'nav.products': 'Products' } }
        },
      }
    )
    assert.equal(translator.t('common.ok'), 'OK')
    assert.equal(translator.t('seller.nav.products'), 'seller.nav.products')
    await Promise.all([translator.load('seller'), translator.load('seller')])
    await translator.load('seller')
    assert.equal(translator.t('seller.nav.products'), 'Products')
    assert.equal(calls, 1)
  })

  test('T-UI-034 a surface catalog that failed to load is tried again', async ({ assert }) => {
    let calls = 0
    const translator = createSurfaceTranslator(
      {},
      {
        seller: async () => {
          calls += 1
          if (calls === 1) throw new Error('offline')
          return { default: { 'nav.products': 'Products' } }
        },
      }
    )
    await assert.rejects(() => translator.load('seller'), 'offline')
    await translator.load('seller')
    assert.equal(translator.t('seller.nav.products'), 'Products')
    assert.equal(calls, 2)
  })

  test('T-UI-034 the seller pages load seller.json, and no other page does', ({ assert }) => {
    assert.deepEqual(catalogsFor('seller/products'), ['seller'])
    assert.deepEqual(catalogsFor('seller/product_edit'), ['seller'])
    for (const page of ['account/addresses', 'storefront/home', 'auth/login', 'admin/logistics']) {
      assert.deepEqual(catalogsFor(page), [], page)
    }
  })

  test('T-UI-034 only its surface uses a key of a catalog that loads with its surface', ({
    assert,
  }) => {
    // The seller layout renders only around a seller page, after the catalog has loaded.
    const surfaceFiles: Record<string, (entry: string) => boolean> = {
      seller: (entry) =>
        entry.startsWith(join('pages', 'seller')) ||
        entry.startsWith(join('components', 'seller')) ||
        entry === join('layouts', 'seller_layout.tsx'),
    }
    const all = catalogs()
    for (const file of Object.keys(LATER_CATALOGS)) {
      const keys = new Set(Object.keys(all[file]).map((key) => `${file}.${key}`))
      for (const entry of readdirSync(FRONTEND_DIR, { recursive: true, encoding: 'utf8' })) {
        if (!/\.tsx?$/.test(entry) || surfaceFiles[file](entry)) continue
        const source = readFileSync(join(FRONTEND_DIR, entry), 'utf8')
        for (const match of source.matchAll(/(['"`])([a-z_]+\.[a-z0-9_.]+)\1/g)) {
          assert.isFalse(keys.has(match[2]), `${entry} uses ${match[2]}`)
        }
      }
    }
  })
})
