import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { middleware } from '#start/kernel'
import { UserFactory } from '#database/factories/user_factory'
import { signIn } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The sign-in page (docs/08 §2.3, §3.1 "Sign up, log in"; 02 J-04 step 5;
 * M1 part 3). What the server decides is tested here; what the browser does
 * after it renders (the client rules, the refusal messages, the countdown,
 * the visit to `redirect_to`) is checked in a browser.
 * - T-UI-036: `/login` renders on the server for a guest, with the
 *   `email` and `current-password` tokens, a show-password button, links
 *   to `/forgot-password` and `/signup` (with `return_to` passed on), and
 *   no remember-me box; a signed-in user is sent to `/` without the
 *   visited query; after the account check ended a suspended user's
 *   session on a page, the page says the account is suspended.
 * - T-SEC-036: the page's prop key set, the shared props and `notice`.
 */

// A signed-in page, so the account check of docs/07 §3.3 can end a session on a page visit.
router.get('/__test__/login-page/account', () => 'account').use(middleware.auth())

const SHARED_PROPS = [
  'errors',
  'flash',
  'support',
  'appUrl',
  'theme',
  'user',
  'current_staff',
  'request_id',
]

type Page = { component: string; props: Record<string, unknown> }

// An HTML answer with its Inertia page object, whatever its status.
async function htmlPage(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return { status: response.status, html, page: JSON.parse(json ?? 'null') as Page | null }
}

test.group('T-UI-036 /login', () => {
  test('T-UI-036 a guest gets the sign-in form, rendered on the server, with its autocomplete tokens and no remember-me box', async ({
    assert,
  }) => {
    const { status, html, page } = await htmlPage(testBrowser(), '/login')
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/login')
    assert.isNull(page?.props.notice)
    // Server-rendered markup (ADR-0003), not an empty root.
    assert.include(html, 'Sign in to DripNepal')
    // The autocomplete tokens of docs/08 §6.5 and §9.3 (SC 1.3.5, SC 3.3.8).
    for (const token of ['email', 'current-password']) {
      assert.match(html, new RegExp(`autocomplete="${token}"`, 'i'))
    }
    assert.include(html, 'aria-label="Show password"')
    assert.include(html, 'href="/forgot-password"')
    assert.include(html, 'href="/signup"')
    // Remember-me is off in R1 (docs/07 §3.5).
    assert.notMatch(html, /role="checkbox"|type="checkbox"/)
    assert.notInclude(html, 'Your account is suspended')
  })

  test('T-UI-036 /login passes return_to on, unchanged, to the sign-up link', async ({
    assert,
  }) => {
    const { html } = await htmlPage(
      testBrowser(),
      `/login?return_to=${encodeURIComponent('/checkout')}`
    )
    assert.include(html, `href="/signup?return_to=${encodeURIComponent('/checkout')}"`)
  })

  test('T-UI-036 a signed-in user is sent away from /login without the visited query', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    const response = await browser.request(`/login?return_to=${encodeURIComponent('/checkout')}`, {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/')
  })

  test('T-UI-036 after the account check ends a suspended session on a page, /login says why [AC-FR-IAM-006-2]', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const refused = await browser.request('/__test__/login-page/account')
    await refused.arrayBuffer()
    assert.equal(refused.status, 302)
    assert.equal(refused.headers.get('location'), '/login')

    const { page, html } = await htmlPage(browser, '/login')
    assert.equal(page?.props.notice, 'account_suspended')
    assert.include(html, 'Your account is suspended')
    // The flash is read once: the next visit is a plain sign-in page.
    const again = await htmlPage(browser, '/login')
    assert.isNull(again.page?.props.notice)
  })

  test('T-SEC-036 /login sends the shared props and the notice, nothing else', async ({
    assert,
  }) => {
    const browser = testBrowser()
    await browser.open('/login')
    const props = await browser.props('/login')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'notice'])
    assert.isNull(props.notice)
    assert.isNull(props.user)
  })
})
