import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import env from '#start/env'

/*
 * T-ARCH-025: rendering one page of each surface on the server writes
 * nothing to `console` (docs/09 §7.5, RF-26): no page props, no debug
 * output. Today's surfaces are the error pages and the development gallery;
 * the storefront, seller and admin pages join this list as M1 to M4
 * rebuild them. The gallery is routed only in development (RF-40), so this
 * run renders its page from a route of its own. The SSR renderer runs in the test process (Vite's dev SSR),
 * so a spy on `console` sees what a page writes. Vite's own `[vite]` status
 * lines come from the development server, not from a page, and are skipped.
 */

router.get('/__test__/ssr/gallery', ({ inertia }) => inertia.render('dev/design_system/index', {}))

const PAGES = [
  { surface: 'errors (404)', path: '/no-such-page', status: 404, text: 'find that page' },
  {
    surface: 'development gallery',
    path: '/__test__/ssr/gallery',
    status: 200,
    text: 'Light Theme',
  },
]

const METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'table'] as const

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
          if (!line.startsWith('[vite]')) written.push(`${method}: ${line}`)
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
