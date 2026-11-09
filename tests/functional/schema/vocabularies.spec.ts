import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { CURRENCIES } from '#modules/platform/money'
import { ACTOR_TYPES } from '#modules/audit/domain/actor_type'
import { CART_STATUSES } from '#modules/cart/domain/cart_status'
import { ATTRIBUTE_INPUTS } from '#modules/catalog/domain/attribute_input'
import { ATTRIBUTE_SCOPES } from '#modules/catalog/domain/attribute_scope'
import { BRAND_STATUSES } from '#modules/catalog/domain/brand_status'
import { CATEGORY_ATTRIBUTE_USAGES } from '#modules/catalog/domain/category_attribute_usage'
import { PRODUCT_REVIEW_DECISIONS } from '#modules/catalog/domain/product_review_decision'
import { PRODUCT_REVIEW_REASONS } from '#modules/catalog/domain/product_review_reason'
import { PRODUCT_STATUSES } from '#modules/catalog/domain/product_status'
import { VARIANT_STATUSES } from '#modules/catalog/domain/variant_status'
import { PLATFORM_STAFF_ROLES } from '#modules/identity/domain/platform_staff_role'
import { USER_STATUSES } from '#modules/identity/domain/user_status'
import { USER_TOKEN_PURPOSES } from '#modules/identity/domain/user_token_purpose'
import { MOVEMENT_KINDS } from '#modules/inventory/domain/movement_kind'
import { VENDOR_ADJUSTMENT_REASONS } from '#modules/inventory/domain/movement_reasons'
import { RESERVATION_STATUSES } from '#modules/inventory/domain/reservation_status'
import { LEDGER_ENTRY_TYPES } from '#modules/ledger/domain/ledger_entry_type'
import { PAYOUT_STATUSES } from '#modules/ledger/domain/payout_status'
import { REMITTANCE_METHODS } from '#modules/ledger/domain/remittance_method'
import { LOCAL_LEVEL_TYPES } from '#modules/logistics/domain/local_level_type'
import { LOGISTICS_ACCOUNT_OWNER_TYPES } from '#modules/logistics/domain/logistics_account_owner_type'
import { LOGISTICS_ACCOUNT_STATUSES } from '#modules/logistics/domain/logistics_account_status'
import { LOGISTICS_ENVIRONMENTS } from '#modules/logistics/domain/logistics_environment'
import { KYC_DOCUMENT_TYPES } from '#modules/media/domain/kyc_document_type'
import { MEDIA_KINDS } from '#modules/media/domain/media_kind'
import { MEDIA_MIME_TYPES } from '#modules/media/domain/media_mime'
import { MEDIA_STATUSES } from '#modules/media/domain/media_status'
import { NOTIFICATION_CHANNELS } from '#modules/notifications/domain/notification_channel'
import { NOTIFICATION_STATUSES } from '#modules/notifications/domain/notification_status'
import { DELIVERY_FAILURE_REASONS } from '#modules/orders/domain/delivery_failure_reason'
import { ORDER_EVENT_VISIBILITIES } from '#modules/orders/domain/order_event_visibility'
import { ORDER_STATUSES } from '#modules/orders/domain/order_status'
import { ORDER_VERIFICATION_METHODS } from '#modules/orders/domain/order_verification_method'
import { ORDER_VERIFICATION_STATUSES } from '#modules/orders/domain/order_verification_status'
import { RETURN_REASONS } from '#modules/orders/domain/return_reason'
import { RETURN_STATUSES } from '#modules/orders/domain/return_status'
import { SHIPMENT_EVENTS } from '#modules/orders/domain/shipment_event'
import { SHIPMENT_EVENT_ACTOR_TYPES } from '#modules/orders/domain/shipment_event_actor_type'
import { SHIPMENT_STATUSES } from '#modules/orders/domain/shipment_status'
import { SHOP_ORDER_CANCEL_REASONS } from '#modules/orders/domain/shop_order_cancel_reason'
import { SHOP_ORDER_REJECTION_REASONS } from '#modules/orders/domain/shop_order_rejection_reason'
import { SHOP_ORDER_STATUSES } from '#modules/orders/domain/shop_order_status'
import { PAYMENT_METHODS } from '#modules/payments/domain/payment_method'
import { PAYMENT_PROVIDERS } from '#modules/payments/domain/payment_provider'
import {
  COD_PAYMENT_STATUSES,
  GATEWAY_PAYMENT_STATUSES,
} from '#modules/payments/domain/payment_status'
import { PROVIDER_EVENT_KINDS } from '#modules/payments/domain/provider_event_kind'
import { PROVIDER_EVENT_PROCESSING_STATUSES } from '#modules/payments/domain/provider_event_processing_status'
import { REFUND_METHODS } from '#modules/payments/domain/refund_method'
import { REFUND_REASONS } from '#modules/payments/domain/refund_reason'
import { REFUND_STATUSES } from '#modules/payments/domain/refund_status'
import { IDEMPOTENCY_KEY_STATUSES } from '#modules/platform/domain/idempotency_key_status'
import { SUPPORT_CASE_CATEGORIES } from '#modules/platform/domain/support_case_category'
import { SUPPORT_CASE_STATUSES } from '#modules/platform/domain/support_case_status'
import { SUPPORT_MESSAGE_AUTHOR_TYPES } from '#modules/platform/domain/support_message_author_type'
import { SUPPORT_MESSAGE_VISIBILITIES } from '#modules/platform/domain/support_message_visibility'
import { BUSINESS_TYPES } from '#modules/shops/domain/business_type'
import { SHOP_MEMBERSHIP_STATUSES } from '#modules/shops/domain/membership_status'
import { PAYOUT_ACCOUNT_METHODS } from '#modules/shops/domain/payout_account_method'
import { PRODUCT_REVIEW_MODES } from '#modules/shops/domain/product_review_mode'
import { SHOP_ADDRESS_PURPOSES } from '#modules/shops/domain/shop_address_purpose'
import { SHOP_MEMBER_ROLES } from '#modules/shops/domain/shop_member_role'
import { SHOP_REVIEW_DECISIONS } from '#modules/shops/domain/shop_review_decision'
import { SHOP_STATUSES } from '#modules/shops/domain/shop_status'
import { SLUG_REDIRECT_ENTITY_TYPES } from '#modules/shops/domain/slug_redirect_entity_type'
import { SUSPENSION_MODES } from '#modules/shops/domain/suspension_mode'

