import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
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
 * The guarded routes exist only in this test run, in the shapes of a seller
 * page and a seller API route, behind `auth` then `sellerContext`, as
 * T-SEC-037 requires. Signing in uses `startSession`, as M1's `logIn` will.
 */

router.get('/__test__/seller-context/sign-in/:id', async (ctx) => {
  const user = await User.findOrFail(ctx.params.id)
  await startSession(ctx, user, user.securityStamp)
  return 'signed in'
})

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

async function signedIn(userId: string): Promise<Browser> {
  const user = await User.findOrFail(userId)
  // `security_stamp` comes from the column default.
  await user.refresh()
  const browser = testBrowser()
  const response = await browser.request(`/__test__/seller-context/sign-in/${user.id}`)
  if (response.status !== 200) throw new Error(`sign-in answered ${response.status}`)
  return browser
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

    const page = await browser.request(`/__test__/seller/${oldSlug}/products?tab=drafts`)
    assert.equal(page.status, 301)
    assert.equal(page.headers.get('location'), `/__test__/seller/${shop.slug}/products?tab=drafts`)

    const api = await browser.request(`/api/v1/__test__/seller/shops/${oldSlug}`)
    assert.equal(api.status, 200)
    assert.deepEqual(await api.json(), { shop_id: shop.id, slug: shop.slug, actor: 'owner' })
  })
})
