import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DomainError } from '#exceptions/domain_error'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { updateShopProfile } from '#modules/shops/actions/update_shop_profile'
import { sellerShopJson } from '#transformers/seller/shop_transformer'
import type { Browser } from '#tests/support/browser'
import { send, signIn } from '#tests/support/courier_http'
import { forgetKeys } from '#tests/support/identity'
import { addMember, createOwnerShop, GRIEVANCE, setShopStatus } from '#tests/support/shops'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'

/*
 * `updateShopProfile` ⟳ (docs/06 §13.5, §8; 01 FR-SHOP-003, AC-FR-SHOP-013-2;
 * R1-S part 1b):
 * - T-SHOP-009 (new): the owner changes the public profile (description,
 *   contact email and phone, a landline included), the business details,
 *   the return policy and the grievance contact, and gets 200 with the shop
 *   as `getSellerShop` shows it and the next ETag; the grievance phone is
 *   stored encrypted; an absent member keeps its column, and a request that
 *   changes nothing writes nothing and keeps the version; null clears the
 *   description; the business rules of 04a §6.1 on the result (a
 *   registered business needs its identifiers, a VAT-registered shop its
 *   PAN, an individual's PAN may be removed while OD-16 is open); a member
 *   out of rule answers 422 on it; one `shop.profile_update` audit row names
 *   the changed columns, with the business type and VAT flag values.
 * - T-API-004: no `If-Match`, `*` or a list answers 428; a stale version, a
 *   weak tag or another value 412 `VERSION_CONFLICT` with `current`, the
 *   shop as `getSellerShop` shows it to the caller; nothing is written.
 * - T-SEC-003: server-owned members (`name`, `slug`, `status`,
 *   `commission_rate_bp`, `version`, `shop_id`, an encrypted column, ...)
 *   answer 422 `unknown_field`, and nothing is written.
 * - T-SEC-001: another shop's slug answers the 404 of an unknown one, and
 *   that shop is unchanged.
 * - T-SEC-030: a role without `shop.profile.manage` gets 403; a `manager`
 *   changes the public profile, and any owner-only member (business details,
 *   return policy, grievance contact) answers 403 `FORBIDDEN` with nothing
 *   written (decision of 2026-11-23).
 * - T-SEC-034: the answer and the 412's `current` hold no business details
 *   and no grievance contact for a member who is not the owner.
 * - T-SEC-031: the "profile, shipping" status gate, over HTTP and against a
 *   suspension that commits after `seller_context` read the shop.
 * - T-SEC-102: the audit row holds none of the fixture personal values.
 * Each call charges the user's `shop_profile_update` key, which the limiter
 * store commits on its own connection, so each test deletes the keys of the
 * users it signed in (docs/10 §3.3); the limit itself is in
 * tests/concurrency/shops/update_shop_profile.spec.ts (T-SEC-011).
 */

const shopPath = (slug: string) => `/api/v1/seller/shops/${slug}`
const shopRow = (shopId: string) => db.from('shops').where('id', shopId).firstOrFail()
const profileAudits = (shopId: string) =>
  db.from('audit_logs').where({ action: 'shop.profile_update', shop_id: shopId }).orderBy('id')

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// A problem body without the members that differ on every request.
function stable(body: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key !== 'request_id' && key !== 'instance')
  )
}

// The users this file signed in, whose `shop_profile_update` keys each test deletes.
const made: string[] = []

async function forgetMade() {
  for (const id of made.splice(0)) await forgetKeys('shop_profile_update', id)
}

// The owner's shop and a signed-in browser for `actor`: the owner, or a new member with that role.
async function shopFor(actor = 'owner') {
  const shop = await createOwnerShop()
  const userId = actor === 'owner' ? shop.ownerId : await addMember(shop.shopId, actor)
  made.push(userId)
  return { shop, userId, browser: await signIn(userId) }
}

