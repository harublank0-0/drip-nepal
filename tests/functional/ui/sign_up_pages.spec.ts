import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { LEGAL_DOCUMENTS, currentLegalVersions } from '#modules/platform/legal_documents'
import { withTx } from '#modules/platform/tx'
import { signIn } from '#tests/support/courier_http'
import { rawTokenOf } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The sign-up and email-verification pages (docs/08 §2.3, §3.1; 02 J-04;
 * M1 part 2b). What the server decides is tested here; what the browser
 * does after it renders (the form, the token post, the countdown) is
 * checked in a browser.
 * - T-UI-036: `/signup` renders on the server for a guest, with its fields'
 *   `autocomplete` tokens, the 18+ and marketing boxes unticked, and links
 *   to the terms of use and the privacy notice in the versions `signUp`
 *   records (AC-FR-IAM-001-6, AC-J04-05); a signed-in user is sent away
 *   (02 J-04 "Permissions"); `/verify-email` opens signed in or not, sends
 *   no referrer, never redeems the token of its URL, and gives the page the
 *   status that decides what it offers.
 * - T-SEC-036: each page's prop key set: the shared props and its own.
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

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length

test.group('T-UI-036 /signup', () => {
  test('T-UI-036 a guest gets the form, rendered on the server, with every box unticked [AC-J04-05]', async ({
    assert,
  }) => {
    const { status, html, page } = await htmlPage(testBrowser(), '/signup')
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/signup')
    // Server-rendered markup (ADR-0003), not an empty root.
    assert.include(html, 'Create your account')
    // The autocomplete tokens of docs/08 §6.5 and §9.3 (SC 1.3.5, SC 3.3.8).
    for (const token of ['name', 'email', 'new-password', 'tel-national']) {
      // React writes the attribute as `autoComplete`; HTML attribute names ignore case.
      assert.match(html, new RegExp(`autocomplete="${token}"`, 'i'))
    }
    assert.include(html, 'type="tel"')
    // The 18+ box and the two marketing boxes, none ticked (FR-IAM-013, OD-24).
    assert.equal(count(html, /role="checkbox"/g), 3)
    assert.notInclude(html, 'aria-checked="true"')
  })

  test('T-UI-036 the page links the terms and the privacy notice in the versions signUp records [AC-FR-IAM-001-6]', async ({
    assert,
  }) => {
    const { html, page } = await htmlPage(testBrowser(), '/signup')
    const links = page?.props.legal_documents as { slug: string; version: string }[]
    assert.deepEqual(
      Object.fromEntries(links.map((link) => [link.slug, link.version])),
      currentLegalVersions()
    )
    // The form's own links, rendered: a new tab, said in the link, then the version as text.
    // The footer's links carry no version, and the page JSON writes it as `"version":"…"`.
    for (const [slug, title] of [
      ['terms', 'Terms of use'],
      ['privacy', 'Privacy notice'],
    ] as const) {
      const version = LEGAL_DOCUMENTS[slug].version
      assert.match(
        html,
        new RegExp(
          `href="/legal/${slug}" target="_blank"[^>]*>${title}[\\s\\S]*?\\(opens in a new tab\\)</span></a><span>version ${version}`
        ),
        slug
      )
    }
  })

  test('T-UI-036 a signed-in user is sent away from the sign-up page', async ({ assert }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    const response = await browser.request('/signup', { headers: { Accept: 'text/html' } })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/')
  })

  test('T-SEC-036 /signup sends the shared props and the legal links, nothing else', async ({
    assert,
  }) => {
    const props = await pageProps(testBrowser(), '/signup')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'legal_documents'])
    assert.deepEqual(props.legal_documents, [
      { slug: 'terms', version: LEGAL_DOCUMENTS.terms.version, is_final: false },
      { slug: 'privacy', version: LEGAL_DOCUMENTS.privacy.version, is_final: false },
    ])
    assert.isNull(props.user)
  })
})

test.group('T-UI-036 /verify-email', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-036 a guest opens it; it sends no referrer and offers sign-in, never an email field', async ({
    assert,
  }) => {
    const { status, headers, html, page } = await htmlPage(testBrowser(), '/verify-email')
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/verify_email')
    assert.isNull(page?.props.account_status)
    // A token page (docs/07 TM-14, §7.3): the header and, for the page's own requests, the meta tag.
    assert.equal(headers.get('referrer-policy'), 'no-referrer')
    // Its answer holds the token URL, and for a signed-in user their email: never stored.
    assert.equal(headers.get('cache-control'), 'no-store')
    assert.match(html, /<meta[^>]*name="referrer"[^>]*content="no-referrer"/)
    assert.include(html, 'Sign in to get a new link')
    assert.include(html, `href="/login?return_to=${encodeURIComponent('/verify-email')}"`)
    assert.notInclude(html, 'type="email"')
  })

  test('T-UI-036 opening the emailed link redeems nothing; the page posts the token [AC-J04-06]', async ({
    assert,
  }) => {
    const user = await UserFactory.apply('pending_verification').create()
    const issued = await withTx((trx) => issueUserToken(trx, user.id, 'email_verification'))
    const token = await rawTokenOf(issued.id, 'email_verification')

    // A mail scanner or a link preview fetches the link: nothing changes.
    const { status, html } = await htmlPage(
      testBrowser(),
      `/verify-email?token=${encodeURIComponent(token)}`
    )
    assert.equal(status, 200)
    // The first render, on the server and in the browser alike, is "checking".
    assert.include(html, 'Checking your link')
    const row = await db.from('user_tokens').where('id', issued.id).firstOrFail()
    assert.isNull(row.consumed_at)
    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    assert.equal(fresh.status, 'pending_verification')
  })

  test('T-UI-036 a signed-in user waiting for verification gets the resend state', async ({
    assert,
  }) => {
    const user = await UserFactory.apply('pending_verification').create()
    const browser = await signIn(user.id)
    const { status, html, page } = await htmlPage(browser, '/verify-email')
    assert.equal(status, 200)
    assert.equal(page?.props.account_status, 'pending_verification')
    assert.include(html, 'Send a new link')
    assert.notInclude(html, 'type="email"')
  })

  test('T-UI-036 a verified user is told the email is already verified', async ({ assert }) => {
    const user = await UserFactory.create()
    const browser = await signIn(user.id)
    const { status, html, page } = await htmlPage(browser, '/verify-email')
    assert.equal(status, 200)
    assert.equal(page?.props.account_status, 'active')
    assert.include(html, 'Your email is already verified')
  })

  test('T-SEC-036 /verify-email sends the shared props and the account status, nothing else', async ({
    assert,
  }) => {
    const user = await UserFactory.apply('pending_verification').create()
    const props = await pageProps(await signIn(user.id), '/verify-email')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'account_status'])
    assert.equal(props.account_status, 'pending_verification')
  })
})
