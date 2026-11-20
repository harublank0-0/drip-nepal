import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { MessageBuilder } from '@adonisjs/core/helpers'
import User from '#models/user'
import { middleware } from '#start/kernel'
import { startSession } from '#controllers/support/session'
import { resolveSellerContext } from '#modules/shops/queries'
import { UserFactory } from '#database/factories/user_factory'
import { shopValues } from '#tests/support/schema_rows'
import { testBrowser, type Browser } from '#tests/support/browser'

/*
 * The seller membership guard of M0 (docs/09 §12.4, docs/06 §4.4 steps 1,
 * 2 and 5), against the baseline schema:
 * - T-SHOP-001: `resolveSellerContext` finds the shop by its slug, a case
 *   variant or a retired slug, and the caller as its owner or an active
 *   member; anyone else, and an unknown slug, get null.
 * - T-SEC-001 case (a), the `seller_context` part: another shop's slug, or
 *   its retired slug, answers 404 with the body of an unknown slug, and a
 *   page never answers 301 for a shop the caller is not in.
 * - T-SEC-009, the seller idle limit of docs/07 §3.4: 12 hours since
 *   `seller_seen_at` (else `authenticated_at`) ends the session, checked
 *   only after the caller is found in the shop; only user-initiated
 *   requests refresh it, never a poll. Timestamps are set in the past
 *   instead of moving a clock.
 * The guarded routes exist only in this test run, in the shapes of a seller
 * page and a seller API route, behind `auth` then `sellerContext`, as
 * T-SEC-037 requires. Signing in uses `startSession`, as M1's `logIn` will.
 */

router.get('/__test__/seller-context/sign-in/:id', async (ctx) => {
  const user = await User.findOrFail(ctx.params.id)
  await startSession(ctx, user, user.securityStamp)
  // Session timestamps set in the past, or dropped, stand in for a clock.
  const qs = ctx.request.qs()
  for (const key of ['seller_seen_at', 'authenticated_at']) {
    if (typeof qs[key] === 'string') ctx.session.put(key, qs[key])
  }
  if (typeof qs.forget === 'string') ctx.session.forget(qs.forget)
  return { session_id: ctx.session.sessionId }
})

router
  .get('/api/v1/__test__/seller-context/me', ({ auth }) => ({ user_id: auth.user!.id }))
  .use(middleware.auth())

const shopOf = (ctx: { shop: { id: string; slug: string; actor: string } }) => ({
  shop_id: ctx.shop.id,
  slug: ctx.shop.slug,
  actor: ctx.shop.actor,
})

router
  .group(() => {
    router
      .get('products', (ctx) => shopOf(ctx))
      .use(middleware.sellerContext({ requirement: 'shop.member' }))
  })
  .prefix('/__test__/seller/:shopSlug')
  .use(middleware.auth())

router
  .group(() => {
    router
      .get('/', (ctx) => shopOf(ctx))
      .use(middleware.sellerContext({ requirement: 'shop.member' }))
    router
      .post('/', (ctx) => shopOf(ctx))
      .use(middleware.sellerContext({ requirement: 'shop.member' }))
  })
  .prefix('/api/v1/__test__/seller/shops/:shopSlug')
  .use(middleware.auth())

type Shop = { id: string; slug: string; ownerId: string }

async function createShop(): Promise<Shop> {
  const owner = await UserFactory.create()
  const values = shopValues(owner.id)
  const [row] = await db.table('shops').insert(values).returning('id')
  return { id: row.id as string, slug: values.slug as string, ownerId: owner.id }
}

async function addMember(shopId: string, role: string, status: 'active' | 'removed' = 'active') {
  const member = await UserFactory.create()
  await db.table('shop_memberships').insert({
    shop_id: shopId,
    user_id: member.id,
    role,
    status,
    removed_at: status === 'removed' ? new Date() : null,
  })
  return member.id
}

// A slug the shop used before (docs/04a §6.10).
async function retire(shop: Shop, oldSlug: string) {
  await db
    .table('slug_redirects')
    .insert({ entity_type: 'shop', old_slug: oldSlug, entity_id: shop.id })
  return oldSlug
}

let retiredSequence = 0
const retiredSlug = () => `retired-shop-${++retiredSequence}-${Date.now().toString(36)}`