const patch = (browser: Browser, slug: string, body: unknown, ifMatch: string | null = '"1"') =>
  send(browser, 'PATCH', shopPath(slug), body, ifMatch === null ? {} : { 'If-Match': ifMatch })

test.group('T-SHOP-009 updateShopProfile', (group) => {
  group.each.teardown(forgetMade)

  test('T-SHOP-009 the owner changes the profile and business details: 200 with the shop and the next ETag [AC-FR-SHOP-003-1, AC-FR-SHOP-013-2]', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const response = await patch(browser, shop.slug, {
      description: '  Handmade dhaka and pashmina.  ',
      contact_email: '  Hello@Example.COM ',
      contact_phone: '01-4567890',
      business_type: 'registered_business',
      registration_number: '12345/079/080',
      registration_authority: 'Office of the Company Registrar',
      pan_vat_number: '600123456',
      is_vat_registered: true,
      return_policy_text: 'Returns within 14 days, unworn and with tags.',
      grievance_contact_name: 'Sita Fixture Rai',
      grievance_contact_phone: '+977 985-123-4567',
    })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"2"')
    assert.deepEqual(response.body.data, {
      slug: shop.slug,
      name: shop.name,
      status: 'active',
      suspension_mode: null,
      description: 'Handmade dhaka and pashmina.',
      contact_email: 'hello@example.com',
      contact_phone: '+97714567890',
      business_details: {
        business_type: 'registered_business',
        registration_number: '12345/079/080',
        registration_authority: 'Office of the Company Registrar',
        pan_vat_number: '600123456',
        is_vat_registered: true,
        return_policy_text: 'Returns within 14 days, unworn and with tags.',
      },
      grievance_contact: { name: 'Sita Fixture Rai', phone: '+9779851234567' },
      agreement: {
        version: CURRENT_SELLER_AGREEMENT.version,
        is_final: CURRENT_SELLER_AGREEMENT.isFinal,
        accepted: true,
      },
      version: 2,
    })
    const read = await send(browser, 'GET', shopPath(shop.slug))
    assert.deepEqual(read.body.data, response.body.data)
    assert.equal(read.headers.get('etag'), '"2"')

    const row = await shopRow(shop.shopId)
    assert.equal(row.version, 2)
    assert.notInclude(row.grievance_contact_phone_enc, '9851234567')
    assert.equal(
      decryptField(row.grievance_contact_phone_enc, 'shops.grievance_contact_phone_enc'),
      '+9779851234567'
    )
  })

  test('T-SHOP-009 an absent member keeps its column; a request that changes nothing writes nothing', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const before = await shopRow(shop.shopId)
    for (const body of [{}, { description: null, contact_phone: '01-4123456' }]) {
      const response = await patch(browser, shop.slug, body)
      assert.equal(response.status, 200, response.text)
      assert.equal(response.headers.get('etag'), '"1"')
      assert.equal(response.body.data.version, 1)
    }
    assert.deepEqual(await shopRow(shop.shopId), before)
    assert.lengthOf(await profileAudits(shop.shopId), 0)

    const changed = await patch(browser, shop.slug, { description: 'Only this.' })
    assert.equal(changed.status, 200, changed.text)
    const after = await shopRow(shop.shopId)
    assert.equal(after.description, 'Only this.')
    assert.equal(after.contact_email, before.contact_email)
    assert.equal(after.return_policy_text, before.return_policy_text)
    assert.equal(after.grievance_contact_phone_enc, before.grievance_contact_phone_enc)
  })

  test('T-SHOP-009 null and "" clear the description', async ({ assert }) => {
    const { shop, browser } = await shopFor()
    await patch(browser, shop.slug, { description: 'A first description.' })
    const cleared = await patch(browser, shop.slug, { description: '' }, '"2"')
    assert.equal(cleared.status, 200, cleared.text)
    assert.isNull(cleared.body.data.description)
    await patch(browser, shop.slug, { description: 'Again.' }, '"3"')
    const nulled = await patch(browser, shop.slug, { description: null }, '"4"')
    assert.isNull(nulled.body.data.description)
  })

  test('T-SHOP-009 the business rules on the result: {label} [AC-FR-SHOP-013-2]')
    .with([
      {
        label: 'a registered business without its registration number and authority',
        body: { business_type: 'registered_business' },
        fields: [
          ['registration_number', 'required'],
          ['registration_authority', 'required'],
        ],
      },
      {
        label: 'a registered business without its PAN/VAT number',
        body: {
          business_type: 'registered_business',
          registration_number: '12345/079/080',
          registration_authority: 'Office of the Company Registrar',
          pan_vat_number: null,
        },
        fields: [['pan_vat_number', 'required']],
      },
      {
        label: 'a VAT-registered individual without a PAN/VAT number',
        body: { is_vat_registered: true, pan_vat_number: null },
        fields: [['pan_vat_number', 'required']],
      },
    ])
    .run(async ({ assert }, { body, fields }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, body)
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(problemFields(response.body), fields)
      assert.deepEqual(await shopRow(shop.shopId), before)
    })

  test('T-SHOP-009 an individual may remove the PAN while OD-16 is open; switching to registered and back', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor()
    const removed = await patch(browser, shop.slug, { pan_vat_number: null })
    assert.equal(removed.status, 200, removed.text)
    assert.isNull(removed.body.data.business_details.pan_vat_number)

    const registered = await patch(
      browser,
      shop.slug,
      {
        business_type: 'registered_business',
        registration_number: '12345/079/080',
        registration_authority: 'Office of the Company Registrar',
        pan_vat_number: '600123456',
      },
      '"2"'
    )
    assert.equal(registered.status, 200, registered.text)
    const back = await patch(
      browser,
      shop.slug,
      { business_type: 'individual', registration_number: null, registration_authority: null },
      '"3"'
    )
    assert.equal(back.status, 200, back.text)
    assert.deepEqual(back.body.data.business_details, {
      business_type: 'individual',
      registration_number: null,
      registration_authority: null,
      pan_vat_number: '600123456',
      is_vat_registered: false,
      return_policy_text: 'Returns within 7 days, unworn and with tags.',
    })
  })

  test('T-SHOP-009 {label} answers 422 on {field} and writes nothing')
    .with([
      {
        label: 'a long description',
        field: 'description',
        value: 'a'.repeat(2001),
        code: 'max_length',
      },
      { label: 'an email without a domain', field: 'contact_email', value: 'shop@', code: 'email' },
      { label: 'a short number', field: 'contact_phone', value: '12345', code: 'nepal_phone' },
      { label: 'a null contact phone', field: 'contact_phone', value: null, code: 'required' },
      { label: 'an empty return policy', field: 'return_policy_text', value: '', code: 'required' },
      {
        label: 'a long return policy',
        field: 'return_policy_text',
        value: 'r'.repeat(5001),
        code: 'max_length',
      },
      { label: 'an unknown business type', field: 'business_type', value: 'company', code: 'enum' },
      { label: 'a PAN of 8 digits', field: 'pan_vat_number', value: '12345678', code: 'regex' },
      { label: 'a VAT flag as text', field: 'is_vat_registered', value: 'yes', code: 'boolean' },
      {
        label: 'a one-letter grievance name',
        field: 'grievance_contact_name',
        value: 'A',
        code: 'min_length',
      },
      {
        label: 'a null grievance phone',
        field: 'grievance_contact_phone',
        value: null,
        code: 'required',
      },
    ])
    .run(async ({ assert }, { field, value, code }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, { [field]: value })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[field, code]])
      assert.deepEqual(await shopRow(shop.shopId), before)
    })

  test('T-SHOP-009 one shop.profile_update row names the changed columns, by the owner', async ({
    assert,
  }) => {
    const { shop, userId, browser } = await shopFor()
    const response = await patch(browser, shop.slug, {
      description: 'Changed.',
      contact_email: shop.contactEmail,
      business_type: 'registered_business',
      registration_number: '12345/079/080',
      registration_authority: 'Office of the Company Registrar',
      is_vat_registered: true,
      grievance_contact_phone: '9851234567',
    })
    assert.equal(response.status, 200, response.text)
    const audits = await profileAudits(shop.shopId)
    assert.lengthOf(audits, 1)
    assert.equal(audits[0].actor_type, 'shop_member')
    assert.equal(audits[0].actor_user_id, userId)
    assert.equal(audits[0].actor_role, `shop:${shop.shopId}:owner`)
    assert.equal(audits[0].subject_type, 'shop')
    assert.equal(audits[0].subject_id, shop.shopId)
    assert.isNotNull(audits[0].ip_hash)
    // The unchanged contact email is not written, so it is not named.
    assert.deepEqual(audits[0].changes, {
      changed: [
        'description',
        'business_type',
        'business_registration_number',
        'business_registration_authority',
        'is_vat_registered',
        'grievance_contact_phone_enc',
      ],
      business_type: { from: 'individual', to: 'registered_business' },
      is_vat_registered: { from: false, to: true },
    })
  })
})

