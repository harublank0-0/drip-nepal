import { test } from '@japa/runner'
import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import inertiaConfig from '#config/inertia'

/*
 * T-ARCH-025: rendering one page of each surface on the server writes
 * nothing to `console` (docs/09 §7.5, RF-26): no page props, no debug
 * output. Today's only server-rendered surface is the error pages; the
 * storefront, sign-in and payment-return pages join this list as M1 to M5
 * build them (config/inertia.ts `SSR_SURFACES`). The development gallery
 * renders in the browser since E10 (docs/09 §13.8 rule 4). The SSR renderer runs in the test process (Vite's dev SSR),
 * so a spy on `console` sees what a page writes. Vite's own `[vite]` status
 * lines come from the development server, not from a page, and are skipped.
 */

const PAGES = [
  { surface: 'errors (404)', path: '/no-such-page', status: 404, text: 'find that page' },
]

const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const
// Vite's status lines, which Vite 8 prefixes with the time (`8:32:19 AM [vite] …`).
const VITE_STATUS = /^(?:\d{1,2}:\d{2}:\d{2}\s?(?:AM|PM)?\s+)?\[vite\]/i

const baseUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`

test.group('T-ARCH-025 SSR writes nothing to console', () => {
  test('{surface}: {path} renders without console output')
    .with(PAGES)
    .run(async ({ assert }, { path, status, text }) => {
      const written: string[] = []
      const originals = METHODS.map((method) => [method, console[method]] as const)
      for (const method of METHODS) {
        console[method] = (...args: unknown[]) => {
          const line = args.map(String).join(' ')
          if (!VITE_STATUS.test(line)) written.push(`${method}: ${line}`)
        }
      }
      try {
        const response = await fetch(`${baseUrl()}${path}`)
        assert.equal(response.status, status)
        // Server-rendered: the page's own text is in the HTML, not built in the browser.
        assert.include(await response.text(), text)
      } finally {
        for (const [method, original] of originals) console[method] = original as never
      }
      assert.deepEqual(written, [])
    })
})

/*
 * T-ARCH-002, the markup part on the test server (docs/09 §13.8 rules 3 and
 * 4): a page of an SSR surface arrives with its content, and a page outside
 * them arrives empty and renders in the browser. The production image and
 * the hydration check of T-ARCH-002 come with E10 part 4.
 */
test.group('T-ARCH-002 server-rendered and browser-rendered pages', () => {
  test('T-ARCH-002 the 404 page arrives rendered; the gallery arrives empty', async ({
    assert,
  }) => {
    const notFoundResponse = await fetch(`${baseUrl()}/no-such-page`)
    const notFound = await notFoundResponse.text()
    assert.include(notFound, 'find that page')
    const galleryResponse = await fetch(`${baseUrl()}/dev/design-system`)
    const gallery = await galleryResponse.text()
    assert.notInclude(gallery, 'Light Theme')
    assert.match(gallery, /<script data-page="app" type="application\/json">/)
  })

  // The filter itself: inertia/ssr.tsx bundles only these surfaces, so a
  // wider filter would only fail quietly into browser rendering.
  test('T-ARCH-002 ssr.pages is true for {page}: {expected}')
    .with([
      { page: 'storefront/home', expected: true },
      { page: 'auth/login', expected: true },
      { page: 'payments/return', expected: true },
      { page: 'errors/not_found', expected: true },
      { page: 'seller/overview', expected: false },
      { page: 'admin/shops/index', expected: false },
      { page: 'account/orders', expected: false },
      { page: 'dev/design_system/index', expected: false },
    ])
    .run(async ({ assert }, { page, expected }) => {
      const pages = inertiaConfig.ssr.pages
      assert.isFunction(pages)
      const result = typeof pages === 'function' ? await pages({} as HttpContext, page) : null
      assert.equal(result, expected)
    })
})
