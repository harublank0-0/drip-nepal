import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

/*
 * T-ARCH-022 (docs/10 §6.2, docs/04 §20.2.2): every regular-expression
 * CHECK accepts its documented valid example.
 *
 * Two traps sit between the SQL in docs/04a and what PostgreSQL stores: Knex
 * turns an unescaped `?` into a `$n` placeholder, and a JavaScript literal
 * drops the backslash of `\.`. Either one corrupts the stored pattern so it
 * rejects every real value. The test reads the patterns back from
 * `pg_constraint`, as PostgreSQL stored them, and matches each documented
 * example against them. It is catalogue-driven: a new regex CHECK without an
 * example here fails the test, so every pattern gets one.
 *
 * A column whose CHECK ORs two patterns (`inventory_movements.reference_id`)
 * has examples for each alternative, so the rule is per column: every
 * pattern accepts at least one of the column's examples, and every example
 * is accepted by at least one of its patterns. For a column with one pattern
 * that means every example matches it.
 */

// A ciphertext in the docs/04 §2.9 format: version, key id, 16-character IV,
// ciphertext, 22-character tag.
const CIPHERTEXT = 'v1.k2026.AAAAAAAAAAAAAAAA.c2VhbGVkLXZhbHVl.BBBBBBBBBBBBBBBBBBBBBB'

