import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import env from '#start/env'

/*
 * T-SEC-043, the encryption part (docs/07 §3.11, RF-34): pages of the
 * signed-in surfaces (Account: `/account`, `/sell`, `/invitations`; Seller,
 * Admin and Checkout) render with Inertia's `encryptHistory`, so the back
 * button on a shared phone cannot show the previous user's pages once their
 * history key is cleared. Other pages are not encrypted. A surface counts
 * only as a whole first path segment (`/accounts` is not `/account`; the
 * exact-path cases are unit-tested). The flag is set in the server stack, so
 * the 404 page of an unknown URL under a surface is encrypted too. The
 * clearing part of T-SEC-043 comes with logOut in M1.
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`

const PAGES = [
  { path: '/account/__test__/t-sec-043', encrypted: true },
  { path: '/sell/__test__/t-sec-043', encrypted: true },
  { path: '/invitations/__test__/t-sec-043', encrypted: true },
  { path: '/seller/__test__/t-sec-043', encrypted: true },
  { path: '/admin/__test__/t-sec-043', encrypted: true },
  { path: '/checkout/__test__/t-sec-043', encrypted: true },
  { path: '/__test__/t-sec-043', encrypted: false },
  { path: '/accounts/__test__/t-sec-043', encrypted: false },
]
for (const { path } of PAGES) {
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
    .with(PAGES)
    .run(async ({ assert }, { path, encrypted }) => {
      const { status, page } = await pageObject(path)
      assert.equal(status, 200)
      assert.isObject(page)
      assert.equal(page.encryptHistory === true, encrypted)
    })

  test('T-SEC-043 the 404 page of an unknown URL under {path} is encrypted: {encrypted}')
    .with([
      { path: '/admin/__missing__/t-sec-043', encrypted: true },
      { path: '/t-sec-043/__missing__', encrypted: false },
    ])
    .run(async ({ assert }, { path, encrypted }) => {
      const { status, page } = await pageObject(path)
      assert.equal(status, 404)
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
