import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * M6, OD-58 (re-decided 2026-11-22): `platform_settings` gains the key
 * `platform_account_cod_enabled` (docs/04a §15.1), a boolean that keeps live
 * COD off platform-owned courier accounts until OD-58's conditions are met.
 * Adding a value to a CHECK list (docs/09 §8.5): the new constraint is added
 * NOT VALID and swapped in here; the next file validates it alone. The seeder
 * inserts the key with `false`.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(String.raw`
      ALTER TABLE platform_settings
        ADD CONSTRAINT platform_settings_value_check_next CHECK (CASE key
          WHEN 'checkout_enabled'                 THEN jsonb_typeof(value) = 'boolean'
          WHEN 'single_operator_mode'             THEN jsonb_typeof(value) = 'boolean'
          WHEN 'maintenance_banner'               THEN jsonb_typeof(value) = 'string'
                                                       AND char_length(value #>> '{}') <= 280
          WHEN 'platform_legal_disclosures'       THEN jsonb_typeof(value) = 'object'
          WHEN 'default_commission_rate_bp'       THEN jsonb_int_between(value, 0, 5000)
          WHEN 'cod_max_order_value_minor'        THEN jsonb_int_between(value, 100000, 2500000)
          WHEN 'cod_max_open_orders_per_customer' THEN jsonb_int_between(value, 1, 5)
          WHEN 'cod_max_refusals'                 THEN jsonb_int_between(value, 1, 10)
          WHEN 'cod_refusal_window_days'          THEN jsonb_int_between(value, 30, 365)
          WHEN 'vendor_acceptance_sla_hours'      THEN jsonb_int_between(value, 12, 120)
          WHEN 'return_window_days'               THEN jsonb_int_between(value, 7, 30)
          WHEN 'ledger_hold_days'                 THEN jsonb_int_between(value, 7, 60)
          WHEN 'reservation_ttl_minutes'          THEN jsonb_int_between(value, 10, 60)
          WHEN 'max_shops_per_owner'              THEN jsonb_int_between(value, 1, 10)
          WHEN 'platform_account_cod_enabled'     THEN jsonb_typeof(value) = 'boolean'
          ELSE false END) NOT VALID
    `)
    this.schema.raw(
      String.raw`ALTER TABLE platform_settings DROP CONSTRAINT platform_settings_value_check`
    )
    this.schema.raw(String.raw`
      ALTER TABLE platform_settings
        RENAME CONSTRAINT platform_settings_value_check_next TO platform_settings_value_check
    `)
  }

  async down() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)
    this.schema.raw(
      String.raw`DELETE FROM platform_settings WHERE key = 'platform_account_cod_enabled'`
    )
    this.schema.raw(String.raw`
      ALTER TABLE platform_settings
        DROP CONSTRAINT platform_settings_value_check,
        ADD CONSTRAINT platform_settings_value_check CHECK (CASE key
          WHEN 'checkout_enabled'                 THEN jsonb_typeof(value) = 'boolean'
          WHEN 'single_operator_mode'             THEN jsonb_typeof(value) = 'boolean'
          WHEN 'maintenance_banner'               THEN jsonb_typeof(value) = 'string'
                                                       AND char_length(value #>> '{}') <= 280
          WHEN 'platform_legal_disclosures'       THEN jsonb_typeof(value) = 'object'
          WHEN 'default_commission_rate_bp'       THEN jsonb_int_between(value, 0, 5000)
          WHEN 'cod_max_order_value_minor'        THEN jsonb_int_between(value, 100000, 2500000)
          WHEN 'cod_max_open_orders_per_customer' THEN jsonb_int_between(value, 1, 5)
          WHEN 'cod_max_refusals'                 THEN jsonb_int_between(value, 1, 10)
          WHEN 'cod_refusal_window_days'          THEN jsonb_int_between(value, 30, 365)
          WHEN 'vendor_acceptance_sla_hours'      THEN jsonb_int_between(value, 12, 120)
          WHEN 'return_window_days'               THEN jsonb_int_between(value, 7, 30)
          WHEN 'ledger_hold_days'                 THEN jsonb_int_between(value, 7, 60)
          WHEN 'reservation_ttl_minutes'          THEN jsonb_int_between(value, 10, 60)
          WHEN 'max_shops_per_owner'              THEN jsonb_int_between(value, 1, 10)
          ELSE false END)
    `)
  }
}
