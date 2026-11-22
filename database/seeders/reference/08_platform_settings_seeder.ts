import { BaseSeeder } from '@adonisjs/lucid/seeders'

/*
 * Every key of docs/04a §15.1 with its seeded default. A missing key is
 * inserted; an existing one is never touched, so a value an operator
 * changed survives every release (`ON CONFLICT (key) DO NOTHING`, docs/09
 * §8.8). `platform_settings_value_check` rejects an unknown key or an
 * out-of-range value, so a typo here fails the seed.
 *
 * Placeholders that open decisions own: `default_commission_rate_bp`
 * [Open OD-04], the COD limits [Assumption A-08; Open OD-18],
 * `single_operator_mode` [Assumption A-20; Open OD-14], and
 * `platform_account_cod_enabled` (OD-58). The legal
 * disclosures start empty and are filled by the platform admin before
 * launch (docs/09 §9.3 step 8).
 */
export const PLATFORM_SETTING_DEFAULTS: Record<string, unknown> = {
  checkout_enabled: true,
  maintenance_banner: '',
  default_commission_rate_bp: 1000,
  cod_max_order_value_minor: 2_000_000,
  cod_max_open_orders_per_customer: 3,
  cod_max_refusals: 2,
  cod_refusal_window_days: 90,
  vendor_acceptance_sla_hours: 48,
  return_window_days: 7,
  ledger_hold_days: 7,
  reservation_ttl_minutes: 30,
  max_shops_per_owner: 3,
  single_operator_mode: false,
  // OD-58 (re-decided 2026-11-22): live COD on platform-owned courier accounts stays off
  // until counsel, the accountant and NCM allow it; only a platform admin turns it on.
  platform_account_cod_enabled: false,
  platform_legal_disclosures: {
    platform_name: '',
    business_name: '',
    business_address: '',
    registering_authority: '',
    registration_number: '',
    registered_office_address: '',
    head_office_address: '',
    branches: [],
    special_licences: [],
    entity_type: '',
    pan_vat_number: '',
    contact_email: '',
    contact_phone: '',
    customer_service: { email: '', phone: '', hours: '' },
    grievance_officer: { name: '', email: '', phone: '', postal_address: '' },
    docscp_listing_number: '',
  },
}

export default class PlatformSettingsSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      for (const [key, value] of Object.entries(PLATFORM_SETTING_DEFAULTS)) {
        await trx.rawQuery(
          'INSERT INTO platform_settings (key, value) VALUES (?, ?::jsonb) ON CONFLICT (key) DO NOTHING',
          [key, JSON.stringify(value)]
        )
      }
    })
  }
}
