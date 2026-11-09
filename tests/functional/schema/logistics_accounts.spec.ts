import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { Assert } from '@japa/assert'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * Constraint tests of the courier tables (OD-56, ADR-0019): T-SHOP-111
 * (docs/04a §9.9), T-SHOP-112 (§9.10) and the keys and CHECK of T-SHOP-113
 * (§9.11), which run with the E4 baseline (docs/10 §6.5 and note 35).
 *
 * Rows are inserted directly, as the runtime would, and each test is rolled
 * back. Every expected refusal runs in its own savepoint, so one failure
 * does not abort the rest of the test, and asserts the SQLSTATE and, where
 * PostgreSQL reports one, the constraint name.
 */

// A ciphertext in the docs/04 §2.9 format.
const CIPHERTEXT = 'v1.k2026.AAAAAAAAAAAAAAAA.c2VhbGVkLXZhbHVl.BBBBBBBBBBBBBBBBBBBBBB'

type PgError = { code?: string; constraint?: string; message: string }
type Row = Record<string, unknown>

let sequence = 0
function next() {
  sequence += 1
  return sequence
}

async function insertUser() {
  const n = next()
  const [row] = await db
    .table('users')
    .insert({
      email: `courier-owner-${n}@example.com`,
      full_name: 'Sita Shrestha',
      password_hash: 'x',
    })
    .returning('id')
  return row.id as string
}

async function insertShop() {
  const n = next()
  const [row] = await db
    .table('shops')
    .insert({
      owner_user_id: await insertUser(),
      name: `Thulo Pasal ${n}`,
      slug: `thulo-pasal-${n}`,
      contact_email: `shop-${n}@example.com`,
      contact_phone_e164: '+9779812345678',
      return_policy_text: 'Returns within 7 days, unworn and with tags.',
      business_type: 'individual',
      grievance_contact_name: 'Sita Shrestha',
      grievance_contact_phone_enc: CIPHERTEXT,
    })
    .returning('id')
  return row.id as string
}

async function insertProviders() {
  await db.table('logistics_providers').multiInsert([
    // Test-only codes: `ncm` itself comes from the reference seeder (04a §9.8).
    { code: 'test_courier', name: 'Test Courier' },
    { code: 'other_courier', name: 'Other Courier' },
  ])
}

async function insertAccount(values: Row) {
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'test_courier',
      name: 'Test Courier Kathmandu',
      environment: 'sandbox',
      ...values,
    })
    .returning('id')
  return row.id as string
}

// Runs `write` in a savepoint and checks that PostgreSQL refused it.
async function refused(
  assert: Assert,
  write: (trx: TransactionClientContract) => Promise<unknown>,
  expected: { code: string; constraint?: string; message?: RegExp },
  label: string
) {
  const error: PgError | null = await db.transaction(write).then(
    () => null,
    (e: PgError) => e
  )
  assert.isNotNull(error, `${label}: the write was accepted`)
  assert.equal(error!.code, expected.code, `${label}: ${error!.message}`)
  if (expected.constraint) {
    assert.equal(error!.constraint, expected.constraint, `${label}: ${error!.message}`)
  }
  if (expected.message) {
    assert.match(error!.message, expected.message, label)
  }
}