async function signIn(userId: string, query = '') {
  const user = await User.findOrFail(userId)
  // `security_stamp` comes from the column default.
  await user.refresh()
  const browser = testBrowser()
  const response = await browser.request(`/__test__/seller-context/sign-in/${user.id}${query}`)
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  const { session_id: sessionId } = (await response.json()) as { session_id: string }
  return { browser, sessionId }
}

async function signedIn(userId: string): Promise<Browser> {
  const { browser } = await signIn(userId)
  return browser
}

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

// `seller_seen_at` as the session row holds it, or undefined when the row is gone.
async function sellerSeenAt(sessionId: string) {
  const row = await db.from('sessions').where('id', sessionId).first()
  if (!row) return undefined
  const data = new MessageBuilder().verify<Record<string, unknown>>(row.data, row.id)
  return data?.seller_seen_at
}

// A page's HTML with its request ID and the requested slug, which the page
// echoes in its URL, taken out, so two pages can be compared.
async function pageText(response: Response, slug: string) {
  const body = await response.text()
  const text = body.replaceAll(slug, '<slug>')
  const requestId = response.headers.get('x-request-id')
  return requestId ? text.replaceAll(requestId, '<request-id>') : text
}

// A problem body without the members that differ on every request.
async function problemBody(response: Response) {
  const body = (await response.json()) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'request_id' && key !== 'instance')
  )
}

test.group('T-SHOP-001 resolveSellerContext', () => {
  test('the owner, by the current slug', async ({ assert }) => {
    const shop = await createShop()
    const found = await resolveSellerContext(shop.slug, shop.ownerId)
    assert.deepInclude(found, { id: shop.id, slug: shop.slug, actor: 'owner', viaRedirect: false })
    assert.equal(found?.status, 'pending_review')
    assert.isNull(found?.suspensionMode)
  })

  test('a case variant of the slug finds the shop, and is not a redirect', async ({ assert }) => {
    const shop = await createShop()
    const found = await resolveSellerContext(shop.slug.toUpperCase(), shop.ownerId)
    assert.deepInclude(found, { id: shop.id, slug: shop.slug, viaRedirect: false })
  })

  test('a retired slug finds the shop, with its current slug, as a redirect', async ({
    assert,
  }) => {
    const shop = await createShop()
    const oldSlug = await retire(shop, retiredSlug())
    const found = await resolveSellerContext(oldSlug, shop.ownerId)
    assert.deepInclude(found, { id: shop.id, slug: shop.slug, actor: 'owner', viaRedirect: true })
    const variant = await resolveSellerContext(oldSlug.toUpperCase(), shop.ownerId)
    assert.deepInclude(variant, { id: shop.id, viaRedirect: true })
  })

  test('an active member gets their role', async ({ assert }) => {
    const shop = await createShop()
    for (const role of ['manager', 'catalog_editor', 'order_fulfiller', 'viewer']) {
      const memberId = await addMember(shop.id, role)
      const found = await resolveSellerContext(shop.slug, memberId)
      assert.deepInclude(found, { id: shop.id, actor: role }, role)
    }
  })

  test('a removed member, a stranger and an unknown slug get null', async ({ assert }) => {
    const shop = await createShop()
    const removedId = await addMember(shop.id, 'manager', 'removed')
    const stranger = await UserFactory.create()
    assert.isNull(await resolveSellerContext(shop.slug, removedId))
    assert.isNull(await resolveSellerContext(shop.slug, stranger.id))
    assert.isNull(await resolveSellerContext('no-such-shop-anywhere', shop.ownerId))
  })

  test('membership of one shop gives nothing in another, by either slug', async ({ assert }) => {
    const mine = await createShop()
    const theirs = await createShop()
    const oldSlug = await retire(theirs, retiredSlug())
    assert.isNull(await resolveSellerContext(theirs.slug, mine.ownerId))
    assert.isNull(await resolveSellerContext(oldSlug, mine.ownerId))
  })

  test('a value not shaped like a slug gets null, without a query', async ({ assert }) => {
    const shop = await createShop()
    // A NUL byte would make PostgreSQL refuse the text if it reached the query.
    for (const value of ['a\u0000b', 'ab', 'a b', '-shop', 'shop-', 'x'.repeat(41)]) {
      assert.isNull(await resolveSellerContext(value, shop.ownerId), JSON.stringify(value))
    }
  })

  test('a retired category slug is not a shop slug', async ({ assert }) => {
    const shop = await createShop()
    const oldSlug = retiredSlug()
    await db
      .table('slug_redirects')
      .insert({ entity_type: 'category', old_slug: oldSlug, entity_id: shop.id })
    assert.isNull(await resolveSellerContext(oldSlug, shop.ownerId))
  })
})