/*
 * T-ARCH-011 (docs/04 §2.4, §2.6; ADR-0011): the CHECK value lists equal the
 * TypeScript vocabularies, and the set of `ON DELETE CASCADE` foreign keys
 * equals the table of docs/04 §2.6.
 *
 * Vocabularies. Every `col IN (...)` of a CHECK, as `pg_constraint` stores it
 * (`col = ANY (ARRAY[...])`, or `col <> ALL (ARRAY[...])` for `NOT IN`), and
 * every CHECK that is only `col = 'value'` (a one-value `IN`, as PostgreSQL
 * stores it) is a value list of `<table>.<column>`. Every such column maps
 * below to the `as const` arrays of the owning module's `domain/` folder:
 *
 * - `exact(...)`: each array equals one list of the column, values and order,
 *   and every other list of the column (the subsets that state-dependent
 *   CHECKs name) uses only the arrays' values;
 * - `within(...)`: the column copies values of another column's vocabulary
 *   (`product_media.media_kind` for its composite key to `media_assets`,
 *   `shipment_events.status` the shipment status an event leads to), so each
 *   of its lists uses only the array's values.
 *
 * A list without a mapping, or a mapping without a list, fails, and so does a
 * list the parser cannot read, so a new CHECK cannot slip past the test.
 */

