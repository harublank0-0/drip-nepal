import { type SchemaRules } from '@adonisjs/lucid/types/schema_generator'

/*
 * Type rules for `node ace schema:generate`, loaded through
 * `schemaGeneration.rulesPaths` in config/database.ts (docs/04 §18.4, §20.3).
 */
const column = [{ name: '@column' }]
// Secret columns never serialize (Lucid's built-in rule covers only a column named `password`)
const secret = [{ name: '@column', args: { serializeAs: null } }]
// A column whose name ends in digits needs its name spelled out: Lucid's
// snake_case naming strategy maps `phoneLast4` back to `phone_last_4`
// (docs/04 §2.15), so reads and writes of the column would miss it.
const named = (columnName: string, tsType: string) => ({
  tsType,
  decorators: [{ name: '@column', args: { columnName } }],
})

export default {
  types: {
    // start/database_types.ts parses int8 into a safe number (docs/04 §18.4)
    bigint: { tsType: 'number', decorators: column },
    // read through the owning module's typed parser (docs/04 §2.11)
    jsonb: { tsType: 'unknown', decorators: column },
  },
  columns: {
    // citext has no built-in mapping (docs/04 §20.3)
    email: { tsType: 'string', decorators: column },
    slug: { tsType: 'string', decorators: column },
    old_slug: { tsType: 'string', decorators: column },
    shop_slug: { tsType: 'string', decorators: column },
    brand_slug: { tsType: 'string', decorators: column },
    // Secret columns (docs/04 §19.1)
    password_hash: { tsType: 'string', decorators: secret },
    security_stamp: { tsType: 'string', decorators: secret },
    mfa_totp_secret_enc: { tsType: 'string', decorators: secret },
    token_hash: { tsType: 'Buffer', decorators: secret },
    guest_token_hash: { tsType: 'Buffer', decorators: secret },
    // courier credentials: Secret, never serialised (docs/04 §19.3, docs/04a §9.9)
    credentials_enc: { tsType: 'string', decorators: secret },
  },
  tables: {
    media_assets: { columns: { sha256: named('sha256', 'Buffer') } },
    provider_events: { columns: { raw_body_sha256: named('raw_body_sha256', 'Buffer') } },
    shop_payout_accounts: {
      columns: { account_number_last4: named('account_number_last4', 'string') },
    },
    shops: { columns: { contact_phone_e164: named('contact_phone_e164', 'string') } },
    user_addresses: {
      columns: { recipient_phone_last4: named('recipient_phone_last4', 'string') },
    },
    users: { columns: { phone_last4: named('phone_last4', 'string') } },
    // uuid[] facet columns of the read model
    product_listings: { types: { ARRAY: { tsType: 'string[]', decorators: column } } },
    // the primary-key rule would type this bigint key as `bigint | number` (docs/04 §20.3)
    audit_logs: {
      columns: {
        id: { tsType: 'number', decorators: [{ name: '@column', args: { isPrimary: true } }] },
      },
    },
  },
} satisfies SchemaRules
