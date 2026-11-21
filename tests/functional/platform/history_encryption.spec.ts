import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import env from '#start/env'

/*
 * T-SEC-043 (docs/07 §3.11, RF-34): pages of the signed-in surfaces
 * (`/account`, `/seller`, `/admin`, `/checkout`) render with Inertia's
 * `encryptHistory`, so the back button on a shared phone cannot show the
 * previous user's pages once their history key is cleared. Storefront and
 * other guest pages are not encrypted. A path only counts when the surface is
 * a whole first segment: `/accounts` is not `/account`.
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`

const PATHS = [
  '/account/__test__/t-sec-043',
  '/seller/__test__/t-sec-043',
  '/admin/__test__/t-sec-043',
  '/checkout/__test__/t-sec-043',
  '/checkout',
  '/__test__/t-sec-043',
  '/accounts/__test__/t-sec-043',
]
for (const path of PATHS) {
  router.get(path, ({ inertia }) => inertia.render('errors/not_found', {}))
}

// The page object of the HTML answer (the JSON data block of the root view).
async function pageObject(path: string) {
  const response = await fetch(`${base()}${path}`, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return { status: response.status, page: JSON.parse(json ?? 'null') as Record<string, unknown> }
}

test.group('T-SEC-043 history encryption on the signed-in surfaces', () => {
  test('T-SEC-043 {path} encrypts its history: {encrypted}')
    .with([
      { path: '/account/__test__/t-sec-043', encrypted: true },
      { path: '/seller/__test__/t-sec-043', encrypted: true },
      { path: '/admin/__test__/t-sec-043', encrypted: true },
      { path: '/checkout/__test__/t-sec-043', encrypted: true },
      { path: '/checkout', encrypted: true },
      { path: '/__test__/t-sec-043', encrypted: false },
      { path: '/accounts/__test__/t-sec-043', encrypted: false },
    ])
    .run(async ({ assert }, { path, encrypted }) => {
      const { status, page } = await pageObject(path)
      assert.equal(status, 200)
      assert.isObject(page)
      assert.equal(page.encryptHistory === true, encrypted)
    })

  test('T-SEC-043 an Inertia visit to a signed-in surface encrypts its history', async ({
    assert,
  }) => {
    const first = await fetch(`${base()}/seller/__test__/t-sec-043`, {
      headers: { Accept: 'text/html' },
    })
    const html = await first.text()
    const version = /"version":"([^"]*)"/.exec(html)?.[1] ?? ''
    const visit = await fetch(`${base()}/seller/__test__/t-sec-043`, {
      headers: { 'X-Inertia': 'true', 'X-Inertia-Version': version },
    })
    assert.equal(visit.status, 200)
    const page = (await visit.json()) as Record<string, unknown>
    assert.isTrue(page.encryptHistory)
  })
})