type Vocabulary = { kind: 'exact' | 'within'; arrays: (readonly string[])[] }
const exact = (...arrays: (readonly string[])[]): Vocabulary => ({ kind: 'exact', arrays })
const within = (array: readonly string[]): Vocabulary => ({ kind: 'within', arrays: [array] })

// `<table>.<column>` → its vocabulary (docs/04a, per table; modules per docs/03 §4.4).
const VOCABULARIES: Record<string, Vocabulary> = {
  'attributes.input': exact(ATTRIBUTE_INPUTS),
  'attributes.scope': exact(ATTRIBUTE_SCOPES),
  'audit_logs.actor_type': exact(ACTOR_TYPES),
  'cart_items.currency': exact(CURRENCIES),
  'brands.status': exact(BRAND_STATUSES),
  'carts.status': exact(CART_STATUSES),
  'category_attributes.usage': exact(CATEGORY_ATTRIBUTE_USAGES),
  'idempotency_keys.status': exact(IDEMPOTENCY_KEY_STATUSES),
  'inventory_movements.kind': exact(MOVEMENT_KINDS),
  'inventory_movements.reason_code': exact(VENDOR_ADJUSTMENT_REASONS),
  'inventory_reservations.status': exact(RESERVATION_STATUSES),
  'ledger_entries.currency': exact(CURRENCIES),
  'ledger_entries.entry_type': exact(LEDGER_ENTRY_TYPES),
  'local_levels.type': exact(LOCAL_LEVEL_TYPES),
  'logistics_accounts.environment': exact(LOGISTICS_ENVIRONMENTS),
  'logistics_accounts.owner_type': exact(LOGISTICS_ACCOUNT_OWNER_TYPES),
  'logistics_accounts.status': exact(LOGISTICS_ACCOUNT_STATUSES),
  'media_assets.document_type': exact(KYC_DOCUMENT_TYPES),
  'media_assets.kind': exact(MEDIA_KINDS),
  'media_assets.mime': exact(MEDIA_MIME_TYPES),
  'media_assets.status': exact(MEDIA_STATUSES),
  'notification_deliveries.channel': exact(NOTIFICATION_CHANNELS),
  'notification_deliveries.status': exact(NOTIFICATION_STATUSES),
  'order_events.actor_type': exact(ACTOR_TYPES),
  'order_events.visibility': exact(ORDER_EVENT_VISIBILITIES),
  'order_items.currency': exact(CURRENCIES),
  'orders.currency': exact(CURRENCIES),
  'orders.payment_method': exact(PAYMENT_METHODS),
  'orders.status': exact(ORDER_STATUSES),
  'orders.verification_method': exact(ORDER_VERIFICATION_METHODS),
  'orders.verification_status': exact(ORDER_VERIFICATION_STATUSES),
  'payment_allocations.currency': exact(CURRENCIES),
  'payments.currency': exact(CURRENCIES),
  'payments.method': exact(PAYMENT_METHODS),
  'payments.status': exact(COD_PAYMENT_STATUSES, GATEWAY_PAYMENT_STATUSES),
  'payouts.currency': exact(CURRENCIES),
  'payouts.status': exact(PAYOUT_STATUSES),
  'platform_staff.role': exact(PLATFORM_STAFF_ROLES),
  'product_listings.currency': exact(CURRENCIES),
  'product_media.media_kind': within(MEDIA_KINDS),
  'product_review_decisions.decision': exact(PRODUCT_REVIEW_DECISIONS),
  'product_review_decisions.reason_code': exact(PRODUCT_REVIEW_REASONS),
  'product_variants.currency': exact(CURRENCIES),
  'product_variants.status': exact(VARIANT_STATUSES),
  'products.status': exact(PRODUCT_STATUSES),
  'provider_events.kind': exact(PROVIDER_EVENT_KINDS),
  'provider_events.processing_status': exact(PROVIDER_EVENT_PROCESSING_STATUSES),
  'provider_events.provider': exact(PAYMENT_PROVIDERS),
  'refund_items.currency': exact(CURRENCIES),
  'refunds.currency': exact(CURRENCIES),
  'refunds.method': exact(REFUND_METHODS),
  'refunds.reason_code': exact(REFUND_REASONS),
  'refunds.status': exact(REFUND_STATUSES),
  'return_requests.reason_code': exact(RETURN_REASONS),
  'return_requests.status': exact(RETURN_STATUSES),
  'shipment_events.actor_type': exact(SHIPMENT_EVENT_ACTOR_TYPES),
  'shipment_events.event': exact(SHIPMENT_EVENTS),
  'shipment_events.reason_code': exact(DELIVERY_FAILURE_REASONS),
  'shipment_events.status': within(SHIPMENT_STATUSES),
  'shipments.currency': exact(CURRENCIES),
  'shipments.status': exact(SHIPMENT_STATUSES),
  'shop_addresses.purpose': exact(SHOP_ADDRESS_PURPOSES),
  'shop_invitations.role': exact(SHOP_MEMBER_ROLES),
  'shop_memberships.role': exact(SHOP_MEMBER_ROLES),
  'shop_memberships.status': exact(SHOP_MEMBERSHIP_STATUSES),
  'shop_orders.cancel_reason': exact(SHOP_ORDER_CANCEL_REASONS),
  'shop_orders.currency': exact(CURRENCIES),
  'shop_orders.rejection_reason': exact(SHOP_ORDER_REJECTION_REASONS),
  'shop_orders.status': exact(SHOP_ORDER_STATUSES),
  'shop_payout_accounts.method': exact(PAYOUT_ACCOUNT_METHODS),
  'shop_review_decisions.decision': exact(SHOP_REVIEW_DECISIONS),
  'shop_review_decisions.suspension_mode': exact(SUSPENSION_MODES),
  'shop_shipping_rates.currency': exact(CURRENCIES),
  'shops.business_type': exact(BUSINESS_TYPES),
  'shops.product_review_mode': exact(PRODUCT_REVIEW_MODES),
  'shops.status': exact(SHOP_STATUSES),
  'shops.suspension_mode': exact(SUSPENSION_MODES),
  'slug_redirects.entity_type': exact(SLUG_REDIRECT_ENTITY_TYPES),
  'support_case_messages.author_type': exact(SUPPORT_MESSAGE_AUTHOR_TYPES),
  'support_case_messages.visibility': exact(SUPPORT_MESSAGE_VISIBILITIES),
  'support_cases.category': exact(SUPPORT_CASE_CATEGORIES),
  'support_cases.status': exact(SUPPORT_CASE_STATUSES),
  'user_tokens.purpose': exact(USER_TOKEN_PURPOSES),
  'users.status': exact(USER_STATUSES),
  'vendor_remittances.currency': exact(CURRENCIES),
  'vendor_remittances.method': exact(REMITTANCE_METHODS),
}

