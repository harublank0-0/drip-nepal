import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { withTx } from '#modules/platform/tx'
import { signIn } from '#tests/support/courier_http'
import { enrolledStaff, rawTokenOf, staffWithoutTotp } from '#tests/support/identity'
import { useJobBoss } from '#tests/support/jobs'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The `/mfa` page (docs/08 §2.3, §3.1 "MFA"; docs/07 §3.3 row 3, §3.9; M1
 * part 5). What the server decides is tested here; what the browser does
 * after it renders (dropping the token from the URL, the sign-in in place,
 * the setup key, the move to `redirect_to`, the countdown) is checked in a
 * browser.
 * - T-UI-036: `/mfa` opens signed in or not, renders on the server, sends
 *   `Referrer-Policy: no-referrer` and `Cache-Control: no-store`, and never
 *   redeems the token of its URL; a guest gets the sign-in form without the
 *   sign-up link; staff without TOTP get the enrolment state, with the
 *   password field when the link carries a token and the "open the email"
 *   text without one; enrolled staff get one code field with
 *   `autocomplete="one-time-code"` and the numeric keyboard; anyone else
 *   is told the page is for staff; a browser whose session went stale opens
 *   it as a guest, with no redirect, so no token reaches a `return_to`.
 * - T-SEC-036: the prop key set is the shared props and `mfa_state`.
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

type Page = { component: string; props: Record<string, unknown> }

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

async function mfaToken(userId: string) {
  const issued = await withTx((trx) => issueUserToken(trx, userId, 'mfa_enrollment'))
  return { id: issued.id, raw: await rawTokenOf(issued.id, 'mfa_enrollment') }
}

test.group('T-UI-036 /mfa', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-UI-036 the enrolment link opens for a guest: the sign-in form on the server, no sign-up link, no-referrer and no-store, the token unused', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await mfaToken(staff.id)
    const { status, headers, html, page } = await htmlPage(
      testBrowser(),
      `/mfa?token=${encodeURIComponent(token.raw)}`
    )
    assert.equal(status, 200)
    assert.equal(page?.component, 'auth/mfa')
    assert.equal(page?.props.mfa_state, 'sign_in')
    assert.equal(headers.get('referrer-policy'), 'no-referrer')
    assert.equal(headers.get('cache-control'), 'no-store')
    assert.match(html, /<meta[^>]*name="referrer"[^>]*content="no-referrer"/)
    assert.include(html, 'Sign in to continue')
    assert.match(html, /autocomplete="current-password"/i)
    assert.notInclude(html, 'href="/signup')
    const row = await db.from('user_tokens').where('id', token.id).firstOrFail()
    assert.isNull(row.consumed_at)
  })

  test('T-UI-036 staff without TOTP get the enrolment state: the password field with a token, the email text without one [AC-FR-IAM-007-1]', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await mfaToken(staff.id)
    const browser = await signIn(staff.id)

    const withToken = await htmlPage(browser, `/mfa?token=${encodeURIComponent(token.raw)}`)
    assert.equal(withToken.status, 200)
    assert.equal(withToken.page?.props.mfa_state, 'enrol')
    assert.include(withToken.html, 'Set up two-step verification')
    assert.match(withToken.html, /autocomplete="current-password"/i)

    const without = await htmlPage(browser, '/mfa')
    assert.equal(without.page?.props.mfa_state, 'enrol')
    assert.include(without.html, 'Open the setup link in the email we sent you')
    assert.notMatch(without.html, /autocomplete="current-password"/i)
  })

  test('T-UI-036 enrolled staff get one code field with one-time-code and the numeric keyboard [SC 3.3.8]', async ({
    assert,
  }) => {
    const { user } = await enrolledStaff()
    const { status, html, page } = await htmlPage(
      await signIn(user.id),
      '/mfa?return_to=%2Fadmin%2Flogistics'
    )
    assert.equal(status, 200)
    assert.equal(page?.props.mfa_state, 'challenge')
    assert.include(html, 'Enter your code')
    assert.lengthOf(html.match(/autocomplete="one-time-code"/gi) ?? [], 1)
    assert.match(html, /inputmode="numeric"/i)
  })

  test('T-UI-036 a signed-in user who is not staff is told the page is for staff', async ({
    assert,
  }) => {
    const customer = await UserFactory.create()
    const { status, html, page } = await htmlPage(await signIn(customer.id), '/mfa')
    assert.equal(status, 200)
    assert.equal(page?.props.mfa_state, 'not_staff')
    assert.include(html, 'This page is for staff accounts')
  })

  test('T-UI-036 a stale session opens the enrolment link as a guest: 200, no Location, the token unused [docs/07 §3.3 row 3]', async ({
    assert,
  }) => {
    const staff = await staffWithoutTotp()
    const token = await mfaToken(staff.id)
    const browser = await signIn(staff.id)
    await db
      .from('users')
      .where('id', staff.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })

    const { status, headers, page } = await htmlPage(
      browser,
      `/mfa?token=${encodeURIComponent(token.raw)}`
    )
    assert.equal(status, 200)
    assert.isNull(headers.get('location'))
    assert.equal(page?.props.mfa_state, 'sign_in')
    assert.isNull(page?.props.user)
    const row = await db.from('user_tokens').where('id', token.id).firstOrFail()
    assert.isNull(row.consumed_at)
    assert.lengthOf(await db.from('sessions').where('user_id', staff.id), 0)
  })

  test('T-SEC-036 /mfa sends the shared props and mfa_state, nothing else', async ({ assert }) => {
    const browser = testBrowser()
    await browser.open('/mfa')
    const props = await browser.props('/mfa')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'mfa_state'])
  })
})
