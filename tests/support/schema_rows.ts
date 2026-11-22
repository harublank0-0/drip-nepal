import db from '@adonisjs/lucid/services/db'
import type { Assert } from '@japa/assert'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * Row builders for the schema constraint tests (tests/functional/schema/):
 * users, shops and locations, payout accounts (docs/04a §6.7), products
 * (§7.6), courier accounts and pickup addresses (§9.9, §9.10, §6.6), the
 * orders tables of §11, stock (§8.1) and COD payments (§12.1, §12.2). Rows
 * are inserted directly, as the runtime would, with the smallest set of
 * columns each table's CHECKs accept. Every call makes unique rows; the
 * functional suite rolls each test back.
 */

// A ciphertext in the docs/04 §2.9 format.
export const CIPHERTEXT = 'v1.k2026.AAAAAAAAAAAAAAAA.c2VhbGVkLXZhbHVl.BBBBBBBBBBBBBBBBBBBBBB'

export type Row = Record<string, unknown>
type PgError = { code?: string; constraint?: string; message: string }

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let sequence = 0
export function next() {
  sequence += 1
  return sequence
}

// `DN-` + 7 Crockford base32 characters (docs/04 §2.1), unique per call.
export function orderNumber() {
  let n = next()
  let code = ''
  for (let i = 0; i < 7; i++) {
    code = CROCKFORD[n % 32] + code
    n = Math.floor(n / 32)
  }
  return `DN-${code}`
}

export async function insertUser() {
  const n = next()
  const [row] = await db
    .table('users')
    .insert({ email: `buyer-${n}@example.com`, full_name: 'Sita Shrestha', password_hash: 'x' })
    .returning('id')
  return row.id as string
}

// A member of platform staff (docs/04a §5.4), for columns that reference one.
export async function insertStaff(role = 'finance_officer') {
  const userId = await insertUser()
  await db.table('platform_staff').insert({ user_id: userId, role })
  return userId
}

// A pending shop of `ownerUserId` (docs/04a §6.1); `values` overrides columns.
export function shopValues(ownerUserId: string, values: Row = {}): Row {
  const n = next()
  return {
    owner_user_id: ownerUserId,
    name: `Thulo Pasal ${n}`,
    slug: `thulo-pasal-${n}`,
    contact_email: `shop-${n}@example.com`,
    contact_phone_e164: '+9779812345678',
    return_policy_text: 'Returns within 7 days, unworn and with tags.',
    business_type: 'individual',
    grievance_contact_name: 'Sita Shrestha',
    grievance_contact_phone_enc: CIPHERTEXT,
    ...values,
  }
}

export async function insertShop() {
  const [row] = await db
    .table('shops')
    .insert(shopValues(await insertUser()))
    .returning('id')
  return row.id as string
}

// A bank account of `shopId` for payouts (docs/04a §6.7).
export async function insertPayoutAccount(shopId: string) {
  const [row] = await db
    .table('shop_payout_accounts')
    .insert({
      shop_id: shopId,
      method: 'bank_transfer',
      account_name: 'Thulo Pasal Pvt Ltd',
      bank_name: 'Nabil Bank',
      account_number_enc: CIPHERTEXT,
      account_number_last4: '4567',
      created_by: await insertUser(),
    })
    .returning('id')
  return row.id as string
}

// Kathmandu: province 3, district 306, metropolitan city 30608 (docs/04a §9).
// The reference seeders load them in every test run (docs/04 §21.4), so this
// usually inserts nothing; it keeps a test independent of the dataset.
export async function insertLocation() {
  await db
    .table('provinces')
    .insert({ code: '3', name_en: 'Bagmati', name_ne: 'बागमती' })
    .onConflict('code')
    .ignore()
  await db
    .table('districts')
    .insert({ code: '306', province_code: '3', name_en: 'Kathmandu', name_ne: 'काठमाडौँ' })
    .onConflict('code')
    .ignore()
  await db
    .table('local_levels')
    .insert({
      code: '30608',
      district_code: '306',
      name_en: 'Kathmandu Metropolitan City',
      name_ne: 'काठमाडौँ महानगरपालिका',
      type: 'metropolitan',
      ward_count: 32,
    })
    .onConflict('code')
    .ignore()
}

// The `shipping_address` snapshot of docs/04a §11.1, schema version 1.
export function shippingAddress() {
  return JSON.stringify({
    schema: 1,
    recipient_name_enc: CIPHERTEXT,
    recipient_phone_enc: CIPHERTEXT,
    recipient_phone_last4: '4567',
    province_code: '3',
    district_code: '306',
    local_level_code: '30608',
    ward_no: 10,
    area_tole_enc: CIPHERTEXT,
  })
}