// The child → parent pairs of docs/04 §2.6, the only cascading foreign keys.
const CASCADES = [
  'cart_items → carts',
  'product_listings → products',
  'variant_option_values → product_variants',
]

type ValueList = { key: string; constraint: string; values: string[] }

// `col = ANY (ARRAY['a'::text, 'b'::text])` or `col <> ALL (...)`, with an
// optional cast on the column, as pg_get_constraintdef prints it.
const LIST =
  /\(*([a-z_][a-z0-9_]*)\)?(?:::[a-z ]+)? (?:= ANY|<> ALL) \(ARRAY\[((?:'(?:[^']|'')*'::[a-z ]+(?:, )?)+)\]\)/g
const LIST_OPERATOR = /(?:= ANY|<> ALL) \(ARRAY\[/g
const VALUE = /'((?:[^']|'')*)'::[a-z ]+/g
// A whole CHECK that is one equality: what `col IN ('value')` becomes.
const SINGLE = /^CHECK \(\(([a-z_][a-z0-9_]*) = '((?:[^']|'')*)'::(?:text|bpchar)\)\)$/

async function valueLists(): Promise<ValueList[]> {
  const { rows } = await db.rawQuery(`
    SELECT rel.relname AS table, con.conname AS constraint,
           regexp_replace(pg_get_constraintdef(con.oid), '\\s+', ' ', 'g') AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE con.contype = 'c' AND nsp.nspname = 'public'
     ORDER BY 1, 2
  `)
  const lists: ValueList[] = []
  for (const row of rows as { table: string; constraint: string; definition: string }[]) {
    const terms = [...row.definition.matchAll(LIST)]
    // Every list operator must yield a parsed list of text literals: a list
    // the parser cannot read (another type, a new print form) fails loudly.
    const operators = row.definition.match(LIST_OPERATOR)?.length ?? 0
    if (terms.length !== operators) {
      throw new Error(
        `${row.constraint}: parsed ${terms.length} of ${operators} value lists in ${row.definition}`
      )
    }
    for (const term of terms) {
      lists.push({
        key: `${row.table}.${term[1]}`,
        constraint: row.constraint,
        values: [...term[2].matchAll(VALUE)].map((value) => value[1].replaceAll("''", "'")),
      })
    }
    const single = SINGLE.exec(row.definition)
    if (single) {
      lists.push({
        key: `${row.table}.${single[1]}`,
        constraint: row.constraint,
        values: [single[2].replaceAll("''", "'")],
      })
    }
  }
  return lists
}