test.group('T-SEC-001 (a) seller_context answers 404 outside the caller’s shops', () => {
  test('the owner and an active member are served the shop', async ({ assert }) => {
    const shop = await createShop()
    const memberId = await addMember(shop.id, 'viewer')
    for (const [userId, actor] of [
      [shop.ownerId, 'owner'],
      [memberId, 'viewer'],
    ]) {
      const browser = await signedIn(userId)
      const page = await browser.request(`/__test__/seller/${shop.slug}/products`)
      assert.equal(page.status, 200, actor)
      assert.deepEqual(await page.json(), { shop_id: shop.id, slug: shop.slug, actor })
      const api = await browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
      assert.equal(api.status, 200, actor)
    }
  })

  test('another shop, by its slug or retired slug, is the 404 of an unknown slug', async ({
    assert,
  }) => {
    const mine = await createShop()
    const theirs = await createShop()
    const oldSlug = await retire(theirs, retiredSlug())
    const browser = await signedIn(mine.ownerId)

    const unknown = await browser.request('/api/v1/__test__/seller/shops/no-such-shop-anywhere')
    assert.equal(unknown.status, 404)
    const expected = await problemBody(unknown)
    assert.equal(expected.code, 'NOT_FOUND')
    for (const slug of [theirs.slug, oldSlug]) {
      const api = await browser.request(`/api/v1/__test__/seller/shops/${slug}`)
      assert.equal(api.status, 404, slug)
      assert.deepEqual(await problemBody(api), expected, slug)
      const page = await browser.request(`/__test__/seller/${slug}/products`)
      assert.equal(page.status, 404, slug)
      assert.isNull(page.headers.get('location'), slug)
    }
  })

  test('a removed member and a signed-out visitor are refused', async ({ assert }) => {
    const shop = await createShop()
    const removedId = await addMember(shop.id, 'manager', 'removed')
    const removed = await signedIn(removedId)
    const api = await removed.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(api.status, 404)

    const visitor = testBrowser()
    const signedOut = await visitor.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(signedOut.status, 401)
  })

  test('the caller’s own retired slug: a page answers 301, the API carries on', async ({
    assert,
  }) => {
    const shop = await createShop()
    const oldSlug = await retire(shop, retiredSlug())
    const browser = await signedIn(shop.ownerId)

    const query = '?tab=drafts&tab=live&q=%20blue'
    const page = await browser.request(`/__test__/seller/${oldSlug}/products${query}`)
    assert.equal(page.status, 301)
    assert.equal(page.headers.get('location'), `/__test__/seller/${shop.slug}/products${query}`)

    const api = await browser.request(`/api/v1/__test__/seller/shops/${oldSlug}`)
    assert.equal(api.status, 200)
    assert.deepEqual(await api.json(), { shop_id: shop.id, slug: shop.slug, actor: 'owner' })
  })
})

test.group('T-SEC-001 (a) seller_context: pages, case variants and malformed slugs', () => {
  test('a page for another shop is the 404 page of an unknown slug', async ({ assert }) => {
    const mine = await createShop()
    const theirs = await createShop()
    const oldSlug = await retire(theirs, retiredSlug())
    const browser = await signedIn(mine.ownerId)

    const unknown = await browser.request('/__test__/seller/no-such-shop-anywhere/products')
    assert.equal(unknown.status, 404)
    const expected = await pageText(unknown, 'no-such-shop-anywhere')
    for (const slug of [theirs.slug, oldSlug]) {
      const page = await browser.request(`/__test__/seller/${slug}/products`)
      assert.equal(page.status, 404, slug)
      assert.equal(await pageText(page, slug), expected, slug)
    }
  })

  test('a slug that cannot be a shop slug is the 404 of an unknown slug', async ({ assert }) => {
    const shop = await createShop()
    const browser = await signedIn(shop.ownerId)
    const unknown = await browser.request('/api/v1/__test__/seller/shops/no-such-shop-anywhere')
    const expected = await problemBody(unknown)
    for (const slug of ['a%00b', 'ab', `${'x'.repeat(41)}`]) {
      const api = await browser.request(`/api/v1/__test__/seller/shops/${slug}`)
      assert.equal(api.status, 404, slug)
      assert.deepEqual(await problemBody(api), expected, slug)
    }
  })

  test('a case variant of the slug is served, without a redirect', async ({ assert }) => {
    const shop = await createShop()
    const browser = await signedIn(shop.ownerId)
    const page = await browser.request(`/__test__/seller/${shop.slug.toUpperCase()}/products`)
    assert.equal(page.status, 200)
    assert.deepEqual(await page.json(), { shop_id: shop.id, slug: shop.slug, actor: 'owner' })
  })
})

