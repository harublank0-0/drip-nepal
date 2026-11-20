import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import inertiaConfig from '#config/inertia'

const baseUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`

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