test.group('T-API-004 If-Match on updateShopProfile', (group) => {
  group.each.teardown(forgetMade)

  test('T-API-004 {label} answers 428 PRECONDITION_REQUIRED and writes nothing')
    .with([
      { label: 'no If-Match', ifMatch: null },
      { label: 'If-Match *', ifMatch: '*' },
      { label: 'a list of tags', ifMatch: '"1", "2"' },
    ])
    .run(async ({ assert }, { ifMatch }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, { description: 'Not saved.' }, ifMatch)
      assert.equal(response.status, 428, response.text)
      assert.equal(response.body.code, 'PRECONDITION_REQUIRED')
      assert.deepEqual(await shopRow(shop.shopId), before)
    })

  test(
    'T-API-004 {label} answers 412 VERSION_CONFLICT with current and writes nothing [AC-FR-SHOP-003-2]'
  )
    .with([
      { label: 'a stale version', ifMatch: '"1"' },
      { label: 'a weak tag of the current version', ifMatch: 'W/"2"' },
      { label: 'a value that is not a version', ifMatch: '"two"' },
    ])
    .run(async ({ assert }, { ifMatch }) => {
      const { shop, browser } = await shopFor()
      const first = await patch(browser, shop.slug, { description: 'First editor.' })
      assert.equal(first.status, 200, first.text)
      const before = await shopRow(shop.shopId)

      const response = await patch(browser, shop.slug, { description: 'Second editor.' }, ifMatch)
      assert.equal(response.status, 412, response.text)
      assert.equal(response.body.code, 'VERSION_CONFLICT')
      assert.deepEqual(response.body.current, first.body.data)
      assert.deepEqual(await shopRow(shop.shopId), before)
    })
})

