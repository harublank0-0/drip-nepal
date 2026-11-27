import { test } from '@japa/runner'
import { UserFactory } from '#database/factories/user_factory'
import { signIn, staffUser } from '#tests/support/courier_http'
import { appUrl } from '#config/storefront'
import { testBrowser, type Browser } from '#tests/support/browser'
import { activeShop, listed } from '#tests/support/listings'

/*
 * The storefront home `/` (docs/08 §2.2, §3.1; R1-S part 3d-iii-b-2), which
 * replaced the interim page of M1 part 3 in place, and where every redirect
 * after sign-in, after a verified link and away from the guest pages lands.
 * The sign-out itself is in tests/functional/identity/log_in.spec.ts.
 *
 * - T-UI-051: `/` renders on the server with its heading, the two audience
 *   pages, the canonical URL and a tile per top-level category; the newest
 *   listed products, at most eight, newest first, and no row without any;
 *   the header's sign-out button for a signed-in user; staff whose role may
 *   open the admin pages get a link to them once the session holds fresh
 *   MFA, other roles never.
 * - T-SEC-036: the page's prop key set, the shared props and its own.
 */

const SHARED_PROPS = [
  'errors',
  'flash',
  'support',
  'appUrl',
  'theme',
  'user',
  'current_staff',
  'seller_shops',
  'current_shop',
  'request_id',
]

const HOME_PROPS = ['admin_link', 'new_arrivals', 'categories', 'seo']

type Page = { component: string; props: Record<string, unknown> }

// The rendered markup only: the page's props travel in the HTML too, as JSON.
const markup = (html: string) =>
  html.replaceAll(/<script[\s\S]*?<\/script>/g, '').replaceAll(/data-page="[^"]*"/g, '')

// An HTML answer with its Inertia page object, whatever its status.
async function htmlPage(browser: Browser, path: string) {
  const response = await browser.request(path, { headers: { Accept: 'text/html' } })
  const html = await response.text()
  const json = /<script data-page="app" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1]
  return { status: response.status, html, page: JSON.parse(json ?? 'null') as Page | null }
}

test.group('T-UI-051 the storefront home', () => {
  test('T-UI-051 a guest gets the home page, rendered on the server, with its ways in', async ({
    assert,
  }) => {
    const { status, html, page } = await htmlPage(testBrowser(), '/')
    assert.equal(status, 200)
    assert.equal(page?.component, 'storefront/home')
    assert.isFalse(page?.props.admin_link)
    const body = markup(html)
    // Server-rendered markup (ADR-0003), not an empty root.
    assert.match(body, /<h1[^>]*>Fashion from shops across Nepal<\/h1>/)
    assert.include(body, 'href="/men"')
    assert.include(body, 'href="/women"')
    assert.include(body, `<link rel="canonical" href="${appUrl}/"`)
    assert.include(body, 'href="/login"')
    assert.notInclude(body, 'Sign out')
    assert.notInclude(body, 'href="/admin/logistics"')
    // Every top-level category the storefront lists, as a tile, and only those.
    const tiles = page?.props.categories as { slug: string }[]
    assert.deepEqual(
      tiles.map((tile) => tile.slug),
      ['clothing', 'traditional-wear', 'footwear', 'bags', 'watches', 'accessories']
    )
    for (const tile of tiles) assert.include(body, `href="/c/${tile.slug}"`, tile.slug)
  })

  test('T-UI-051 the newest products, at most eight; no row without them', async ({ assert }) => {
    const empty = await htmlPage(testBrowser(), '/')
    assert.deepEqual(empty.page?.props.new_arrivals, [])
    assert.notInclude(markup(empty.html), 'New arrivals')
    const shop = await activeShop()
    for (let n = 1; n <= 9; n++) {
      await listed(shop, {
        title: `Arrival ${n}`,
        publishedAt: `2026-11-${String(n).padStart(2, '0')}T00:00:00Z`,
      })
    }
    const { html, page } = await htmlPage(testBrowser(), '/')
    const cards = page?.props.new_arrivals as { title: string; href: string }[]
    assert.deepEqual(
      cards.map((card) => card.title),
      [
        'Arrival 9',
        'Arrival 8',
        'Arrival 7',
        'Arrival 6',
        'Arrival 5',
        'Arrival 4',
        'Arrival 3',
        'Arrival 2',
      ]
    )
    const body = markup(html)
    assert.include(body, 'New arrivals')
    assert.include(body, `href="${cards[0].href}"`)
  })

  test('T-UI-051 a signed-in user gets the header with the sign-out button', async ({ assert }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    const { status, html, page } = await htmlPage(browser, '/')
    assert.equal(status, 200)
    assert.equal(page?.component, 'storefront/home')
    assert.include(markup(html), 'Sign out')
    assert.isFalse(page?.props.admin_link)
    assert.notInclude(html, 'href="/admin/logistics"')
  })

  test('T-UI-051 the admin link: {role} with MFA {mfa} sees it: {linked}')
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

  test('T-SEC-036 / sends the shared props and its own, nothing else, to a guest and to a signed-in user', async ({
    assert,
  }) => {
    const guest = testBrowser()
    await guest.open('/')
    const guestProps = await guest.props('/')
    assert.sameMembers(Object.keys(guestProps), [...SHARED_PROPS, ...HOME_PROPS])
    assert.isNull(guestProps.user)

    const user = await UserFactory.create()
    const member = await signIn(user.id)
    await member.open('/')
    const memberProps = await member.props('/')
    assert.sameMembers(Object.keys(memberProps), [...SHARED_PROPS, ...HOME_PROPS])
    assert.deepEqual(memberProps.user, { id: user.id, email: user.email, full_name: user.fullName })
  })
})