// One documented valid example per `<table>.<column>` that a regex CHECK tests.
const EXAMPLES: Record<string, string[]> = {
  // docs/04a §9 (Kathmandu: province 3, district 306, metropolitan city 30608)
  'provinces.code': ['3'],
  'districts.code': ['306'],
  'local_levels.code': ['30608'],
  'delivery_zones.code': ['ktm_valley', 'outside_valley'],
  'logistics_providers.code': ['ncm'],
  // docs/04a §5
  'users.phone_last4': ['4567'],
  'users.phone_enc': [CIPHERTEXT],
  'users.mfa_totp_secret_enc': [CIPHERTEXT],
  'user_addresses.recipient_phone_last4': ['4567'],
  'user_addresses.recipient_name_enc': [CIPHERTEXT],
  'user_addresses.recipient_phone_enc': [CIPHERTEXT],
  'user_addresses.area_tole_enc': [CIPHERTEXT],
  'user_addresses.street_landmark_enc': [CIPHERTEXT],
  // docs/04a §6 (slugs per docs/04 §2.8; a mobile and a Kathmandu landline)
  'shops.slug': ['thulo-pasal', 'abc'],
  'shops.contact_phone_e164': ['+9779812345678', '+97714412345'],
  'shops.pan_vat_number': ['123456789'],
  'shops.grievance_contact_phone_enc': [CIPHERTEXT],
  'shop_agreements.agreement_version': ['2026-11-01'],
  'shop_addresses.contact_phone_enc': [CIPHERTEXT],
  'shop_addresses.area_tole_enc': [CIPHERTEXT],
  'shop_addresses.street_landmark_enc': [CIPHERTEXT],
  'shop_payout_accounts.account_number_enc': [CIPHERTEXT],
  'shop_payout_accounts.account_number_last4': ['4567'],
  'shop_categories.code': ['mens-fashion', 'footwear'],
  'slug_redirects.old_slug': ['thulo-pasal'],
  // docs/04a §7 (slugs per docs/04 §2.8 and the tree of docs/04 §21.1;
  // attribute and colour values per docs/04 §21.2; the public id, SKU and
  // option signatures per docs/04 §2.1, §3.5 and docs/04a §7.9)
  'categories.slug': ['kurta-suruwal', 't-shirts'],
  'categories.path': ['/clothing/', '/clothing/tops/t-shirts/'],
  'attributes.code': ['apparel_size', 'shoe_size_eu', 'color'],
  'attribute_values.code': ['m', '42', '42-5', 'black', 'off_white'],
  'attribute_values.swatch_hex': ['#111111', '#f5f1e6'],
  'brands.slug': ['nike', 'thulo-brand'],
  'products.public_id': ['7K3M9QXA'],
  'products.slug': ['kurta-suruwal', 'product'],
  'products.country_of_origin': ['NP', 'IN'],
  'products.description': ['Hand-stitched cotton kurta.', 'सुती कुर्ता'],
  'products.manufacturer_name': ['Thulo Pasal Garments'],
  'products.warranty_text': ['No warranty'],
  'products.care_and_precautions': ['Hand wash cold; dry in shade.'],
  'product_variants.sku': ['DN-7K3M9QXA', 'KS-001/M.blk_2'],
  'product_variants.option_signature': [
    '',
    'color:black',
    'apparel_size:m|color:black',
    'shoe_size_eu:42-5',
  ],
  // docs/04a §9.9
  'logistics_accounts.credentials_enc': [CIPHERTEXT],
  // docs/04a §11 (human numbers per docs/04 §2.1; a shop order's position
  // and a shipment's count run from 1 to 99)
  'orders.number': ['DN-4K7Q2M9'],
  'orders.shipping_address.recipient_name_enc': [CIPHERTEXT],
  'orders.shipping_address.recipient_phone_enc': [CIPHERTEXT],
  'orders.shipping_address.area_tole_enc': [CIPHERTEXT],
  'orders.shipping_address.street_landmark_enc': [CIPHERTEXT],
  'orders.request_id': ['01a1b452-a64a-7a4f-93a2-be6932153cde', 'req-12345678'],
  'shop_orders.number': ['DN-4K7Q2M9-1', 'DN-4K7Q2M9-12'],
  'order_items.image_url_snapshot': ['https://media.example.com/p/7K3M9QXA/800.webp'],
  'order_events.type': ['order.placed', 'shop_order.items_rejected'],
  'shipment_booking_attempts.error_code': ['invalid_branch', 'auth_failed'],
  'shipment_booking_attempts.error_fields': ['phone', 'phone,fbranch'],
  'shipments.merchant_reference': ['DN-4K7Q2M9-1-S1', 'DN-4K7Q2M9-12-S10'],
  'shipments.tracking_url': ['https://track.example.com/TC1001NP'],
  'return_requests.number': ['RT-4K7Q2M9'],
  // docs/04a §8.3 (reasons per docs/05 §5.2). `reference_id` has two OR-ed
  // patterns: a UUID, or an `audit_logs.id` for a correction.
  'inventory_movements.reference_id': ['01a1b452-a64a-7a4f-93a2-be6932153cde', '4567'],
  'inventory_movements.reason_code': ['checkout', 'received_stock', 'stocktake', 'drift_repair'],
  // docs/04a §12.4
  'refunds.recipient_details_enc': [CIPHERTEXT],
  // docs/04a §13.1 (the dedupe key of docs/05 §7.2, with and without a suffix)
  'ledger_entries.dedupe_key': [
    'delivery:01a1b452-a64a-7a4f-93a2-be6932153cde:sale',
    'remittance:01a1b452-a64a-7a4f-93a2-be6932153cde',
  ],
  // docs/04a §14.1 (the case number of docs/04 §2.1) and §14.3 (its two template examples)
  'support_cases.number': ['SC-4K7Q2M9'],
  'notification_deliveries.template': ['order.placed.customer', 'shop_order.placed.shop'],
  // docs/04a §15
  'idempotency_keys.actor_scope': [
    '01a1b452-a64a-7a4f-93a2-be6932153cde',
    'provider:esewa',
    'system',
  ],
  'idempotency_keys.operation': ['placeOrder'],
  'idempotency_keys.key': ['f3b0c442-98fc-1c14-9afb'],
  'audit_logs.action': ['shop.suspend', 'platform_setting.update'],
}

type Operator = '~' | '~*' | '!~' | '!~*'
type RegexCheck = {
  table: string
  constraint: string
  column: string
  operator: Operator
  pattern: string
}