// A placed COD order of Rs 1,000 plus Rs 100 shipping; `values` overrides columns.
export function orderValues(customerUserId: string, values: Row = {}): Row {
  return {
    number: orderNumber(),
    customer_user_id: customerUserId,
    status: 'placed',
    payment_method: 'cod',
    items_subtotal_minor: 100000,
    shipping_total_minor: 10000,
    grand_total_minor: 110000,
    shipping_address: shippingAddress(),
    shipping_district_code: '306',
    customer_email_snapshot: 'buyer@example.com',
    ...values,
  }
}

export async function insertOrder(values: Row = {}) {
  await insertLocation()
  const customerUserId = await insertUser()
  const [row] = await db
    .table('orders')
    .insert(orderValues(customerUserId, values))
    .returning(['id', 'number'])
  return { id: row.id as string, number: row.number as string, customerUserId }
}

export type ShopOrderRef = {
  id: string
  orderId: string
  shopId: string
  number: string
  customerUserId: string
}

// The shop order `number` of order `orderId` for `shopId`, awaiting acceptance.
export function shopOrderValues(orderId: string, shopId: string, number: string, values: Row = {}) {
  return {
    order_id: orderId,
    shop_id: shopId,
    number,
    status: 'awaiting_acceptance',
    items_subtotal_minor: 100000,
    shipping_fee_minor: 10000,
    total_minor: 110000,
    commission_total_minor: 10000,
    delivery_zone_code_snapshot: 'ktm_valley',
    est_min_days_snapshot: 1,
    est_max_days_snapshot: 3,
    shop_name_snapshot: 'Thulo Pasal',
    acceptance_due_at: db.raw(`now() + interval '1 day'`),
    ...values,
  }
}

// A new order with one shop order of `shopId`, awaiting acceptance.
export async function insertShopOrder(shopId: string, values: Row = {}): Promise<ShopOrderRef> {
  const order = await insertOrder()
  const number = `${order.number}-1`
  const [row] = await db
    .table('shop_orders')
    .insert(shopOrderValues(order.id, shopId, number, values))
    .returning('id')
  return {
    id: row.id as string,
    orderId: order.id,
    shopId,
    number,
    customerUserId: order.customerUserId,
  }
}

// The columns of a draft product of `shopId` in a new leaf category (docs/04a §7.6).
export async function productValues(shopId: string, values: Row = {}): Promise<Row> {
  const n = next()
  const [category] = await db
    .table('categories')
    .insert({ slug: `kurta-${n}`, name: `Kurta ${n}`, path: `/kurta-${n}/`, depth: 1 })
    .returning('id')
  return {
    shop_id: shopId,
    public_id: orderNumber().slice(3) + '0',
    slug: 'kurta-suruwal',
    title: 'Kurta suruwal',
    category_id: category.id,
    created_by: await insertUser(),
    ...values,
  }
}

// A draft product of `shopId` with its default variant.
export async function insertVariant(shopId: string) {
  const n = next()
  const [product] = await db
    .table('products')
    .insert(await productValues(shopId))
    .returning('id')
  const [variant] = await db
    .table('product_variants')
    .insert({
      shop_id: shopId,
      product_id: product.id,
      sku: `KS-${n}`,
      price_minor: 50000,
      is_default: true,
      option_signature: '',
    })
    .returning('id')
  return { productId: product.id as string, variantId: variant.id as string }
}

// Two units at Rs 500 of a new variant on `shopOrder`; returns the order_items id.
export async function insertOrderItem(shopOrder: ShopOrderRef) {
  const line = await insertOrderLine(shopOrder)
  return line.id
}

// As insertOrderItem, and also returns the line's variant.
export async function insertOrderLine(shopOrder: ShopOrderRef) {
  const { productId, variantId } = await insertVariant(shopOrder.shopId)
  const [row] = await db
    .table('order_items')
    .insert({
      order_id: shopOrder.orderId,
      shop_order_id: shopOrder.id,
      shop_id: shopOrder.shopId,
      product_id: productId,
      variant_id: variantId,
      product_title_snapshot: 'Kurta suruwal',
      variant_label_snapshot: '',
      sku_snapshot: 'KS-001',
      category_path_snapshot: 'Clothing > Kurta',
      unit_price_minor: 50000,
      quantity: 2,
      line_subtotal_minor: 100000,
      line_total_minor: 100000,
      commission_rate_bp: 1000,
      commission_minor: 10000,
    })
    .returning('id')
  return { id: row.id as string, variantId }
}

// The stock row of a variant of `shopId` (docs/04a §8.1), empty unless `values` say otherwise.
export async function insertInventoryItem(shopId: string, variantId: string, values: Row = {}) {
  await db.table('inventory_items').insert({ variant_id: variantId, shop_id: shopId, ...values })
}