test.group('T-SEC-003 server-owned members on updateShopProfile', (group) => {
  group.each.teardown(forgetMade)

  test(
    'T-SEC-003 updateShopProfile with {member} is refused with 422 unknown_field and changes nothing [RF-36]'
  )
    .with([
      { member: 'name', value: 'A New Name' },
      { member: 'slug', value: 'another-slug' },
      { member: 'status', value: 'active' },
      { member: 'suspension_mode', value: null },
      { member: 'commission_rate_bp', value: 0 },
      { member: 'product_review_mode', value: 'post' },
      { member: 'version', value: 9 },
      { member: 'shop_id', value: '01929c10-0000-7000-8000-0000000000a1' },
      { member: 'owner_user_id', value: '01929c10-0000-7000-8000-0000000000a2' },
      { member: 'grievance_contact_phone_enc', value: 'v1.k.AAAA.AA.AAAA' },
      { member: 'logo_media_id', value: '01929c10-0000-7000-8000-0000000000a3' },
      { member: 'business_details', value: { business_type: 'individual' } },
    ])
    .run(async ({ assert }, { member, value }) => {
      const { shop, browser } = await shopFor()
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, {
        description: 'Not saved.',
        [member]: value,
      })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[member, 'unknown_field']])
      assert.deepEqual(await shopRow(shop.shopId), before)
    })

  test('T-SEC-003 a member in the query string is refused with 400', async ({ assert }) => {
    const { shop, browser } = await shopFor()
    const response = await send(
      browser,
      'PATCH',
      `${shopPath(shop.slug)}?description=sneaky`,
      {},
      { 'If-Match': '"1"' }
    )
    assert.equal(response.status, 400, response.text)
    assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
  })
})