test.group('T-SHOP-111 logistics_accounts constraints', () => {
  test('T-SHOP-111 owner, status, disabled and ciphertext CHECKs refuse bad rows with 23514', async ({
    assert,
  }) => {
    await insertProviders()
    const shopId = await insertShop()

    // The valid shapes are accepted, so the refusals below are about one column each.
    await insertAccount({ owner_type: 'platform' })
    await insertAccount({ owner_type: 'shop', shop_id: shopId })
    await insertAccount({
      owner_type: 'platform',
      status: 'active',
      credentials_enc: CIPHERTEXT,
      verified_at: db.raw('now()'),
    })
    await insertAccount({
      owner_type: 'platform',
      status: 'disabled',
      disabled_at: db.raw('now()'),
    })

    const cases: [string, Row, string][] = [
      [
        'a platform account with a shop',
        { owner_type: 'platform', shop_id: shopId },
        'owner_check',
      ],
      ['a shop account without a shop', { owner_type: 'shop' }, 'owner_check'],
      ['an unknown owner type', { owner_type: 'courier' }, 'owner_check'],
      ['an unknown status', { owner_type: 'platform', status: 'paused' }, 'status_check'],
      [
        'active without credentials',
        { owner_type: 'platform', status: 'active', verified_at: db.raw('now()') },
        'active_check',
      ],
      [
        'active without a verification',
        { owner_type: 'platform', status: 'active', credentials_enc: CIPHERTEXT },
        'active_check',
      ],
      [
        'disabled without disabled_at',
        { owner_type: 'platform', status: 'disabled' },
        'disabled_check',
      ],
      [
        'disabled_at on a pending account',
        { owner_type: 'platform', disabled_at: db.raw('now()') },
        'disabled_check',
      ],
      [
        'disabled with credentials kept',
        {
          owner_type: 'platform',
          status: 'disabled',
          disabled_at: db.raw('now()'),
          credentials_enc: CIPHERTEXT,
        },
        'disabled_check',
      ],
      [
        'plaintext credentials',
        { owner_type: 'platform', credentials_enc: '{"api_key":"live-123"}' },
        'credentials_enc_check',
      ],
    ]
    for (const [label, values, purpose] of cases) {
      await refused(
        assert,
        (trx) =>
          trx.table('logistics_accounts').insert({
            provider_code: 'test_courier',
            name: 'Test Courier Kathmandu',
            environment: 'sandbox',
            ...values,
          }),
        { code: '23514', constraint: `logistics_accounts_${purpose}` },
        label
      )
    }
  })

  test('T-SHOP-111 the courier, owner, environment and external reference never change (P0001)', async ({
    assert,
  }) => {
    await insertProviders()
    const shopId = await insertShop()
    const otherShopId = await insertShop()
    const platformId = await insertAccount({
      owner_type: 'platform',
      external_account_ref: 'NCM-001',
    })
    const shopAccountId = await insertAccount({ owner_type: 'shop', shop_id: shopId })

    // The columns logistics_accounts_guard allows still change.
    await db
      .from('logistics_accounts')
      .where('id', platformId)
      .update({
        name: 'NCM Valley',
        credentials_enc: CIPHERTEXT,
        status: 'active',
        verified_at: db.raw('now()'),
        version: db.raw('version + 1'),
      })

    const cases: [string, string, Row][] = [
      ['the courier', platformId, { provider_code: 'other_courier' }],
      ['platform to shop owner', platformId, { owner_type: 'shop', shop_id: shopId }],
      ['the owning shop', shopAccountId, { shop_id: otherShopId }],
      ['the environment', platformId, { environment: 'production' }],
      ['the external reference', platformId, { external_account_ref: 'NCM-002' }],
    ]
    for (const [label, id, values] of cases) {
      await refused(
        assert,
        (trx) => trx.from('logistics_accounts').where('id', id).update(values),
        { code: 'P0001', message: /on logistics_accounts only .* may change/ },
        label
      )
    }
  })
})

test.group('T-SHOP-112 logistics_account_shops keys', () => {
  test('T-SHOP-112 a shop-owned account lists only its owner; a platform claim is refused', async ({
    assert,
  }) => {
    await insertProviders()
    const shopId = await insertShop()
    const otherShopId = await insertShop()
    const shopAccountId = await insertAccount({ owner_type: 'shop', shop_id: shopId })
    const platformId = await insertAccount({ owner_type: 'platform' })

    // The owner's row of a shop-owned account, and a platform account shared with two shops.
    await db.table('logistics_account_shops').multiInsert([
      {
        account_id: shopAccountId,
        shop_id: shopId,
        account_owner_type: 'shop',
        owner_shop_id: shopId,
      },
      { account_id: platformId, shop_id: shopId, account_owner_type: 'platform' },
      { account_id: platformId, shop_id: otherShopId, account_owner_type: 'platform' },
    ])

    const cases: [string, Row, string, string][] = [
      [
        'a second shop on a shop-owned account, owner copy kept',
        {
          account_id: shopAccountId,
          shop_id: otherShopId,
          account_owner_type: 'shop',
          owner_shop_id: shopId,
        },
        '23514',
        'logistics_account_shops_owner_check',
      ],
      [
        'a second shop on a shop-owned account, owner copy forged',
        {
          account_id: shopAccountId,
          shop_id: otherShopId,
          account_owner_type: 'shop',
          owner_shop_id: otherShopId,
        },
        '23503',
        'logistics_account_shops_owner_fkey',
      ],
      [
        'a null owner-shop copy on a shop-owned row',
        { account_id: shopAccountId, shop_id: otherShopId, account_owner_type: 'shop' },
        '23514',
        'logistics_account_shops_owner_check',
      ],
      [
        'a platform claim for a shop-owned account',
        { account_id: shopAccountId, shop_id: otherShopId, account_owner_type: 'platform' },
        '23503',
        'logistics_account_shops_account_fkey',
      ],
      [
        'an owner-shop copy on a platform row',
        {
          account_id: platformId,
          shop_id: shopId,
          account_owner_type: 'platform',
          owner_shop_id: shopId,
        },
        '23514',
        'logistics_account_shops_owner_check',
      ],
    ]
    for (const [label, values, code, constraint] of cases) {
      await refused(
        assert,
        (trx) => trx.table('logistics_account_shops').insert(values),
        { code, constraint },
        label
      )
    }

    // Moving the owner's row to another shop is refused by logistics_account_shops_guard.
    await refused(
      assert,
      (trx) =>
        trx
          .from('logistics_account_shops')
          .where({ account_id: shopAccountId, shop_id: shopId })
          .update({ shop_id: otherShopId, owner_shop_id: otherShopId }),
      { code: 'P0001', message: /on logistics_account_shops only .* may change/ },
      'moving the owner row to another shop'
    )
  })
})