test.group('T-SEC-009 the seller idle limit', () => {
  test('12 hours since seller_seen_at ends the session', async ({ assert }) => {
    const shop = await createShop()
    const { browser, sessionId } = await signIn(shop.ownerId, `?seller_seen_at=${hoursAgo(13)}`)

    const api = await browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(api.status, 401)
    const problem = await problemBody(api)
    assert.equal(problem.code, 'UNAUTHENTICATED')
    assert.isUndefined(await sellerSeenAt(sessionId))
    const after = await browser.request('/api/v1/__test__/seller-context/me')
    assert.equal(after.status, 401)
  })

  test('an idle page visit is sent to /login', async ({ assert }) => {
    const shop = await createShop()
    const { browser } = await signIn(shop.ownerId, `?seller_seen_at=${hoursAgo(13)}`)
    const page = await browser.request(`/__test__/seller/${shop.slug}/products`)
    assert.oneOf(page.status, [302, 303])
    assert.match(page.headers.get('location') ?? '', /^\/login(?:\?|$)/)
  })

  test('without seller_seen_at, the clock starts at authenticated_at', async ({ assert }) => {
    const shop = await createShop()
    const idle = await signIn(
      shop.ownerId,
      `?forget=seller_seen_at&authenticated_at=${hoursAgo(13)}`
    )
    const refused = await idle.browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(refused.status, 401)

    const fresh = await signIn(shop.ownerId, '?forget=seller_seen_at')
    const served = await fresh.browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(served.status, 200)
  })

  test('an idle caller outside the shop gets the 404 and keeps the session', async ({ assert }) => {
    const shop = await createShop()
    const stranger = await UserFactory.create()
    const { browser } = await signIn(stranger.id, `?seller_seen_at=${hoursAgo(13)}`)
    const api = await browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(api.status, 404)
    const me = await browser.request('/api/v1/__test__/seller-context/me')
    assert.equal(me.status, 200)
  })

  test('an unsafe API call and a page visit refresh the clock; a read and a poll do not', async ({
    assert,
  }) => {
    const shop = await createShop()
    const { browser, sessionId } = await signIn(shop.ownerId, `?seller_seen_at=${hoursAgo(1)}`)
    const start = await sellerSeenAt(sessionId)

    await browser.request(`/api/v1/__test__/seller/shops/${shop.slug}`)
    assert.equal(await sellerSeenAt(sessionId), start, 'an API read')
    await browser.request(`/__test__/seller/${shop.slug}/products`, { headers: { 'X-Poll': '1' } })
    assert.equal(await sellerSeenAt(sessionId), start, 'a poll')

    const post = await browser.post(`/api/v1/__test__/seller/shops/${shop.slug}`, {})
    assert.equal(post.status, 200)
    const afterPost = await sellerSeenAt(sessionId)
    assert.isAbove(Date.parse(String(afterPost)), Date.parse(String(start)), 'an unsafe call')

    const { browser: other, sessionId: otherId } = await signIn(
      shop.ownerId,
      `?seller_seen_at=${hoursAgo(1)}`
    )
    const before = await sellerSeenAt(otherId)
    await other.request(`/__test__/seller/${shop.slug}/products`)
    assert.isAbove(
      Date.parse(String(await sellerSeenAt(otherId))),
      Date.parse(String(before)),
      'a page visit'
    )
  })
})