test.group('T-SEC-001 updateShopProfile outside the caller’s shops', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-001 another shop’s slug answers the 404 of an unknown slug and changes nothing', async ({
    assert,
  }) => {
    const { browser } = await shopFor()
    const theirs = await createOwnerShop()
    const before = await shopRow(theirs.shopId)
    const unknown = await patch(browser, 'no-such-shop-anywhere', { description: 'Not saved.' })
    assert.equal(unknown.status, 404)
    const other = await patch(browser, theirs.slug, { description: 'Not saved.' })
    assert.equal(other.status, 404)
    assert.deepEqual(stable(other.body), stable(unknown.body))
    assert.deepEqual(await shopRow(theirs.shopId), before)
  })
})

test.group('T-SEC-030 who may change the profile', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-030 a {role} without shop.profile.manage gets 403 FORBIDDEN')
    .with([{ role: 'catalog_editor' }, { role: 'order_fulfiller' }, { role: 'viewer' }])
    .run(async ({ assert }, { role }) => {
      const { shop, browser } = await shopFor(role)
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, { description: 'Not saved.' })
      assert.equal(response.status, 403, response.text)
      assert.equal(response.body.code, 'FORBIDDEN')
      assert.deepEqual(await shopRow(shop.shopId), before)
    })

  test('T-SEC-034 a manager changes the public profile and gets no business details or grievance contact', async ({
    assert,
  }) => {
    const { shop, browser } = await shopFor('manager')
    const response = await patch(browser, shop.slug, {
      description: 'Edited by the manager.',
      contact_phone: '9801234567',
    })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.description, 'Edited by the manager.')
    assert.equal(response.body.data.contact_phone, '+9779801234567')
    assert.isNull(response.body.data.business_details)
    assert.isNull(response.body.data.grievance_contact)
    for (const value of [GRIEVANCE.name, GRIEVANCE.phone, '123456789', 'Returns within']) {
      assert.notInclude(response.text, value)
    }
    const audits = await profileAudits(shop.shopId)
    assert.lengthOf(audits, 1)
    assert.equal(audits[0].actor_role, `shop:${shop.shopId}:manager`)

    // A stale version: the 412's `current` is the manager's view too.
    const stale = await patch(browser, shop.slug, { description: 'Stale.' })
    assert.equal(stale.status, 412, stale.text)
    assert.isNull(stale.body.current.business_details)
    assert.isNull(stale.body.current.grievance_contact)
    assert.notInclude(stale.text, GRIEVANCE.phone)
  })

  test('T-SEC-030 a manager sending {member} gets 403 FORBIDDEN and nothing is written')
    .with([
      { member: 'return_policy_text', value: 'Returns within 30 days.' },
      { member: 'business_type', value: 'individual' },
      { member: 'registration_number', value: null },
      { member: 'registration_authority', value: null },
      { member: 'pan_vat_number', value: '123456789' },
      { member: 'is_vat_registered', value: false },
      { member: 'grievance_contact_name', value: 'Not The Owner' },
      { member: 'grievance_contact_phone', value: '9800000001' },
    ])
    .run(async ({ assert }, { member, value }) => {
      const { shop, browser } = await shopFor('manager')
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, {
        description: 'Not saved.',
        [member]: value,
      })
      assert.equal(response.status, 403, response.text)
      assert.equal(response.body.code, 'FORBIDDEN')
      assert.include(response.body.detail, 'owner')
      assert.deepEqual(await shopRow(shop.shopId), before)
      assert.lengthOf(await profileAudits(shop.shopId), 0)
    })
})