test.group('T-ARCH-011 CHECK value lists and TypeScript vocabularies', () => {
  test('T-ARCH-011 every CHECK value list belongs to a mapped vocabulary', async ({ assert }) => {
    const lists = await valueLists()
    assert.isAbove(lists.length, 0, 'the catalogue query finds the value lists')
    for (const list of lists) {
      const vocabulary = VOCABULARIES[list.key]
      assert.isDefined(
        vocabulary,
        `${list.constraint} lists ${list.key} (${list.values.join(', ')}): map it to the TypeScript vocabulary of the owning module's domain/`
      )
      const allowed = new Set(vocabulary!.arrays.flat())
      for (const value of list.values) {
        assert.isTrue(
          allowed.has(value),
          `${list.constraint}: ${list.key} value '${value}' is in no mapped vocabulary`
        )
      }
    }
  })

  test('T-ARCH-011 every vocabulary equals a CHECK list, values and order', async ({ assert }) => {
    const lists = await valueLists()
    for (const [key, vocabulary] of Object.entries(VOCABULARIES)) {
      const ofColumn = lists.filter((list) => list.key === key)
      assert.isNotEmpty(ofColumn, `${key} is mapped but no CHECK lists its values`)
      if (vocabulary.kind === 'within') continue
      for (const array of vocabulary.arrays) {
        const equal = ofColumn.some(
          (list) =>
            list.values.length === array.length &&
            list.values.every((value, index) => value === array[index])
        )
        assert.isTrue(
          equal,
          `${key}: no CHECK lists exactly [${array.join(', ')}]; found ${ofColumn
            .map((list) => `${list.constraint} [${list.values.join(', ')}]`)
            .join('; ')}`
        )
      }
    }
  })
})

test.group('T-ARCH-011 cascading foreign keys', () => {
  test('T-ARCH-011 the ON DELETE CASCADE foreign keys are exactly those of docs/04 §2.6', async ({
    assert,
  }) => {
    const { rows } = await db.rawQuery(`
      SELECT child.relname || ' → ' || parent.relname AS pair
        FROM pg_constraint con
        JOIN pg_class child ON child.oid = con.conrelid
        JOIN pg_class parent ON parent.oid = con.confrelid
        JOIN pg_namespace nsp ON nsp.oid = child.relnamespace
       WHERE con.contype = 'f' AND con.confdeltype = 'c' AND nsp.nspname = 'public'
       ORDER BY 1
    `)
    assert.deepEqual(
      (rows as { pair: string }[]).map((row) => row.pair),
      CASCADES
    )
  })
})
