import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { FACTORY_PASSWORD, UserFactory } from '#database/factories/user_factory'
import { createAddress } from '#modules/identity/actions/create_address'
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
  'seller_shops',
  'current_shop',
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

/*
 * The address book page, `/account/addresses` (docs/08 §2.4; M1 part 6b):
 * - T-UI-038: it opens for a signed-in user, `pending_verification`
 *   included, rendered in the browser and never stored; a guest is sent to
 *   `/login` with the page as `return_to`; T-SEC-043, with `encryptHistory`.
 * - T-SEC-036: its props are the shared props, `addresses` (what
 *   `listAddresses` answers: the phone as its last four digits, no
 *   ciphertext) and `provinces` (what `listProvinces` answers).
 */
const ADDRESS_MEMBERS = [
  'id',
  'label',
  'recipient_name',
  'recipient_phone_last4',
  'province_code',
  'province_name',
  'district_code',
  'district_name',
  'local_level_code',
  'local_level_name',
  'ward_no',
  'area_tole',
  'street_landmark',
  'postal_code',
  'is_default',
]

test.group('T-UI-038 the address book page', () => {
  test('T-UI-038 /account/addresses opens for a signed-in user, rendered in the browser and never stored', async ({
    assert,
  }) => {
    const { browser } = await signedIn()
    const { status, headers, html, page } = await htmlPage(browser, '/account/addresses')
    assert.equal(status, 200)
    assert.equal(page?.component, 'account/addresses')
    assert.equal(headers.get('cache-control'), 'private, no-store')
    // Account pages render in the browser (config/inertia.ts): no server markup.
    assert.notInclude(html, 'Add an address')
    assert.isTrue(page?.encryptHistory, 'T-SEC-043')
  })

  test('T-UI-038 a pending_verification user opens /account/addresses, with an empty address book [AC-FR-IAM-002-2]', async ({
    assert,
  }) => {
    const { browser } = await signedIn('pending_verification')
    const { status } = await htmlPage(browser, '/account/addresses')
    assert.equal(status, 200)
    const props = await pageProps(browser, '/account/addresses')
    assert.deepEqual(props.addresses, [])
  })

  test('T-UI-038 a guest is sent to /login with /account/addresses as return_to', async ({
    assert,
  }) => {
    const response = await testBrowser().request('/account/addresses', {
      headers: { Accept: 'text/html' },
    })
    await response.arrayBuffer()
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location') ?? '', 'http://localhost')
    assert.equal(location.pathname, '/login')
    assert.equal(location.searchParams.get('return_to'), '/account/addresses')
  })
})

test.group('T-SEC-036 the address book page props', () => {
  test('T-SEC-036 /account/addresses sends the shared props, addresses and provinces, with the phone as its last four digits only', async ({
    assert,
  }) => {
    const { user, browser } = await signedIn()
    const id = await createAddress(user.id, {
      label: 'Home',
      recipientName: 'Maya Gurung',
      recipientPhoneE164: '+9779861234567',
      place: { provinceCode: '3', districtCode: '306', localLevelCode: '30608', wardNo: 5 },
      areaTole: 'Lazimpat',
      streetLandmark: 'Opposite the embassy gate',
      isDefault: false,
      sessionStamp: user.securityStamp,
    })
    // Another user's address never reaches the page.
    const other = await UserFactory.create()
    await other.refresh()
    await createAddress(other.id, {
      label: 'Not mine',
      recipientName: 'Hari Bista',
      recipientPhoneE164: '+9779851234567',
      place: { provinceCode: '4', districtCode: '405', localLevelCode: '40504', wardNo: 8 },
      areaTole: 'Lakeside',
      streetLandmark: null,
      isDefault: false,
      sessionStamp: other.securityStamp,
    })

    const props = await pageProps(browser, '/account/addresses')
    assert.sameMembers(Object.keys(props), [...SHARED_PROPS, 'addresses', 'provinces'])
    const addresses = props.addresses as Record<string, unknown>[]
    assert.lengthOf(addresses, 1)
    assert.sameMembers(Object.keys(addresses[0]), ADDRESS_MEMBERS)
    assert.deepEqual(addresses[0], {
      id,
      label: 'Home',
      recipient_name: 'Maya Gurung',
      recipient_phone_last4: '4567',
      province_code: '3',
      province_name: 'Bagmati',
      district_code: '306',
      district_name: 'Kathmandu',
      local_level_code: '30608',
      local_level_name: 'Kathmandu Metropolitan City',
      ward_no: 5,
      area_tole: 'Lazimpat',
      street_landmark: 'Opposite the embassy gate',
      postal_code: '3060805',
      is_default: true,
    })

    const row = await db.from('user_addresses').where('id', id).firstOrFail()
    const written = JSON.stringify(props)
    for (const secret of [
      '9861234567',
      '+9779861234567',
      row.recipient_name_enc,
      row.recipient_phone_enc,
      row.area_tole_enc,
      row.street_landmark_enc,
      'Hari Bista',
      'Lakeside',
    ]) {
      assert.notInclude(written, secret)
    }
    const addressText = JSON.stringify(addresses)
    for (const member of ['_enc', 'user_id', 'archived_at']) {
      assert.notInclude(addressText, member)
    }

    assert.deepEqual(props.provinces, [
      { code: '1', name: 'Koshi' },
      { code: '2', name: 'Madhesh' },
      { code: '3', name: 'Bagmati' },
      { code: '4', name: 'Gandaki' },
      { code: '5', name: 'Lumbini' },
      { code: '6', name: 'Karnali' },
      { code: '7', name: 'Sudurpashchim' },
    ])
  })
})