test.group('T-SEC-031 the profile status gate', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-031 updateShopProfile: {status} for the {actor}')
    .with([
      { status: 'pending_review' as const, mode: null, actor: 'owner', expected: 200 },
      { status: 'rejected' as const, mode: null, actor: 'owner', expected: 200 },
      { status: 'pending_review' as const, mode: null, actor: 'manager', expected: 403 },
      {
        status: 'suspended' as const,
        mode: 'fulfill_existing' as const,
        actor: 'owner',
        expected: 403,
      },
      { status: 'suspended' as const, mode: 'frozen' as const, actor: 'manager', expected: 403 },
      { status: 'closed' as const, mode: null, actor: 'owner', expected: 403 },
    ])
    .run(async ({ assert }, { status, mode, actor, expected }) => {
      const { shop, browser } = await shopFor(actor)
      await setShopStatus(shop.shopId, status, mode)
      const before = await shopRow(shop.shopId)
      const response = await patch(browser, shop.slug, { description: 'Gated.' })
      assert.equal(response.status, expected, response.text)
      if (expected === 403) {
        assert.equal(response.body.code, 'SHOP_NOT_ACTIVE')
        assert.equal(response.body.shop_status, status)
        assert.deepEqual(await shopRow(shop.shopId), before)
      } else {
        assert.equal(response.body.data.description, 'Gated.')
        assert.equal(response.body.data.status, status)
      }
    })

  test('T-SEC-031 a suspension that commits after seller_context read the shop wins', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    made.push(shop.ownerId)
    await setShopStatus(shop.shopId, 'suspended', 'frozen')
    const before = await shopRow(shop.shopId)
    // The context as `seller_context` read it, before the suspension.
    const context = {
      id: shop.shopId,
      slug: shop.slug,
      name: shop.name,
      status: 'active',
      suspensionMode: null,
      actor: 'owner' as const,
      viaRedirect: false,
    }
    const refused = await updateShopProfile(
      { shop: context, expectedVersion: before.version, changes: { description: 'Too late.' } },
      {
        actor: {
          type: 'shop_member',
          userId: shop.ownerId,
          role: `shop:${shop.shopId}:owner`,
          requestId: null,
        },
        present: (row) => sellerShopJson(row, 'owner'),
      }
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(refused, DomainError)
    assert.equal((refused as DomainError).problemCode, 'SHOP_NOT_ACTIVE')
    assert.deepEqual(await shopRow(shop.shopId), before)
    assert.lengthOf(await profileAudits(shop.shopId), 0)
  })
})

test.group('T-SEC-102 the shop.profile_update row', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-102 the audit row holds no fixture personal value', async ({ assert }) => {
    const { shop, browser } = await shopFor()
    const values = {
      description: 'Call Maya on 9851234567 or write to maya.fixture@example.com.',
      contact_email: 'shop.fixture@example.com',
      contact_phone: '9861234567',
      business_type: 'registered_business',
      registration_number: 'REG-FIXTURE-4242',
      registration_authority: 'Fixture Registrar Office',
      pan_vat_number: '600424242',
      return_policy_text: 'Ask Maya Fixture Gurung on 9841112222.',
      grievance_contact_name: 'Maya Fixture Gurung',
      grievance_contact_phone: '9841112223',
    }
    const response = await patch(browser, shop.slug, values)
    assert.equal(response.status, 200, response.text)
    const [audit] = await profileAudits(shop.shopId)
    const written = JSON.stringify(audit.changes) + (audit.reason ?? '')
    for (const value of [
      '9851234567',
      'maya.fixture@example.com',
      'shop.fixture@example.com',
      '9861234567',
      'REG-FIXTURE-4242',
      'Fixture Registrar Office',
      '600424242',
      'Maya Fixture Gurung',
      '9841112222',
      '9841112223',
    ]) {
      assert.notInclude(written, value)
    }
  })
})
