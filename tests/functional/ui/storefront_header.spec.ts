import { test } from '@japa/runner'
import { testBrowser } from '#tests/support/browser'

/*
 * T-UI-050: the storefront header (docs/08 §2.7; R1-S part 3d-iii-b). On
 * every storefront page the server HTML holds, in order, the brand, the
 * main navigation with the audience pages as links, the search button and
 * the account part ("Sign in" for a guest), and each audience page has a
 * labelled button for its entries' menu (the entries themselves render in
 * the browser). The sign-in pages keep their own header.
 */
async function html(path: string) {
  const response = await testBrowser().request(path, { headers: { Accept: 'text/html' } })
  return { status: response.status, body: await response.text() }
}

const markup = (body: string) =>
  body.replaceAll(/<script[\s\S]*?<\/script>/g, '').replaceAll(/data-page="[^"]*"/g, '')

test.group('T-UI-050 the storefront header', () => {
  test('T-UI-050 the header leads every storefront page, in order', async ({ assert }) => {
    for (const path of ['/', '/men', '/c/t-shirts', '/search']) {
      const page = await html(path)
      assert.equal(page.status, 200, path)
      const body = markup(page.body)
      const header = body.slice(body.indexOf('<header'), body.indexOf('</header>'))
      const brand = header.indexOf('DripNepal')
      const nav = header.indexOf('aria-label="Main"')
      const search = header.indexOf('>Search</span>')
      const signIn = header.indexOf('>Sign in</a>')
      assert.isAbove(brand, -1, path)
      assert.isTrue(
        brand < nav && nav < search && search < signIn,
        `${path}: ${[brand, nav, search, signIn]}`
      )
      for (const audience of ['/men', '/women']) {
        assert.include(header, `href="${audience}"`, path)
      }
      assert.include(header, 'Men categories')
      assert.include(header, 'href="/login"')
    }
  })

  test('T-UI-050 the sign-in pages keep their own header', async ({ assert }) => {
    const login = await html('/login')
    const page = markup(login.body)
    assert.notInclude(page, 'aria-label="Main"')
  })
})
