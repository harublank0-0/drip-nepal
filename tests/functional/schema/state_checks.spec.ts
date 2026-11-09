import { test } from '@japa/runner'
import { randomBytes, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import {
  accepted,
  CIPHERTEXT,
  courierShop,
  insertCodPayment,
  insertInventoryItem,
  insertLocation,
  insertOrder,
  insertOrderLine,
  insertPayoutAccount,
  insertReturnRequest,
  insertShop,
  insertShopOrder,
  insertStaff,
  insertUser,
  next,
  orderNumber,
  orderValues,
  productValues,
  refused,
  shopOrderValues,
  shopValues,
  type Row,
} from '#tests/support/schema_rows'

/*
 * T-ARCH-015 (docs/04a §5, introduction; docs/04 §16): a CHECK passes when it
 * evaluates to NULL, so every CHECK that makes a value required tests
 * `IS NOT NULL` explicitly. For each such state-dependent CHECK this test
 * inserts a valid row in the state that requires the value, then the same
 * row with each required value missing, and expects SQLSTATE 23514 from that
 * CHECK.
 *
 * It is catalogue-driven: the CHECKs come from `pg_constraint`, as docs/04a §5
 * defines them: every CHECK whose expression tests `IS NOT NULL`, or compares
 * an `IS NULL` with another condition (`(a IS NULL) = (b IS NULL)`, which is
 * never NULL itself). One without a case below fails the test, so a new
 * state-dependent CHECK gets its case. A CHECK that tests `IS NOT NULL` only
 * to forbid a value is listed in NOT_REQUIRING instead.
 *
 * Each row is inserted in a savepoint and rolled back, so the valid row and
 * its broken copies can share unique keys.
 */

const NOW = db.raw('now()')
const LATER = db.raw(`now() + interval '7 days'`)

// A value made missing: a column set to NULL, or a change for a jsonb member.
type Missing = string | { label: string; change: (values: Row) => Row }

type Case = {
  constraint: string
  table: string
  // The state that requires the values, for the test title.
  state: string
  // The columns of a valid row in that state, after inserting its parents.
  row: () => Promise<Row>
  missing: Missing[]
}

// CHECKs that test IS NOT NULL to forbid a value, so no missing value breaks them.
const NOT_REQUIRING: Record<string, string> = {
  shop_addresses_default_not_archived_check: 'an archived address cannot stay the default',
  user_addresses_default_not_archived_check: 'an archived address cannot stay the default',
}

const verifiedUser = (values: Row = {}): Row => ({
  email: `user-${next()}@example.com`,
  full_name: 'Sita Shrestha',
  password_hash: 'x',
  ...values,
})

async function shopRow(values: Row = {}) {
  return shopValues(await insertUser(), values)
}

const APPROVED = async (): Promise<Row> => ({
  approved_at: NOW,
  approved_by: await insertUser(),
})

async function mediaRow(values: Row) {
  return {
    shop_id: await insertShop(),
    kind: 'product_image',
    original_key: `uploads/${randomUUID()}`,
    mime: 'image/webp',
    bytes: 2048,
    uploaded_by: await insertUser(),
    ...values,
  }
}

const READY_MEDIA: Row = {
  status: 'ready',
  upload_etag: 'etag-1',
  upload_bytes: 2048,
  sha256: randomBytes(32),
  processed_at: NOW,
  derived_keys: JSON.stringify({ '800': 'p/800.webp' }),
  width: 800,
  height: 800,
}

// The four disclosures a submitted product needs (docs/04a §7.6), imported from India.
const DISCLOSED: Row = {
  description: 'Hand-stitched cotton kurta.',
  manufacturer_name: 'Thulo Pasal Garments',
  warranty_text: 'No warranty',
  care_and_precautions: 'Hand wash cold; dry in shade.',
  is_imported: true,
  country_of_origin: 'IN',
}

async function productRow(values: Row) {
  return productValues(await insertShop(), values)
}

async function shopOrderRow(values: Row) {
  const shopId = await insertShop()
  const order = await insertOrder()
  return shopOrderValues(order.id, shopId, `${order.number}-1`, values)
}

// A shipment row of a courier booking that the courier confirmed (docs/04a §11.5).
async function bookedShipment(values: Row) {
  const courier = await courierShop()
  const shopOrder = await insertShopOrder(courier.shopId)
  return {
    shop_order_id: shopOrder.id,
    shop_id: courier.shopId,
    logistics_account_id: courier.accountId,
    pickup_address_id: courier.addressId,
    merchant_reference: `${shopOrder.number}-S1`,
    cod_amount_minor: 110000,
    service_code: 'standard',
    status: 'booked',
    external_shipment_id: `TC-${next()}`,
    booked_at: NOW,
    ...values,
  }
}

// A shipment the vendor ships themselves (manual path).
async function manualShipment(values: Row) {
  const shopOrder = await insertShopOrder(await insertShop())
  return { shop_order_id: shopOrder.id, shop_id: shopOrder.shopId, ...values }
}

const HANDED_OVER: Row = { shipped_at: NOW, courier_name: 'Test Courier', attempt_count: 1 }

async function shipmentEventRow(values: Row) {
  const shopOrder = await insertShopOrder(await insertShop())
  const [shipment] = await db
    .table('shipments')
    .insert({ shop_order_id: shopOrder.id, shop_id: shopOrder.shopId })
    .returning('id')
  return { shipment_id: shipment.id, shop_id: shopOrder.shopId, ...values }
}

async function returnRequestRow(values: Row) {
  const shopOrder = await insertShopOrder(await insertShop())
  return {
    number: `RT-${orderNumber().slice(3)}`,
    order_id: shopOrder.orderId,
    shop_order_id: shopOrder.id,
    shop_id: shopOrder.shopId,
    requested_by_user_id: shopOrder.customerUserId,
    reason_code: 'size_issue',
    ...values,
  }
}

const RETURN_APPROVED: Row = { approved_at: NOW, refund_due_at: LATER }

// A refund of a collected COD shop order (docs/04a §12.4), approved by staff.
async function refundRow(values: Row) {
  const shopOrder = await insertShopOrder(await insertShop())
  const paymentId = await insertCodPayment(shopOrder, true)
  return {
    order_id: shopOrder.orderId,
    shop_order_id: shopOrder.id,
    shop_id: shopOrder.shopId,
    payment_id: paymentId,
    amount_minor: 10000,
    method: 'gateway_manual',
    reason_code: 'goodwill',
    affects_vendor_ledger: true,
    due_at: LATER,
    provider_idempotency_key: randomUUID(),
    created_by: await insertStaff(),
    status: 'approved',
    approved_by: await insertStaff(),
    approved_at: NOW,
    ...values,
  }
}

async function payoutRow(values: Row) {
  const shopId = await insertShop()
  return {
    shop_id: shopId,
    payout_account_id: await insertPayoutAccount(shopId),
    amount_minor: 50000,
    period_start: db.raw(`now() - interval '7 days'`),
    period_end: NOW,
    created_by: await insertStaff(),
    ...values,
  }
}

const PAYOUT_APPROVED = async (): Promise<Row> => ({
  approved_by: await insertStaff(),
  approved_at: NOW,
})

function supportCaseRow(values: Row): Row {
  return {
    number: `SC-${orderNumber().slice(3)}`,
    category: 'other',
    subject: 'Parcel not received',
    due_at: db.raw(`now() + interval '15 days'`),
    ...values,
  }
}

const RESOLVED: Row = {
  resolution_summary: 'Parcel delivered on the second attempt.',
  resolved_at: NOW,
}

// A recipient member of the order's `shipping_address` snapshot set to JSON null.
const withoutMember = (member: string): Missing => ({
  label: `shipping_address.${member}`,
  change: (values) => ({
    ...values,
    shipping_address: JSON.stringify({
      ...JSON.parse(values.shipping_address as string),
      [member]: null,
    }),
  }),
})

const CASES: Case[] = [
  // docs/04a §5.1 users
  {
    constraint: 'users_active_verified_check',
    table: 'users',
    state: 'an active user',
    row: async () => verifiedUser({ status: 'active', email_verified_at: NOW }),
    missing: ['email_verified_at'],
  },
  {
    constraint: 'users_anonymized_check',
    table: 'users',
    state: 'an anonymised user',
    row: async () => {
      const id = randomUUID()
      return {
        id,
        email: `deleted-${id}@anonymized.invalid`,
        status: 'anonymized',
        anonymized_at: NOW,
      }
    },
    missing: ['anonymized_at'],
  },
  {
    constraint: 'users_deactivated_check',
    table: 'users',
    state: 'a deactivated user',
    row: async () => verifiedUser({ status: 'deactivated', deletion_requested_at: NOW }),
    missing: ['deletion_requested_at'],
  },
  {
    constraint: 'users_identity_required_check',
    table: 'users',
    state: 'a user not anonymised',
    row: async () => verifiedUser(),
    missing: ['full_name', 'password_hash'],
  },
  {
    constraint: 'users_mfa_check',
    table: 'users',
    state: 'a user with MFA on',
    row: async () => verifiedUser({ mfa_enabled_at: NOW, mfa_totp_secret_enc: CIPHERTEXT }),
    missing: ['mfa_totp_secret_enc'],
  },
  {
    constraint: 'users_phone_parts_check',
    table: 'users',
    state: 'a user with a phone number',
    row: async () =>
      verifiedUser({ phone_enc: CIPHERTEXT, phone_hash: randomBytes(32), phone_last4: '4567' }),
    missing: ['phone_enc', 'phone_hash', 'phone_last4'],
  },
  // docs/04a §5.4 platform_staff
  {
    constraint: 'platform_staff_revocation_check',
    table: 'platform_staff',
    state: 'a revoked staff role',
    row: async () => ({
      user_id: await insertUser(),
      role: 'support_agent',
      revoked_at: NOW,
      revoked_by: await insertUser(),
    }),
    missing: ['revoked_by'],
  },
  // docs/04a §6.1 shops (`active` needs an agreement row, so the states avoid it)
  {
    constraint: 'shops_approval_check',
    table: 'shops',
    state: 'a closed shop',
    row: async () => shopRow({ status: 'closed', closed_at: NOW, ...(await APPROVED()) }),
    missing: ['approved_at', 'approved_by'],
  },
  {
    constraint: 'shops_closed_check',
    table: 'shops',
    state: 'a closed shop',
    row: async () => shopRow({ status: 'closed', closed_at: NOW, ...(await APPROVED()) }),
    missing: ['closed_at'],
  },
  {
    constraint: 'shops_grievance_contact_check',
    table: 'shops',
    state: 'a shop whose personal data is not redacted',
    row: async () => shopRow(),
    missing: ['grievance_contact_name', 'grievance_contact_phone_enc'],
  },
  {
    constraint: 'shops_registered_business_check',
    table: 'shops',
    state: 'a registered business',
    row: async () =>
      shopRow({
        business_type: 'registered_business',
        business_registration_number: '12345/078/079',
        business_registration_authority: 'Office of the Company Registrar',
        pan_vat_number: '123456789',
      }),
    missing: ['business_registration_number', 'business_registration_authority', 'pan_vat_number'],
  },
  {
    constraint: 'shops_suspension_mode_check',
    table: 'shops',
    state: 'a suspended shop',
    row: async () =>
      shopRow({ status: 'suspended', suspension_mode: 'frozen', ...(await APPROVED()) }),
    missing: ['suspension_mode'],
  },
  {
    constraint: 'shops_vat_requires_pan_check',
    table: 'shops',
    state: 'a VAT-registered shop',
    row: async () => shopRow({ is_vat_registered: true, pan_vat_number: '123456789' }),
    missing: ['pan_vat_number'],
  },
  // docs/04a §6.2 shop_memberships
  {
    constraint: 'shop_memberships_removal_check',
    table: 'shop_memberships',
    state: 'a removed member',
    row: async () => ({
      shop_id: await insertShop(),
      user_id: await insertUser(),
      role: 'viewer',
      status: 'removed',
      removed_at: NOW,
    }),
    missing: ['removed_at'],
  },
  // docs/04a §6.3 shop_invitations
  {
    constraint: 'shop_invitations_outcome_check',
    table: 'shop_invitations',
    state: 'an accepted invitation',
    row: async () => ({
      shop_id: await insertShop(),
      email: `staff-${next()}@example.com`,
      role: 'viewer',
      token_hash: randomBytes(32),
      expires_at: LATER,
      invited_by: await insertUser(),
      accepted_at: NOW,
      accepted_by_user_id: await insertUser(),
    }),
    missing: ['accepted_by_user_id'],
  },
  // docs/04a §6.5 shop_review_decisions
  {
    constraint: 'shop_review_decisions_reason_check',
    table: 'shop_review_decisions',
    state: 'a rejection',
    row: async () => ({
      shop_id: await insertShop(),
      decision: 'rejected',
      decided_by: await insertUser(),
      reason: 'The PAN certificate does not match the shop name.',
    }),
    missing: ['reason'],
  },
  {
    constraint: 'shop_review_decisions_suspension_mode_check',
    table: 'shop_review_decisions',
    state: 'a suspension',
    row: async () => ({
      shop_id: await insertShop(),
      decision: 'suspended',
      decided_by: await insertUser(),
      reason: 'Repeated counterfeit listings after two warnings.',
      suspension_mode: 'fulfill_existing',
    }),
    missing: ['suspension_mode'],
  },
  // docs/04a §6.7 shop_payout_accounts
  {
    constraint: 'shop_payout_accounts_account_number_check',
    table: 'shop_payout_accounts',
    state: 'a current payout account',
    row: async () => ({
      shop_id: await insertShop(),
      method: 'bank_transfer',
      account_name: 'Thulo Pasal Pvt Ltd',
      bank_name: 'Nabil Bank',
      account_number_enc: CIPHERTEXT,
      account_number_last4: '4567',
      created_by: await insertUser(),
    }),
    missing: ['account_number_enc'],
  },
  {
    constraint: 'shop_payout_accounts_verification_check',
    table: 'shop_payout_accounts',
    state: 'a verified payout account',
    row: async () => ({
      shop_id: await insertShop(),
      method: 'wallet',
      account_name: 'Thulo Pasal Pvt Ltd',
      bank_name: 'Khalti',
      account_number_enc: CIPHERTEXT,
      account_number_last4: '4567',
      created_by: await insertUser(),
      verified_at: NOW,
      verified_by: await insertStaff(),
    }),
    missing: ['verified_by'],
  },
  // docs/04a §7.1 categories
  {
    constraint: 'categories_depth_check',
    table: 'categories',
    state: 'a subcategory',
    row: async () => {
      const n = next()
      const [parent] = await db
        .table('categories')
        // A unique name: the seeded tree already has a top-level "Clothing"
        // (categories_parent_name_key, docs/04a §7.1).
        .insert({ slug: `clothing-${n}`, name: `Clothing ${n}`, path: `/clothing-${n}/`, depth: 1 })
        .returning('id')
      return {
        slug: `kurta-${n}`,
        name: 'Kurta',
        path: `/clothing-${n}/kurta-${n}/`,
        depth: 2,
        parent_id: parent.id,
      }
    },
    missing: ['parent_id'],
  },
  // docs/04a §7.6 products
  {
    constraint: 'products_disclosures_check',
    table: 'products',
    state: 'a product in review',
    row: async () => productRow({ status: 'pending_review', submitted_at: NOW, ...DISCLOSED }),
    missing: [
      'description',
      'manufacturer_name',
      'warranty_text',
      'care_and_precautions',
      'country_of_origin',
    ],
  },
  {
    constraint: 'products_published_at_check',
    table: 'products',
    state: 'a published product',
    row: async () =>
      productRow({
        status: 'published',
        published_at: NOW,
        first_published_at: NOW,
        submitted_at: NOW,
        ...DISCLOSED,
      }),
    missing: ['published_at', 'first_published_at'],
  },
  {
    constraint: 'products_rejection_check',
    table: 'products',
    state: 'a rejected product',
    row: async () => productRow({ status: 'rejected', rejection_reason: 'Blurry photos' }),
    missing: ['rejection_reason'],
  },
  {
    constraint: 'products_submitted_check',
    table: 'products',
    state: 'a product in review',
    row: async () => productRow({ status: 'pending_review', submitted_at: NOW, ...DISCLOSED }),
    missing: ['submitted_at'],
  },
  // docs/04a §7.11 product_review_decisions
  {
    constraint: 'product_review_decisions_reason_required_check',
    table: 'product_review_decisions',
    state: 'a rejection',
    row: async () => {
      const product = await productRow({})
      const [row] = await db.table('products').insert(product).returning('id')
      return {
        product_id: row.id,
        shop_id: product.shop_id,
        decision: 'rejected',
        decided_by: await insertUser(),
        reason_code: 'poor_images',
        note: 'The photos are too dark to see the fabric.',
      }
    },
    missing: ['reason_code', 'note'],
  },
  // docs/04a §7.13 media_assets
  {
    constraint: 'media_assets_document_type_check',
    table: 'media_assets',
    state: 'a KYC document',
    row: async () =>
      mediaRow({
        kind: 'kyc_document',
        mime: 'application/pdf',
        document_type: 'pan_vat_certificate',
      }),
    missing: ['document_type'],
  },
  {
    constraint: 'media_assets_ready_check',
    table: 'media_assets',
    state: 'a ready product image',
    row: async () => mediaRow(READY_MEDIA),
    missing: ['sha256', 'processed_at', 'derived_keys', 'width', 'height'],
  },
  {
    constraint: 'media_assets_rejected_check',
    table: 'media_assets',
    state: 'a rejected upload',
    row: async () => mediaRow({ status: 'rejected', rejection_reason: 'Not an image' }),
    missing: ['rejection_reason'],
  },
  {
    constraint: 'media_assets_upload_check',
    table: 'media_assets',
    state: 'an upload being processed',
    row: async () => mediaRow({ status: 'processing', upload_etag: 'etag-1', upload_bytes: 2048 }),
    missing: ['upload_etag', 'upload_bytes'],
  },
  // docs/04a §8.2 inventory_reservations
  {
    constraint: 'inventory_reservations_expiry_check',
    table: 'inventory_reservations',
    state: 'a held reservation',
    row: async () => reservationRow({ status: 'held', expires_at: LATER }),
    missing: ['expires_at'],
  },
  {
    constraint: 'inventory_reservations_resolved_check',
    table: 'inventory_reservations',
    state: 'a released reservation',
    row: async () => reservationRow({ status: 'released', resolved_at: NOW }),
    missing: ['resolved_at'],
  },
  // docs/04a §9.9 logistics_accounts
  {
    constraint: 'logistics_accounts_active_check',
    table: 'logistics_accounts',
    state: 'an active courier account',
    row: async () =>
      courierAccountRow({ status: 'active', credentials_enc: CIPHERTEXT, verified_at: NOW }),
    missing: ['credentials_enc', 'verified_at'],
  },
  {
    constraint: 'logistics_accounts_disabled_check',
    table: 'logistics_accounts',
    state: 'a disabled courier account',
    row: async () => courierAccountRow({ status: 'disabled', disabled_at: NOW }),
    missing: ['disabled_at'],
  },
  {
    constraint: 'logistics_accounts_owner_check',
    table: 'logistics_accounts',
    state: "a shop's own courier account",
    row: async () => courierAccountRow({}),
    missing: ['shop_id'],
  },
  // docs/04a §9.10 logistics_account_shops
  {
    constraint: 'logistics_account_shops_active_check',
    table: 'logistics_account_shops',
    state: 'a platform account turned off for a shop',
    row: async () => {
      const account = await courierAccountRow({ owner_type: 'platform', shop_id: null })
      const [row] = await db.table('logistics_accounts').insert(account).returning('id')
      return {
        account_id: row.id,
        shop_id: await insertShop(),
        account_owner_type: 'platform',
        is_active: false,
        disabled_at: NOW,
      }
    },
    missing: ['disabled_at'],
  },
  {
    constraint: 'logistics_account_shops_owner_check',
    table: 'logistics_account_shops',
    state: "a shop's own account",
    row: async () => {
      const account = await courierAccountRow({})
      const [row] = await db.table('logistics_accounts').insert(account).returning('id')
      return {
        account_id: row.id,
        shop_id: account.shop_id,
        account_owner_type: 'shop',
        owner_shop_id: account.shop_id,
      }
    },
    missing: ['owner_shop_id'],
  },
  // docs/04a §9.11 shop_logistics_settings
  {
    constraint: 'shop_logistics_settings_mode_check',
    table: 'shop_logistics_settings',
    state: 'a shop that books its own courier',
    row: async () => {
      const courier = await courierShop()
      return {
        shop_id: courier.shopId,
        fulfillment_mode: 'vendor',
        default_account_id: courier.accountId,
        default_account_owner_type: 'shop',
      }
    },
    missing: ['default_account_id'],
  },
  // docs/04a §10.1 carts
  {
    constraint: 'carts_owner_check',
    table: 'carts',
    state: 'a signed-in cart',
    row: async () => ({ user_id: await insertUser(), expires_at: LATER }),
    missing: ['user_id'],
  },
  // docs/04a §11.1 orders
  {
    constraint: 'orders_recipient_present_check',
    table: 'orders',
    state: 'an order with its customer email',
    row: async () => {
      await insertLocation()
      return orderValues(await insertUser())
    },
    missing: [withoutMember('recipient_name_enc'), withoutMember('recipient_phone_enc')],
  },
  {
    constraint: 'orders_verification_check',
    table: 'orders',
    state: 'a verified order',
    row: async () => {
      await insertLocation()
      return orderValues(await insertUser(), {
        verification_status: 'verified',
        verification_method: 'phone_call',
        verified_at: NOW,
      })
    },
    missing: ['verification_method', 'verified_at'],
  },
  // docs/04a §11.2 shop_orders
  {
    constraint: 'shop_orders_acceptance_due_check',
    table: 'shop_orders',
    state: 'a shop order awaiting acceptance',
    row: async () => shopOrderRow({}),
    missing: ['acceptance_due_at'],
  },
  {
    constraint: 'shop_orders_accepted_check',
    table: 'shop_orders',
    state: 'an accepted shop order',
    row: async () => shopOrderRow({ status: 'accepted', accepted_at: NOW }),
    missing: ['accepted_at'],
  },
  {
    constraint: 'shop_orders_cancelled_check',
    table: 'shop_orders',
    state: 'a cancelled shop order',
    row: async () =>
      shopOrderRow({
        status: 'cancelled',
        cancel_reason: 'customer_cancelled',
        cancelled_at: NOW,
      }),
    missing: ['cancel_reason', 'cancelled_at'],
  },
  {
    constraint: 'shop_orders_completed_check',
    table: 'shop_orders',
    state: 'a completed shop order',
    row: async () => shopOrderRow({ status: 'completed', accepted_at: NOW, completed_at: NOW }),
    missing: ['completed_at'],
  },
  {
    constraint: 'shop_orders_rejected_check',
    table: 'shop_orders',
    state: 'a rejected shop order',
    row: async () =>
      shopOrderRow({ status: 'rejected', rejection_reason: 'out_of_stock', rejected_at: NOW }),
    missing: ['rejection_reason', 'rejected_at'],
  },
  // docs/04a §11.4 order_events
  {
    constraint: 'order_events_actor_check',
    table: 'order_events',
    state: 'an event by the customer',
    row: async () => {
      const order = await insertOrder()
      return {
        order_id: order.id,
        type: 'order.placed',
        visibility: 'customer',
        actor_type: 'customer',
        actor_user_id: order.customerUserId,
      }
    },
    missing: ['actor_user_id'],
  },
  {
    constraint: 'order_events_shop_visibility_check',
    table: 'order_events',
    state: 'an event the shop sees',
    row: async () => {
      const shopOrder = await insertShopOrder(await insertShop())
      return {
        order_id: shopOrder.orderId,
        shop_order_id: shopOrder.id,
        type: 'shop_order.accepted',
        visibility: 'shop',
        actor_type: 'system',
      }
    },
    missing: ['shop_order_id'],
  },
  // docs/04a §11.5 shipments
  {
    constraint: 'shipments_booked_check',
    table: 'shipments',
    state: 'a booked courier shipment',
    row: async () => bookedShipment({}),
    missing: ['external_shipment_id', 'booked_at'],
  },
  {
    constraint: 'shipments_cancelled_check',
    table: 'shipments',
    state: 'a cancelled courier booking',
    row: async () => bookedShipment({ status: 'cancelled', cancelled_at: NOW }),
    missing: ['cancelled_at'],
  },
  {
    constraint: 'shipments_delivered_check',
    table: 'shipments',
    state: 'a delivered shipment',
    row: async () =>
      manualShipment({
        ...HANDED_OVER,
        status: 'delivered',
        delivered_at: NOW,
        return_window_ends_at: LATER,
      }),
    missing: ['delivered_at'],
  },
  {
    constraint: 'shipments_path_check',
    table: 'shipments',
    state: 'a courier shipment',
    row: async () => bookedShipment({}),
    missing: ['pickup_address_id', 'merchant_reference', 'cod_amount_minor'],
  },
  {
    constraint: 'shipments_return_window_check',
    table: 'shipments',
    state: 'a delivered shipment',
    row: async () =>
      manualShipment({
        ...HANDED_OVER,
        status: 'delivered',
        delivered_at: NOW,
        return_window_ends_at: LATER,
      }),
    missing: ['return_window_ends_at'],
  },
  {
    constraint: 'shipments_shipped_check',
    table: 'shipments',
    state: 'a shipped shipment',
    row: async () => manualShipment({ ...HANDED_OVER, status: 'shipped' }),
    missing: ['shipped_at', 'courier_name'],
  },
  // docs/04a §11.6 shipment_events
  {
    constraint: 'shipment_events_actor_check',
    table: 'shipment_events',
    state: 'an event by a shop member',
    row: async () =>
      shipmentEventRow({
        event: 'packed',
        status: 'packed',
        actor_type: 'shop_member',
        actor_user_id: await insertUser(),
      }),
    missing: ['actor_user_id'],
  },
  {
    constraint: 'shipment_events_provider_check',
    table: 'shipment_events',
    state: 'a courier update',
    row: async () =>
      shipmentEventRow({
        event: 'in_transit',
        status: 'shipped',
        actor_type: 'provider',
        raw_status: 'Arrived at hub',
      }),
    missing: ['raw_status'],
  },
  {
    constraint: 'shipment_events_reason_check',
    table: 'shipment_events',
    state: 'a failed delivery',
    row: async () =>
      shipmentEventRow({
        event: 'delivery_failed',
        status: 'delivery_failed',
        actor_type: 'system',
        reason_code: 'customer_unreachable',
      }),
    missing: ['reason_code'],
  },
  // docs/04a §11.7 return_requests
  {
    constraint: 'return_requests_approved_check',
    table: 'return_requests',
    state: 'an approved return',
    row: async () => returnRequestRow({ status: 'approved', ...RETURN_APPROVED }),
    missing: ['approved_at', 'refund_due_at'],
  },
  {
    constraint: 'return_requests_closed_check',
    table: 'return_requests',
    state: 'a closed return',
    row: async () =>
      returnRequestRow({ status: 'closed', ...RETURN_APPROVED, received_at: NOW, closed_at: NOW }),
    missing: ['closed_at'],
  },
  {
    constraint: 'return_requests_received_check',
    table: 'return_requests',
    state: 'a received return',
    row: async () => returnRequestRow({ status: 'received', ...RETURN_APPROVED, received_at: NOW }),
    missing: ['received_at'],
  },
  {
    constraint: 'return_requests_resolution_check',
    table: 'return_requests',
    state: 'a rejected return',
    row: async () =>
      returnRequestRow({ status: 'rejected', resolution_note: 'Worn and without tags.' }),
    missing: ['resolution_note'],
  },
  // docs/04a §12.1 payments
  {
    constraint: 'payments_captured_state_check',
    table: 'payments',
    state: 'a collected COD payment',
    row: async () => {
      const shopOrder = await insertShopOrder(await insertShop())
      return {
        order_id: shopOrder.orderId,
        shop_order_id: shopOrder.id,
        method: 'cod',
        status: 'collected',
        amount_minor: 110000,
        captured_minor: 110000,
        captured_at: NOW,
      }
    },
    missing: ['captured_at'],
  },
  {
    constraint: 'payments_cod_shape_check',
    table: 'payments',
    state: 'a COD payment',
    row: async () => {
      const shopOrder = await insertShopOrder(await insertShop())
      return {
        order_id: shopOrder.orderId,
        shop_order_id: shopOrder.id,
        method: 'cod',
        status: 'awaiting_collection',
        amount_minor: 110000,
      }
    },
    missing: ['shop_order_id'],
  },
  // docs/04a §12.3 provider_events
  {
    constraint: 'provider_events_subject_check',
    table: 'provider_events',
    state: 'a payment lookup',
    row: async () => {
      const order = await insertOrder({ status: 'awaiting_payment', payment_method: 'esewa' })
      const [payment] = await db
        .table('payments')
        .insert({ order_id: order.id, method: 'esewa', status: 'initiated', amount_minor: 110000 })
        .returning('id')
      return {
        provider: 'esewa',
        provider_event_key: `lookup:${randomUUID()}`,
        kind: 'lookup',
        payload: JSON.stringify({ status: 'PENDING' }),
        payment_id: payment.id,
      }
    },
    missing: ['payment_id'],
  },
  {
    constraint: 'provider_events_subject_check',
    table: 'provider_events',
    state: 'a refund lookup',
    row: async () => {
      const refund = await refundRow({})
      const [row] = await db.table('refunds').insert(refund).returning('id')
      return {
        provider: 'esewa',
        provider_event_key: `refund_lookup:${randomUUID()}`,
        kind: 'refund_lookup',
        payload: JSON.stringify({ status: 'PENDING' }),
        refund_id: row.id,
      }
    },
    missing: ['refund_id'],
  },
  {
    constraint: 'provider_events_processing_check',
    table: 'provider_events',
    state: 'a processed provider event',
    row: async () => ({
      provider: 'khalti',
      provider_event_key: `return:${randomUUID()}`,
      kind: 'return',
      payload: JSON.stringify({ status: 'Completed' }),
      processing_status: 'processed',
      processed_at: NOW,
    }),
    missing: ['processed_at'],
  },
  // docs/04a §12.4 refunds
  {
    constraint: 'refunds_approved_check',
    table: 'refunds',
    state: 'an approved refund',
    row: async () => refundRow({}),
    missing: ['approved_at'],
  },
  {
    constraint: 'refunds_approver_check',
    table: 'refunds',
    state: 'an approved refund requested by staff',
    row: async () => refundRow({}),
    missing: ['approved_by'],
  },
  {
    constraint: 'refunds_recipient_check',
    table: 'refunds',
    state: 'an approved bank-transfer refund',
    row: async () => refundRow({ method: 'manual_transfer', recipient_details_enc: CIPHERTEXT }),
    missing: ['recipient_details_enc'],
  },
  {
    constraint: 'refunds_return_reason_check',
    table: 'refunds',
    state: 'a refund of an accepted return',
    row: async () => {
      const refund = await refundRow({ reason_code: 'return_accepted' })
      const returnRequestId = await insertReturnRequest(
        {
          id: refund.shop_order_id as string,
          orderId: refund.order_id as string,
          shopId: refund.shop_id as string,
          number: '',
          customerUserId: await orderCustomer(refund.order_id as string),
        },
        { status: 'approved', ...RETURN_APPROVED }
      )
      return { ...refund, return_request_id: returnRequestId }
    },
    missing: ['return_request_id'],
  },
  {
    constraint: 'refunds_succeeded_check',
    table: 'refunds',
    state: 'a refund paid by hand',
    row: async () =>
      refundRow({ status: 'succeeded', succeeded_at: NOW, paid_reference: 'NABIL-TXN-0001' }),
    missing: ['succeeded_at', 'paid_reference'],
  },
  // docs/04a §13.1 ledger_entries
  {
    constraint: 'ledger_entries_reference_check',
    table: 'ledger_entries',
    state: 'a sale',
    row: async () => {
      const shopOrder = await insertShopOrder(await insertShop())
      return {
        shop_id: shopOrder.shopId,
        shop_order_id: shopOrder.id,
        entry_type: 'sale',
        amount_minor: 100000,
        available_at: LATER,
        description: 'Sale',
        dedupe_key: `delivery:${randomUUID()}:sale`,
      }
    },
    missing: ['shop_order_id'],
  },
  {
    constraint: 'ledger_entries_reference_check',
    table: 'ledger_entries',
    state: 'an adjustment',
    row: async () => ({
      shop_id: await insertShop(),
      entry_type: 'adjustment',
      amount_minor: 10000,
      available_at: NOW,
      description: 'Correction agreed with the vendor by phone',
      created_by: await insertUser(),
      dedupe_key: `adjustment:${randomUUID()}`,
    }),
    missing: ['created_by'],
  },
  // docs/04a §13.2 payouts
  {
    constraint: 'payouts_approved_check',
    table: 'payouts',
    state: 'an approved payout',
    row: async () => payoutRow({ status: 'approved', ...(await PAYOUT_APPROVED()) }),
    missing: ['approved_by', 'approved_at'],
  },
  {
    constraint: 'payouts_cancelled_check',
    table: 'payouts',
    state: 'a cancelled payout',
    row: async () => payoutRow({ status: 'cancelled', cancelled_at: NOW }),
    missing: ['cancelled_at'],
  },
  {
    constraint: 'payouts_failed_check',
    table: 'payouts',
    state: 'a failed payout',
    row: async () =>
      payoutRow({
        status: 'failed',
        ...(await PAYOUT_APPROVED()),
        failed_at: NOW,
        failure_reason: 'Account closed',
      }),
    missing: ['failed_at', 'failure_reason'],
  },
  {
    constraint: 'payouts_paid_check',
    table: 'payouts',
    state: 'a paid payout',
    row: async () =>
      payoutRow({
        status: 'paid',
        ...(await PAYOUT_APPROVED()),
        paid_at: NOW,
        bank_reference: 'NABIL-0001',
      }),
    missing: ['paid_at', 'bank_reference'],
  },
  // docs/04a §14.1 support_cases
  {
    constraint: 'support_cases_closed_check',
    table: 'support_cases',
    state: 'a closed case',
    row: async () => supportCaseRow({ status: 'closed', ...RESOLVED, closed_at: NOW }),
    missing: ['closed_at'],
  },
  {
    constraint: 'support_cases_links_check',
    table: 'support_cases',
    state: 'a case about an order',
    row: async () => {
      const order = await insertOrder()
      return supportCaseRow({ order_id: order.id, customer_user_id: order.customerUserId })
    },
    missing: ['customer_user_id'],
  },
  {
    constraint: 'support_cases_links_check',
    table: 'support_cases',
    state: 'a case about a shop order',
    row: async () => {
      const shopOrder = await insertShopOrder(await insertShop())
      return supportCaseRow({
        order_id: shopOrder.orderId,
        customer_user_id: shopOrder.customerUserId,
        shop_order_id: shopOrder.id,
        shop_id: shopOrder.shopId,
      })
    },
    missing: ['shop_id'],
  },
  {
    constraint: 'support_cases_resolution_check',
    table: 'support_cases',
    state: 'a resolved case',
    row: async () => supportCaseRow({ status: 'resolved', ...RESOLVED }),
    missing: ['resolution_summary', 'resolved_at'],
  },
  // docs/04a §14.2 support_case_messages
  {
    constraint: 'support_case_messages_author_type_check',
    table: 'support_case_messages',
    state: 'a message by the customer',
    row: async () => {
      const [supportCase] = await db
        .table('support_cases')
        .insert(supportCaseRow({}))
        .returning('id')
      return {
        case_id: supportCase.id,
        author_type: 'customer',
        author_user_id: await insertUser(),
        visibility: 'customer',
        body: 'My parcel has not arrived yet.',
      }
    },
    missing: ['author_user_id'],
  },
  // docs/04a §14.3 notification_deliveries
  {
    constraint: 'notification_deliveries_sent_check',
    table: 'notification_deliveries',
    state: 'a sent email',
    row: async () => ({
      dedupe_key: `order.placed.customer:${randomUUID()}`,
      template: 'order.placed.customer',
      status: 'sent',
      sent_at: NOW,
    }),
    missing: ['sent_at'],
  },
  // docs/04a §15.3 audit_logs
  {
    constraint: 'audit_logs_actor_check',
    table: 'audit_logs',
    state: 'an action by a shop member',
    row: async () => ({
      actor_type: 'shop_member',
      actor_user_id: await insertUser(),
      action: 'shop.update',
      subject_type: 'shop',
      subject_id: randomUUID(),
    }),
    missing: ['actor_user_id'],
  },
]

// The stock row and a held line of a new order (docs/04a §8.2).
async function reservationRow(values: Row) {
  const shopOrder = await insertShopOrder(await insertShop())
  const line = await insertOrderLine(shopOrder)
  await insertInventoryItem(shopOrder.shopId, line.variantId, { on_hand: 5 })
  return {
    shop_id: shopOrder.shopId,
    variant_id: line.variantId,
    order_id: shopOrder.orderId,
    order_item_id: line.id,
    quantity: 2,
    ...values,
  }
}

async function courierAccountRow(values: Row) {
  await db
    .table('logistics_providers')
    .insert({ code: 'test_courier', name: 'Test Courier' })
    .onConflict('code')
    .ignore()
  return {
    provider_code: 'test_courier',
    name: 'Test Courier Kathmandu',
    environment: 'sandbox',
    owner_type: 'shop',
    shop_id: await insertShop(),
    ...values,
  }
}

async function orderCustomer(orderId: string) {
  const order = await db
    .from('orders')
    .where('id', orderId)
    .select('customer_user_id')
    .firstOrFail()
  return order.customer_user_id as string
}

// `IS NOT NULL`, or an `IS NULL` compared with something else, on either side
// (`=`, `<>`, `IS [NOT] DISTINCT FROM`); the operand of a right-hand `IS NULL`
// may be one parenthesised expression such as `(shipping_address ->> 'x'::text)`.
const COMPARE = String.raw`(=|<>|IS (NOT )?DISTINCT FROM)`
const COMPARED_IS_NULL = [
  'IS NOT NULL',
  String.raw`IS NULL\) ${COMPARE} `,
  String.raw` ${COMPARE} \((\([^()]*\)|[^()])* IS NULL\)`,
].join('|')

// Every state-dependent CHECK (docs/04a §5), by name.
async function stateDependentChecks(): Promise<string[]> {
  const { rows } = await db.rawQuery(
    String.raw`
    SELECT con.conname AS constraint
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE con.contype = 'c' AND nsp.nspname = 'public'
       AND pg_get_constraintdef(con.oid) ~ ?
     ORDER BY 1
  `,
    [COMPARED_IS_NULL]
  )
  return (rows as { constraint: string }[]).map((row) => row.constraint)
}

test.group('T-ARCH-015 state-dependent CHECKs', () => {
  test('T-ARCH-015 every state-dependent CHECK has a case', async ({ assert }) => {
    const checks = await stateDependentChecks()
    assert.isAbove(checks.length, 0, 'the catalogue query finds the CHECKs')
    const covered = new Set(CASES.map((testCase) => testCase.constraint))
    for (const check of checks) {
      assert.isTrue(
        covered.has(check) || check in NOT_REQUIRING,
        `${check} is state-dependent (docs/04a §5): add a case with a row whose required value is missing`
      )
    }
    for (const name of [...covered, ...Object.keys(NOT_REQUIRING)]) {
      assert.include(checks, name, `${name} is listed here but is not a state-dependent CHECK`)
    }
  })

  test('T-ARCH-015 {constraint} refuses {state} without a required value')
    .with(CASES)
    .run(async ({ assert }, { constraint, table, state, row, missing }) => {
      const values = await row()
      await accepted(assert, (trx) => trx.table(table).insert(values), `${state}, complete`)
      for (const gap of missing) {
        const label = typeof gap === 'string' ? gap : gap.label
        const broken = typeof gap === 'string' ? { ...values, [gap]: null } : gap.change(values)
        await refused(
          assert,
          (trx) => trx.table(table).insert(broken),
          { code: '23514', constraint },
          `${state} without ${label}`
        )
      }
    })
})
