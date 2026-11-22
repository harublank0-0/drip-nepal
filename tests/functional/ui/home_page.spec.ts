import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import { signIn, staffUser } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The interim home page `/` (docs/08 §2.2; not an OD, decided 2026-11-23
 * by the tech lead, risks §2.3), where every redirect after sign-in, after
 * a verified link and away from the guest pages lands until M4 builds the
 * storefront home in the same component. What the server decides is
 * tested here; the sign-out itself is in tests/functional/identity/log_in.spec.ts.
 * - T-UI-036: `/` renders on the server for a guest, with links to sign up
 *   and sign in, and for a signed-in user, with a greeting by first name
 *   and the sign-out button; staff whose role may open the admin pages get
 *   a link to them once the session holds fresh MFA (a session signed in
 *   with a password only would meet the `/mfa` redirect); other roles never.
 * - T-SEC-036: the page's prop key set, the shared props and `admin_link`.
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
  return { status: response.status, html, page: JSON.parse(json ?? 'null') as Page | null }
}

test.group('T-UI-036 the interim home page', () => {
  test('T-UI-036 a guest gets the home page, rendered on the server, with links to sign up and sign in', async ({
    assert,
  }) => {
    const { status, html, page } = await htmlPage(testBrowser(), '/')
    assert.equal(status, 200)
    assert.equal(page?.component, 'storefront/home')
    assert.isFalse(page?.props.admin_link)
    // Server-rendered markup (ADR-0003), not an empty root.
    assert.include(html, 'DripNepal is being built')
    assert.include(html, 'href="/signup"')
    assert.include(html, 'href="/login"')
    assert.notInclude(html, 'Sign out')
    assert.notInclude(html, 'href="/admin/logistics"')
  })

  test('T-UI-036 a signed-in user is greeted by first name and gets the sign-out button', async ({
    assert,
  }) => {
    const user = await UserFactory.merge({ fullName: 'Sita Kumari Shrestha' }).create()
    const browser = await signIn(user.id)
    const { status, html, page } = await htmlPage(browser, '/')
    assert.equal(status, 200)
    assert.equal(page?.component, 'storefront/home')
    assert.include(html, 'Welcome, Sita')
    assert.notInclude(html, 'Welcome, Sita Kumari')
    assert.include(html, 'Sign out')
    assert.notInclude(html, 'href="/signup"')
    assert.isFalse(page?.props.admin_link)
    assert.notInclude(html, 'href="/admin/logistics"')
  })

  test('T-UI-036 the admin link: {role} with MFA {mfa} sees it: {linked}')
    .with([
      { role: 'platform_admin', mfa: true, linked: true },
      { role: 'platform_admin', mfa: false, linked: false },
      { role: 'support_agent', mfa: true, linked: false },
    ])
    .run(async ({ assert }, { role, mfa, linked }) => {
      const staff = await staffUser(role)
      const browser = await signIn(staff, mfa ? new Date().toISOString() : undefined)
      const { status, html, page } = await htmlPage(browser, '/')
      assert.equal(status, 200)
      assert.equal(page?.props.admin_link, linked)
      assert.equal(html.includes('href="/admin/logistics"'), linked)
    })

  test('T-SEC-036 / sends the shared props and admin_link, nothing else, to a guest and to a signed-in user', async ({
    assert,
  }) => {
    const guest = testBrowser()
    await guest.open('/')
    const guestProps = await guest.props('/')
    assert.sameMembers(Object.keys(guestProps), [...SHARED_PROPS, 'admin_link'])
    assert.isNull(guestProps.user)

    const user = await UserFactory.create()
    const member = await signIn(user.id)
    await member.open('/')
    const memberProps = await member.props('/')
    assert.sameMembers(Object.keys(memberProps), [...SHARED_PROPS, 'admin_link'])
    assert.deepEqual(memberProps.user, { id: user.id, email: user.email, full_name: user.fullName })
  })
})
