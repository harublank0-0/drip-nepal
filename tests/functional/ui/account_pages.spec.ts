import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { signIn } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'
import { DELETION_REQUEST_PATH, forgetReauth, postJson, randomIPv4 } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'

/*
 * The account pages (docs/08 §2.4, §3.1 "Account overview, security"; M1
 * part 6a). What the server decides is tested here; what the browser does
 * after it renders (the forms, the dialogs, focus, the countdown) is
 * checked in a browser.
 * - T-UI-038 (new): `/account` and `/account/security` open for a
 *   signed-in user, `pending_verification` included, in the browser (no
 *   server markup), never stored (`private, no-store`); a guest is sent to
 *   `/login` with the page as `return_to`; a suspended or closed account's
 *   session is ended and sent to `/login`; the public header links the
 *   account for a signed-in user; after a deletion request `/login` shows
 *   the closed-account notice once.
 * - T-SEC-036: `/account` sends the shared props and `account` with exactly
 *   the profile members, never the phone or a secret; `/account/security`
 *   the shared props only.
 * - T-SEC-043: both pages render with `encryptHistory`.
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

type Page = { component: string; props: Record<string, unknown>; encryptHistory?: boolean }

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

async function signedIn(state?: 'pending_verification') {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  await user.refresh()
  return { user, browser: await signIn(user.id) }
}

test.group('T-UI-038 the account pages', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-038 {path} opens for a signed-in user, rendered in the browser and never stored')
    .with([
      { path: '/account', component: 'account/overview', text: 'Save changes' },
      { path: '/account/security', component: 'account/security', text: 'Change your password' },
    ])
    .run(async ({ assert }, { path, component, text }) => {
      const { browser } = await signedIn()
      const { status, headers, html, page } = await htmlPage(browser, path)
      assert.equal(status, 200)
      assert.equal(page?.component, component)
      assert.equal(headers.get('cache-control'), 'private, no-store')
      // Account pages render in the browser (config/inertia.ts): no server markup.
      assert.notInclude(html, text)
      assert.isTrue(page?.encryptHistory, 'T-SEC-043')
    })

  test('T-UI-038 a pending_verification user opens both pages [AC-FR-IAM-002-2]', async ({
    assert,
  }) => {
    const { browser } = await signedIn('pending_verification')
    for (const path of ['/account', '/account/security']) {
      const { status } = await htmlPage(browser, path)
      assert.equal(status, 200, path)
    }
    const props = await pageProps(browser, '/account')
    assert.equal((props.account as { status: string }).status, 'pending_verification')
  })

  test('T-UI-038 a guest is sent to /login with {path} as return_to')
    .with([{ path: '/account' }, { path: '/account/security' }])
    .run(async ({ assert }, { path }) => {
      const response = await testBrowser().request(path, { headers: { Accept: 'text/html' } })
      await response.arrayBuffer()
      assert.equal(response.status, 302)
      const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
      assert.equal(location.pathname, '/login')
      assert.equal(location.searchParams.get('return_to'), path)
    })

  test('T-UI-038 a {status} account is signed out and sent to /login')
    .with([{ status: 'suspended' }, { status: 'deactivated' }])
    .run(async ({ assert }, { status }) => {
      const { user, browser } = await signedIn()
      await db
        .from('users')
        .where('id', user.id)
        .update({ status, deletion_requested_at: db.raw('now()') })
      const response = await browser.request('/account', { headers: { Accept: 'text/html' } })
      await response.arrayBuffer()
      assert.equal(response.status, 302)
      assert.equal(response.headers.get('location'), '/login')
    })

  test('T-UI-038 the public header links the account pages for a signed-in user only', async ({
    assert,
  }) => {
    const { browser } = await signedIn()
    const signedInHome = await htmlPage(browser, '/')
    assert.include(signedInHome.html, 'href="/account"')
    const guestHome = await htmlPage(testBrowser(), '/')
    assert.notInclude(guestHome.html, 'href="/account"')
  })

  test('T-UI-038 after a deletion request /login says the account is closed, once [AC-FR-IAM-009-1]', async ({
    assert,
  }) => {
    const { user, browser } = await signedIn()
    try {
      const response = await postJson({ browser, ip: randomIPv4() }, DELETION_REQUEST_PATH, {
        password: FACTORY_PASSWORD,
      })
      assert.equal(response.status, 202, response.text)
      const { page, html } = await htmlPage(browser, '/login')
      assert.equal(page?.component, 'auth/login')
      assert.equal(page?.props.notice, 'deletion_requested')
      assert.include(html, 'Your account is closed')
      const again = await htmlPage(browser, '/login')
      assert.isNull(again.page?.props.notice)
    } finally {
      await forgetReauth(user.id)
    }
  })
})

test.group('T-SEC-036 the account pages props', () => {
  test('T-SEC-036 /account sends the shared props and the profile, never the phone or a secret', async ({
    assert,
  }) => {
    const { user, browser } = await signedIn()
    await db
      .from('users')
      .where('id', user.id)
      .update({ marketing_sms_consent_at: db.raw('now()') })
    const props = await pageProps(browser, '/account')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'account'])
    assert.deepEqual(props.account, {
      email: user.email,
      full_name: user.fullName,
      status: 'active',
      phone_last4: null,
      marketing_email_consent: false,
      marketing_sms_consent: true,
    })
    const written = JSON.stringify(props)
    for (const secret of ['password', 'security_stamp', 'phone_enc', 'phone_hash', 'mfa']) {
      assert.notInclude(written, secret)
    }
  })

  test('T-SEC-036 /account/security sends the shared props, nothing else', async ({ assert }) => {
    const { browser } = await signedIn()
    const props = await pageProps(browser, '/account/security')
    assert.sameMembers(Object.keys(props), SHARED_PROPS)
  })
})