// The COD payment of `shopOrder` for its Rs 1,100 total, with its one
// allocation (docs/04a §12.1, §12.2): `collected`, or still awaiting collection.
export async function insertCodPayment(shopOrder: ShopOrderRef, collected: boolean) {
  const capturedMinor = collected ? 110000 : 0
  const [row] = await db
    .table('payments')
    .insert({
      order_id: shopOrder.orderId,
      shop_order_id: shopOrder.id,
      method: 'cod',
      status: collected ? 'collected' : 'awaiting_collection',
      amount_minor: 110000,
      captured_minor: capturedMinor,
      captured_at: collected ? db.raw('now()') : null,
    })
    .returning('id')
  await db.table('payment_allocations').insert({
    payment_id: row.id,
    shop_order_id: shopOrder.id,
    order_id: shopOrder.orderId,
    amount_minor: 110000,
    captured_minor: capturedMinor,
  })
  return row.id as string
}

// A courier account of `shopId` that the shop may book through (docs/04a §9.9, §9.10).
export async function insertCourierAccount(shopId: string) {
  // Test-only code: `ncm` itself comes from the reference seeder (04a §9.8).
  await db
    .table('logistics_providers')
    .insert({ code: 'test_courier', name: 'Test Courier' })
    .onConflict('code')
    .ignore()
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'test_courier',
      name: 'Test Courier Kathmandu',
      environment: 'sandbox',
      owner_type: 'shop',
      shop_id: shopId,
    })
    .returning('id')
  await db.table('logistics_account_shops').insert({
    account_id: row.id,
    shop_id: shopId,
    account_owner_type: 'shop',
    owner_shop_id: shopId,
  })
  return row.id as string
}

// A pickup address of `shopId` (docs/04a §6.6) in Kathmandu.
export async function insertPickupAddress(shopId: string) {
  const [row] = await db
    .table('shop_addresses')
    .insert({
      shop_id: shopId,
      purpose: 'pickup',
      contact_name: 'Ram Thapa',
      contact_phone_enc: CIPHERTEXT,
      province_code: '3',
      district_code: '306',
      local_level_code: '30608',
      ward_no: 10,
      area_tole_enc: CIPHERTEXT,
    })
    .returning('id')
  return row.id as string
}

export type Courier = { shopId: string; accountId: string; addressId: string }

// A shop with a courier account and a pickup address.
export async function courierShop(): Promise<Courier> {
  const shopId = await insertShop()
  await insertLocation()
  return {
    shopId,
    accountId: await insertCourierAccount(shopId),
    addressId: await insertPickupAddress(shopId),
  }
}

// A return request of the customer of `shopOrder` (docs/04a §11.7), still `requested`.
export async function insertReturnRequest(shopOrder: ShopOrderRef, values: Row = {}) {
  const [row] = await db
    .table('return_requests')
    .insert({
      number: `RT-${orderNumber().slice(3)}`,
      order_id: shopOrder.orderId,
      shop_order_id: shopOrder.id,
      shop_id: shopOrder.shopId,
      requested_by_user_id: shopOrder.customerUserId,
      reason_code: 'size_issue',
      ...values,
    })
    .returning('id')
  return row.id as string
}

// Runs `write` in a savepoint that is rolled back, and checks that PostgreSQL accepted it.
export async function accepted(
  assert: Assert,
  write: (trx: TransactionClientContract) => Promise<unknown>,
  label: string
) {
  const rollback = new Error('rollback')
  const error = await db
    .transaction(async (trx) => {
      await write(trx)
      throw rollback
    })
    .then(
      () => null,
      (e: PgError | Error) => (e === rollback ? null : e)
    )
  assert.isNull(error, `${label}: ${error?.message}`)
}

// Runs `write` in a savepoint and checks that PostgreSQL refused it.
export async function refused(
  assert: Assert,
  write: (trx: TransactionClientContract) => Promise<unknown>,
  // `constraint` may list several keys when more than one refuses the row and
  // PostgreSQL reports whichever fires first.
  expected: { code: string; constraint?: string | string[]; message?: RegExp },
  label: string
) {
  const error: PgError | null = await db.transaction(write).then(
    () => null,
    (e: PgError) => e
  )
  assert.isNotNull(error, `${label}: the write was accepted`)
  assert.equal(error!.code, expected.code, `${label}: ${error!.message}`)
  if (Array.isArray(expected.constraint)) {
    assert.oneOf(error!.constraint, expected.constraint, `${label}: ${error!.message}`)
  } else if (expected.constraint) {
    assert.equal(error!.constraint, expected.constraint, `${label}: ${error!.message}`)
  }
  if (expected.message) {
    assert.match(error!.message, expected.message, label)
  }
}
