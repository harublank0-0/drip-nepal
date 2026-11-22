import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { withTx } from '#modules/platform/tx'
import { signIn } from '#tests/support/courier_http'
import { rawTokenOf } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The password-reset pages (docs/08 §2.3, §3.1; 02 J-18 steps 1–4; M1 part
 * 4). What the server decides is tested here; what the browser does after
 * it renders (the forms, dropping the token from the URL, the move to
 * `/login` with its notice, the countdown) is checked in a browser.
 * - T-UI-036: `/forgot-password` renders on the server, signed in or not,
 *   with the email field's `autocomplete` token; `/reset-password` opens
 *   signed in or not, sends `Referrer-Policy: no-referrer` and
 *   `Cache-Control: no-store`, renders the form with the `new-password`
 *   token, and never redeems the token of its URL; without a token it
 *   offers a new link; `/login` links `/forgot-password`.
 * - T-SEC-036: each page's prop key set is the shared props only.
 */

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
  return {
    status: response.status,
    headers: response.headers,
    html,
    page: JSON.parse(json ?? 'null') as Page | null,
  }
}

async function pageProps(browser: Browser, path: string) {
  await browser.open(path)
  return browser.props(path)
}

test.group('T-UI-036 /forgot-password', () => {
  test('T-UI-036 a guest gets the form, rendered on the server, with the email token', async ({
    assert,
  }) => {
    const { status, html, page } = await htmlPage(testBrowser(), '/forgot-password')
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/forgot_password')
    assert.include(html, 'Forgot your password?')
    assert.match(html, /autocomplete="email"/i)
    assert.include(html, 'type="email"')
    assert.include(html, 'href="/login"')
  })

  test('T-UI-036 a signed-in user may open it too', async ({ assert }) => {
    const user = await UserFactory.create()
    const { status, page } = await htmlPage(await signIn(user.id), '/forgot-password')
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/forgot_password')
  })

  test('T-UI-036 /login links the reset request page', async ({ assert }) => {
    const { html } = await htmlPage(testBrowser(), '/login')
    assert.include(html, 'href="/forgot-password"')
  })

  test('T-SEC-036 /forgot-password sends the shared props, nothing else', async ({ assert }) => {
    const props = await pageProps(testBrowser(), '/forgot-password')
    assert.sameMembers(Object.keys(props), SHARED_PROPS)
  })
})

test.group('T-UI-036 /reset-password', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-036 the emailed link opens the form, sends no referrer and is never stored, and redeems nothing [AC-J18-02]', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const issued = await withTx((trx) => issueUserToken(trx, user.id, 'password_reset'))
    const token = await rawTokenOf(issued.id, 'password_reset')

    // A mail scanner or a link preview fetches the link: nothing changes.
    const { status, headers, html, page } = await htmlPage(
      testBrowser(),
      `/reset-password?token=${encodeURIComponent(token)}`
    )
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/reset_password')
    assert.equal(headers.get('referrer-policy'), 'no-referrer')
    assert.equal(headers.get('cache-control'), 'no-store')
    assert.match(html, /<meta[^>]*name="referrer"[^>]*content="no-referrer"/)
    assert.include(html, 'Set a new password')
    assert.match(html, /autocomplete="new-password"/i)
    const row = await db.from('user_tokens').where('id', issued.id).firstOrFail()
    assert.isNull(row.consumed_at)
  })

  test('T-UI-036 without a token the page offers a new link, signed in or not', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    for (const browser of [testBrowser(), await signIn(user.id)]) {
      const { status, html } = await htmlPage(browser, '/reset-password')
      assert.equal(status, 200)
      assert.include(html, 'This link is not complete')
      assert.include(html, 'type="email"')
    }
  })

  test('T-SEC-036 /reset-password sends the shared props, nothing else', async ({ assert }) => {
    const props = await pageProps(testBrowser(), '/reset-password')
    assert.sameMembers(Object.keys(props), SHARED_PROPS)
  })
})