/*
 * T-SHOP-113 is split by case (docs/10 §6.5, note 35): the keys and the CHECK
 * run here with the M0 baseline; the deactivation case (deactivating the
 * account's row, or disabling the account, returns the shop to `manual`) is
 * application behaviour and comes with the M6 operations.
 */
test.group('T-SHOP-113 shop_logistics_settings keys and CHECK', () => {
  test('T-SHOP-113 the mode matches the default account, which the shop may use', async ({
    assert,
  }) => {
    await insertProviders()
    const shopId = await insertShop()
    const otherShopId = await insertShop()
    const ownAccountId = await insertAccount({ owner_type: 'shop', shop_id: shopId })
    const otherShopAccountId = await insertAccount({ owner_type: 'shop', shop_id: otherShopId })
    const sharedId = await insertAccount({ owner_type: 'platform' })
    const unsharedId = await insertAccount({ owner_type: 'platform' })
    await db.table('logistics_account_shops').multiInsert([
      {
        account_id: ownAccountId,
        shop_id: shopId,
        account_owner_type: 'shop',
        owner_shop_id: shopId,
      },
      {
        account_id: otherShopAccountId,
        shop_id: otherShopId,
        account_owner_type: 'shop',
        owner_shop_id: otherShopId,
      },
      { account_id: sharedId, shop_id: shopId, account_owner_type: 'platform' },
    ])

    // Each valid mode is accepted; the row is removed again so the next can use the key.
    const valid: Row[] = [
      { fulfillment_mode: 'manual' },
      {
        fulfillment_mode: 'vendor',
        default_account_id: ownAccountId,
        default_account_owner_type: 'shop',
      },
      {
        fulfillment_mode: 'platform',
        default_account_id: sharedId,
        default_account_owner_type: 'platform',
      },
    ]
    for (const values of valid) {
      await db.table('shop_logistics_settings').insert({ shop_id: shopId, ...values })
      await db.from('shop_logistics_settings').where('shop_id', shopId).delete()
    }

    const cases: [string, Row, string, string][] = [
      [
        'manual with a default account',
        {
          fulfillment_mode: 'manual',
          default_account_id: ownAccountId,
          default_account_owner_type: 'shop',
        },
        '23514',
        'shop_logistics_settings_mode_check',
      ],
      [
        'vendor without an account',
        { fulfillment_mode: 'vendor' },
        '23514',
        'shop_logistics_settings_mode_check',
      ],
      [
        'vendor with a platform-owned account',
        {
          fulfillment_mode: 'vendor',
          default_account_id: sharedId,
          default_account_owner_type: 'platform',
        },
        '23514',
        'shop_logistics_settings_mode_check',
      ],
      [
        'platform with a shop-owned account',
        {
          fulfillment_mode: 'platform',
          default_account_id: ownAccountId,
          default_account_owner_type: 'shop',
        },
        '23514',
        'shop_logistics_settings_mode_check',
      ],
      [
        'platform with a shop-owned account called platform',
        {
          fulfillment_mode: 'platform',
          default_account_id: ownAccountId,
          default_account_owner_type: 'platform',
        },
        '23503',
        'shop_logistics_settings_account_owner_fkey',
      ],
      [
        'a platform account not shared with the shop',
        {
          fulfillment_mode: 'platform',
          default_account_id: unsharedId,
          default_account_owner_type: 'platform',
        },
        '23503',
        'shop_logistics_settings_account_shop_fkey',
      ],
      [
        "another shop's own account",
        {
          fulfillment_mode: 'vendor',
          default_account_id: otherShopAccountId,
          default_account_owner_type: 'shop',
        },
        '23503',
        'shop_logistics_settings_account_shop_fkey',
      ],
    ]
    for (const [label, values, code, constraint] of cases) {
      await refused(
        assert,
        (trx) => trx.table('shop_logistics_settings').insert({ shop_id: shopId, ...values }),
        { code, constraint },
        label
      )
    }
  })
})