// The example must satisfy the CHECK whatever its operator, so a negated
// operator (`!~`) expects a non-match. Fixed statements, no interpolation.
const MATCHES: Record<Operator, string> = {
  '~': 'SELECT ?::text ~ ?::text AS ok',
  '~*': 'SELECT ?::text ~* ?::text AS ok',
  '!~': 'SELECT ?::text !~ ?::text AS ok',
  '!~*': 'SELECT ?::text !~* ?::text AS ok',
}

// `col ~ 'pattern'::text` (or `~*`, `!~`, `!~*`), with an optional cast on the column, as
// pg_get_constraintdef prints it. Quotes inside a literal are doubled. A jsonb member,
// `(col ->> 'member'::text) ~ 'pattern'::text`, is keyed `<table>.<column>.<member>`.
const REGEX_TERM =
  /\(*([a-z_][a-z0-9_]*)(?: ->> '([a-z_][a-z0-9_]*)'::text)?\)?(?:::[a-z ]+)?\s+(!?~\*?)\s+'((?:[^']|'')*)'::text/g

async function regexChecks(): Promise<RegexCheck[]> {
  const result = await db.rawQuery(`
    SELECT rel.relname AS table, con.conname AS constraint, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE con.contype = 'c' AND nsp.nspname = 'public' AND pg_get_constraintdef(con.oid) LIKE '%~%'
     ORDER BY 1, 2
  `)
  const checks: RegexCheck[] = []
  for (const row of result.rows as { table: string; constraint: string; definition: string }[]) {
    const terms = [...row.definition.matchAll(REGEX_TERM)]
    // Every regex operator outside a string literal must yield a parsed term:
    // a definition the parser cannot read, in whole or in part, fails loudly.
    const operators =
      row.definition.replaceAll(/'(?:[^']|'')*'/g, "''").match(/\s!?~\*?\s/g)?.length ?? 0
    if (terms.length === 0 || terms.length !== operators) {
      throw new Error(
        `${row.constraint}: parsed ${terms.length} of ${operators} regex terms in ${row.definition}`
      )
    }
    for (const match of terms) {
      checks.push({
        table: row.table,
        constraint: row.constraint,
        column: match[2] ? `${match[1]}.${match[2]}` : match[1],
        operator: match[3] as Operator,
        pattern: match[4].replaceAll("''", "'"),
      })
    }
  }
  return checks
}

test.group('T-ARCH-022 regular-expression CHECKs', () => {
  test('T-ARCH-022 every regex CHECK accepts its documented example', async ({ assert }) => {
    const checks = await regexChecks()
    assert.isAbove(checks.length, 0, 'the catalogue query finds the regex CHECKs')

    // Which examples each pattern accepts, per column.
    const accepted = new Map<string, Set<string>>()
    for (const check of checks) {
      const key = `${check.table}.${check.column}`
      const examples = EXAMPLES[key]
      assert.isDefined(examples, `${check.constraint}: add a documented example for ${key}`)
      const ok: string[] = []
      for (const example of examples!) {
        const result = await db.rawQuery(MATCHES[check.operator], [example, check.pattern])
        if (result.rows[0].ok) ok.push(example)
      }
      assert.isNotEmpty(
        ok,
        `${check.constraint} rejects every example of ${key} (stored pattern ${check.operator} ${check.pattern})`
      )
      accepted.set(key, new Set([...(accepted.get(key) ?? []), ...ok]))
    }
    for (const [key, ok] of accepted) {
      for (const example of EXAMPLES[key]) {
        assert.isTrue(ok.has(example), `no regex CHECK of ${key} accepts its example ${example}`)
      }
    }
  })

  test('T-ARCH-022 every example belongs to a regex CHECK', async ({ assert }) => {
    const checks = await regexChecks()
    const covered = new Set(checks.map((check) => `${check.table}.${check.column}`))
    for (const key of Object.keys(EXAMPLES)) {
      assert.isTrue(covered.has(key), `${key} has an example but no regex CHECK`)
    }
  })
})
