import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 5 of 14 (docs/04 §20.2.2): shops. Tables and constraints are
 * those of docs/04a §6.1 to §6.10, then the logistics-owned tables that need
 * `shops`: `shop_delivery_coverage` and `shop_shipping_rates` (§9.6, §9.7)
 * and, after `shop_addresses`, `logistics_accounts`,
 * `logistics_account_shops` and `shop_logistics_settings` (§9.9 to §9.11,
 * OD-56), in that order.
 *
 * `shops` is created without its logo and banner keys: `media_assets`
 * references `shops`, so file 6 adds them with ALTER TABLE (cycle 1). The
 * append-only triggers and REVOKEs of `shop_agreements` and
 * `shop_review_decisions` are in file 14 (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §6.1
    this.schema.raw(String.raw`
      CREATE TABLE shops (
        id uuid NOT NULL DEFAULT uuidv7(),
        owner_user_id uuid NOT NULL,
        name text NOT NULL,
        slug citext NOT NULL,
        status text NOT NULL DEFAULT 'pending_review',
        suspension_mode text,
        product_review_mode text NOT NULL DEFAULT 'pre',
        commission_rate_bp int,
        contact_email text NOT NULL,
        contact_phone_e164 text NOT NULL,
        description text,
        logo_media_id uuid,
        banner_media_id uuid,
        return_policy_text text NOT NULL,
        business_type text NOT NULL,
        business_registration_number text,
        business_registration_authority text,
        pan_vat_number text,
        is_vat_registered boolean NOT NULL DEFAULT false,
        grievance_contact_name text,
        grievance_contact_phone_enc text,
        personal_data_redacted_at timestamptz,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        approved_at timestamptz,
        approved_by uuid,
        closed_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shops_pkey PRIMARY KEY (id),
        CONSTRAINT shops_owner_user_fkey FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shops_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shops_slug_key UNIQUE (slug),
        CONSTRAINT shops_slug_check CHECK (slug::text ~ '^[a-z0-9](\?:[a-z0-9-]{1,38}[a-z0-9])$'),
        CONSTRAINT shops_name_check CHECK (char_length(name) BETWEEN 2 AND 60),
        CONSTRAINT shops_description_check CHECK (description IS NULL OR char_length(description) <= 2000),
        CONSTRAINT shops_return_policy_check CHECK (char_length(return_policy_text) BETWEEN 1 AND 5000),
        CONSTRAINT shops_grievance_name_check
          CHECK (grievance_contact_name IS NULL OR char_length(grievance_contact_name) BETWEEN 2 AND 100),
        CONSTRAINT shops_grievance_contact_check CHECK ((personal_data_redacted_at IS NULL AND grievance_contact_name IS NOT NULL AND grievance_contact_phone_enc IS NOT NULL) OR (personal_data_redacted_at IS NOT NULL AND status IN ('closed','rejected') AND grievance_contact_name IS NULL AND grievance_contact_phone_enc IS NULL)),
        CONSTRAINT shops_status_check CHECK (status IN ('pending_review','active','rejected','suspended','closed')),
        CONSTRAINT shops_suspension_mode_check CHECK ((status = 'suspended' AND suspension_mode IS NOT NULL AND suspension_mode IN ('fulfill_existing','frozen')) OR (status <> 'suspended' AND suspension_mode IS NULL)),
        CONSTRAINT shops_product_review_mode_check CHECK (product_review_mode IN ('pre','post')),
        CONSTRAINT shops_commission_rate_bp_check
          CHECK (commission_rate_bp IS NULL OR commission_rate_bp BETWEEN 0 AND 10000),
        CONSTRAINT shops_contact_email_check
          CHECK (char_length(contact_email) BETWEEN 3 AND 254 AND contact_email = lower(contact_email)),
        CONSTRAINT shops_contact_phone_check CHECK (contact_phone_e164 ~ '^\+977(9[678][0-9]{8}|[0-9]{8})$'),
        CONSTRAINT shops_business_type_check CHECK (business_type IN ('individual','registered_business')),
        CONSTRAINT shops_registered_business_check CHECK (business_type <> 'registered_business' OR (business_registration_number IS NOT NULL AND business_registration_authority IS NOT NULL AND pan_vat_number IS NOT NULL)),
        CONSTRAINT shops_pan_vat_number_check CHECK (pan_vat_number IS NULL OR pan_vat_number ~ '^[0-9]{1,20}$'),
        CONSTRAINT shops_vat_requires_pan_check CHECK (NOT is_vat_registered OR pan_vat_number IS NOT NULL),
        CONSTRAINT shops_approval_check
          CHECK (status IN ('pending_review','rejected') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)),
        CONSTRAINT shops_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
        CONSTRAINT shops_grievance_contact_phone_enc_check CHECK (grievance_contact_phone_enc IS NULL OR grievance_contact_phone_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
      )
    `)
    this.schema.raw(String.raw`CREATE INDEX shops_owner_idx ON shops (owner_user_id, status)`)

    // docs/04a §6.2
    this.schema.raw(String.raw`
      CREATE TABLE shop_memberships (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        user_id uuid NOT NULL,
        role text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        invited_by uuid,
        removed_at timestamptz,
        removed_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_memberships_pkey PRIMARY KEY (id),
        CONSTRAINT shop_memberships_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_memberships_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_memberships_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_memberships_removed_by_fkey FOREIGN KEY (removed_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_memberships_shop_user_key UNIQUE (shop_id, user_id),
        CONSTRAINT shop_memberships_role_check
          CHECK (role IN ('manager','catalog_editor','order_fulfiller','viewer')),
        CONSTRAINT shop_memberships_status_check CHECK (status IN ('active','removed')),
        CONSTRAINT shop_memberships_removal_check CHECK ((status = 'removed') = (removed_at IS NOT NULL))
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX shop_memberships_user_active_idx ON shop_memberships (user_id) WHERE status = 'active'
    `)

    // docs/04a §6.3. docs: 04a names none of these foreign keys; the names
    // follow docs/04 §2.14 and shop_agreements_accepted_by_fkey (§6.4).
    this.schema.raw(String.raw`
      CREATE TABLE shop_invitations (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        email citext NOT NULL,
        role text NOT NULL,
        token_hash bytea NOT NULL,
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        accepted_by_user_id uuid,
        revoked_at timestamptz,
        invited_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_invitations_pkey PRIMARY KEY (id),
        CONSTRAINT shop_invitations_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_invitations_accepted_by_fkey FOREIGN KEY (accepted_by_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_invitations_token_hash_key UNIQUE (token_hash),
        CONSTRAINT shop_invitations_token_hash_check CHECK (octet_length(token_hash) = 32),
        CONSTRAINT shop_invitations_role_check
          CHECK (role IN ('manager','catalog_editor','order_fulfiller','viewer')),
        CONSTRAINT shop_invitations_email_check
          CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(email::text)),
        CONSTRAINT shop_invitations_outcome_check CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL) AND (accepted_at IS NULL) = (accepted_by_user_id IS NULL)),
        CONSTRAINT shop_invitations_expiry_check CHECK (expires_at > created_at)
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX shop_invitations_pending_key ON shop_invitations (shop_id, email)
        WHERE accepted_at IS NULL AND revoked_at IS NULL
    `)

    // docs/04a §6.4
    this.schema.raw(String.raw`
      CREATE TABLE shop_agreements (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        agreement_version text NOT NULL,
        accepted_by_user_id uuid NOT NULL,
        accepted_at timestamptz NOT NULL DEFAULT now(),
        ip_hash bytea NOT NULL,
        request_id text NOT NULL,
        CONSTRAINT shop_agreements_pkey PRIMARY KEY (id),
        CONSTRAINT shop_agreements_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_agreements_accepted_by_fkey FOREIGN KEY (accepted_by_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_agreements_shop_version_key UNIQUE (shop_id, agreement_version),
        CONSTRAINT shop_agreements_version_check CHECK (agreement_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
        CONSTRAINT shop_agreements_ip_hash_check CHECK (octet_length(ip_hash) = 32)
      )
    `)

    // docs/04a §6.1 and docs/04 §16.3 (INV-18): a shop is active only with an
    // agreement row. A backstop, off the constraint allowlist (docs/04 §16.5).
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION shops_require_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM shop_agreements a WHERE a.shop_id = NEW.id) THEN
          RAISE EXCEPTION 'shop % cannot be active without an accepted seller agreement', NEW.id
            USING ERRCODE = '23514', CONSTRAINT = 'shops_agreement_required';
        END IF;
        RETURN NEW;
      END $$
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER shops_require_agreement
        BEFORE INSERT OR UPDATE OF status ON shops
        FOR EACH ROW WHEN (NEW.status = 'active')
        EXECUTE FUNCTION shops_require_agreement()
    `)

    // docs/04a §6.5. docs: 04a names neither foreign key; the names follow
    // docs/04 §2.14.
    this.schema.raw(String.raw`
      CREATE TABLE shop_review_decisions (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        decision text NOT NULL,
        reason text,
        suspension_mode text,
        decided_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_review_decisions_pkey PRIMARY KEY (id),
        CONSTRAINT shop_review_decisions_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_review_decisions_decided_by_fkey FOREIGN KEY (decided_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_review_decisions_decision_check
          CHECK (decision IN ('approved','rejected','suspended','reinstated')),
        CONSTRAINT shop_review_decisions_reason_check CHECK (decision NOT IN ('rejected','suspended') OR (reason IS NOT NULL AND char_length(reason) BETWEEN 20 AND 2000)),
        CONSTRAINT shop_review_decisions_suspension_mode_check CHECK ((decision = 'suspended' AND suspension_mode IS NOT NULL AND suspension_mode IN ('fulfill_existing','frozen')) OR (decision <> 'suspended' AND suspension_mode IS NULL))
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX shop_review_decisions_shop_idx ON shop_review_decisions (shop_id, created_at DESC)
    `)

    // docs/04a §6.6. The location keys and postal_code are those of §5.5;
    // postal_code is STORED explicitly (PostgreSQL 18 defaults to VIRTUAL).
    // docs: 04a gives `label` "at most 30 characters" but, unlike §5.5
    // (user_addresses_label_check), lists no CHECK for it, so none is added.
    this.schema.raw(String.raw`
      CREATE TABLE shop_addresses (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        purpose text NOT NULL,
        label text,
        contact_name text NOT NULL,
        contact_phone_enc text NOT NULL,
        province_code text NOT NULL,
        district_code text NOT NULL,
        local_level_code text NOT NULL,
        ward_no smallint NOT NULL,
        area_tole_enc text NOT NULL,
        street_landmark_enc text,
        postal_code text NOT NULL GENERATED ALWAYS AS (local_level_code || lpad(ward_no::text, 2, '0')) STORED,
        is_default boolean NOT NULL DEFAULT false,
        archived_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_addresses_pkey PRIMARY KEY (id),
        CONSTRAINT shop_addresses_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_addresses_id_shop_id_key UNIQUE (id, shop_id),
        CONSTRAINT shop_addresses_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT,
        CONSTRAINT shop_addresses_district_fkey FOREIGN KEY (district_code, province_code)
          REFERENCES districts (code, province_code) ON DELETE RESTRICT,
        CONSTRAINT shop_addresses_local_level_fkey FOREIGN KEY (local_level_code, district_code)
          REFERENCES local_levels (code, district_code) ON DELETE RESTRICT,
        CONSTRAINT shop_addresses_purpose_check CHECK (purpose IN ('pickup','return')),
        CONSTRAINT shop_addresses_ward_no_check CHECK (ward_no BETWEEN 1 AND 40),
        CONSTRAINT shop_addresses_contact_name_check CHECK (char_length(contact_name) BETWEEN 2 AND 100),
        CONSTRAINT shop_addresses_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL)),
        CONSTRAINT shop_addresses_contact_phone_enc_check CHECK (contact_phone_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT shop_addresses_area_tole_enc_check CHECK (area_tole_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT shop_addresses_street_landmark_enc_check CHECK (street_landmark_enc IS NULL OR street_landmark_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX shop_addresses_one_default_key ON shop_addresses (shop_id, purpose)
        WHERE is_default AND archived_at IS NULL;
      CREATE INDEX shop_addresses_shop_idx ON shop_addresses (shop_id, purpose) WHERE archived_at IS NULL
    `)

    // docs/04a §6.7. docs: 04a names none of these foreign keys; the names
    // follow docs/04 §2.14.
    this.schema.raw(String.raw`
      CREATE TABLE shop_payout_accounts (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        method text NOT NULL,
        account_name text NOT NULL,
        bank_name text NOT NULL,
        branch_name text,
        account_number_enc text,
        account_number_last4 char(4) NOT NULL,
        created_by uuid NOT NULL,
        verified_at timestamptz,
        verified_by uuid,
        replaced_at timestamptz,
        retired_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_payout_accounts_pkey PRIMARY KEY (id),
        CONSTRAINT shop_payout_accounts_id_shop_id_key UNIQUE (id, shop_id),
        CONSTRAINT shop_payout_accounts_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_payout_accounts_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_payout_accounts_verified_by_fkey FOREIGN KEY (verified_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT shop_payout_accounts_account_number_enc_check CHECK (account_number_enc IS NULL OR account_number_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT shop_payout_accounts_account_number_check
          CHECK (account_number_enc IS NOT NULL OR replaced_at IS NOT NULL OR retired_at IS NOT NULL),
        CONSTRAINT shop_payout_accounts_method_check CHECK (method IN ('bank_transfer','wallet')),
        CONSTRAINT shop_payout_accounts_last4_check CHECK (account_number_last4 ~ '^[0-9]{4}$'),
        CONSTRAINT shop_payout_accounts_account_name_check CHECK (char_length(account_name) BETWEEN 2 AND 100),
        CONSTRAINT shop_payout_accounts_verification_check CHECK ((verified_at IS NULL) = (verified_by IS NULL) AND (verified_by IS NULL OR verified_by <> created_by))
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX shop_payout_accounts_active_key ON shop_payout_accounts (shop_id)
        WHERE replaced_at IS NULL AND retired_at IS NULL
    `)

    // docs/04a §6.8
    this.schema.raw(String.raw`
      CREATE TABLE shop_categories (
        code text NOT NULL,
        label text NOT NULL,
        description text,
        icon text,
        position smallint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_categories_pkey PRIMARY KEY (code),
        CONSTRAINT shop_categories_code_check CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(code) <= 50),
        CONSTRAINT shop_categories_label_check CHECK (char_length(label) BETWEEN 2 AND 60)
      )
    `)

    // docs/04a §6.9
    this.schema.raw(String.raw`
      CREATE TABLE shop_category_assignments (
        shop_id uuid NOT NULL,
        shop_category_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_category_assignments_pkey PRIMARY KEY (shop_id, shop_category_code),
        CONSTRAINT shop_category_assignments_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_category_assignments_category_fkey FOREIGN KEY (shop_category_code)
          REFERENCES shop_categories (code) ON DELETE RESTRICT
      )
    `)

    // docs/04a §6.10. entity_id has no foreign key: it points at shops or
    // categories.
    this.schema.raw(String.raw`
      CREATE TABLE slug_redirects (
        entity_type text NOT NULL,
        old_slug citext NOT NULL,
        entity_id uuid NOT NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT slug_redirects_pkey PRIMARY KEY (entity_type, old_slug),
        CONSTRAINT slug_redirects_entity_type_check CHECK (entity_type IN ('shop','category')),
        CONSTRAINT slug_redirects_old_slug_check
          CHECK (old_slug::text ~ '^[a-z0-9](\?:[a-z0-9-]{1,38}[a-z0-9])$'),
        CONSTRAINT slug_redirects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
      )
    `)

    // docs/04a §9.6 (logistics)
    this.schema.raw(String.raw`
      CREATE TABLE shop_delivery_coverage (
        shop_id uuid NOT NULL,
        district_code text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_delivery_coverage_pkey PRIMARY KEY (shop_id, district_code),
        CONSTRAINT shop_delivery_coverage_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_delivery_coverage_district_fkey FOREIGN KEY (district_code)
          REFERENCES districts (code) ON DELETE RESTRICT
      )
    `)

    // docs/04a §9.7 (logistics)
    this.schema.raw(String.raw`
      CREATE TABLE shop_shipping_rates (
        shop_id uuid NOT NULL,
        zone_code text NOT NULL,
        fee_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        est_min_days smallint NOT NULL,
        est_max_days smallint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_shipping_rates_pkey PRIMARY KEY (shop_id, zone_code),
        CONSTRAINT shop_shipping_rates_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_shipping_rates_zone_fkey FOREIGN KEY (zone_code)
          REFERENCES delivery_zones (code) ON DELETE RESTRICT,
        CONSTRAINT shop_shipping_rates_fee_check CHECK (fee_minor >= 0),
        CONSTRAINT shop_shipping_rates_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT shop_shipping_rates_estimate_check
          CHECK (est_min_days >= 0 AND est_max_days >= est_min_days AND est_max_days <= 30) -- 30: [Assumption]
      )
    `)

    // docs/04a §9.9 (logistics, OD-56). INV-28: the guard keeps the courier,
    // owner and environment as inserted.
    this.schema.raw(String.raw`
      CREATE TABLE logistics_accounts (
        id uuid NOT NULL DEFAULT uuidv7(),
        provider_code text NOT NULL,
        owner_type text NOT NULL,
        shop_id uuid,
        name text NOT NULL,
        environment text NOT NULL,
        external_account_ref text,
        credentials_enc text,
        status text NOT NULL DEFAULT 'pending',
        verified_at timestamptz,
        disabled_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT logistics_accounts_pkey PRIMARY KEY (id),
        CONSTRAINT logistics_accounts_id_owner_type_key UNIQUE (id, owner_type), -- target for §9.10, §9.11
        CONSTRAINT logistics_accounts_id_shop_id_key UNIQUE (id, shop_id), -- target for §9.10
        CONSTRAINT logistics_accounts_external_ref_key
          UNIQUE (provider_code, environment, external_account_ref), -- NULLs are distinct
        CONSTRAINT logistics_accounts_provider_fkey FOREIGN KEY (provider_code)
          REFERENCES logistics_providers (code) ON DELETE RESTRICT,
        CONSTRAINT logistics_accounts_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT logistics_accounts_owner_check CHECK (owner_type IN ('platform', 'shop')
          AND (owner_type = 'platform') = (shop_id IS NULL)),
        CONSTRAINT logistics_accounts_environment_check CHECK (environment IN ('sandbox', 'production')),
        CONSTRAINT logistics_accounts_status_check
          CHECK (status IN ('pending', 'active', 'invalid', 'suspended', 'disabled')),
        CONSTRAINT logistics_accounts_active_check
          CHECK (status <> 'active' OR (credentials_enc IS NOT NULL AND verified_at IS NOT NULL)),
        CONSTRAINT logistics_accounts_disabled_check CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)
          AND (status <> 'disabled' OR credentials_enc IS NULL)),
        CONSTRAINT logistics_accounts_name_check CHECK (char_length(name) BETWEEN 2 AND 80),
        CONSTRAINT logistics_accounts_external_ref_check
          CHECK (external_account_ref IS NULL OR char_length(external_account_ref) BETWEEN 1 AND 100),
        CONSTRAINT logistics_accounts_credentials_enc_check CHECK (credentials_enc IS NULL
          OR credentials_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX logistics_accounts_shop_idx ON logistics_accounts (shop_id) WHERE shop_id IS NOT NULL
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER logistics_accounts_guard BEFORE UPDATE ON logistics_accounts FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('name', 'credentials_enc', 'status', 'verified_at', 'disabled_at',
          'version', 'updated_at')
    `)

    // docs/04a §9.10 (logistics, OD-56). INV-29: a shop-owned account lists
    // only its owner.
    this.schema.raw(String.raw`
      CREATE TABLE logistics_account_shops (
        account_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        account_owner_type text NOT NULL,
        owner_shop_id uuid,
        is_active boolean NOT NULL DEFAULT true,
        enabled_at timestamptz NOT NULL DEFAULT now(),
        disabled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT logistics_account_shops_pkey PRIMARY KEY (account_id, shop_id), -- target for §9.11, §11.5
        CONSTRAINT logistics_account_shops_account_fkey FOREIGN KEY (account_id, account_owner_type)
          REFERENCES logistics_accounts (id, owner_type) ON DELETE RESTRICT,
        CONSTRAINT logistics_account_shops_owner_fkey FOREIGN KEY (account_id, owner_shop_id)
          REFERENCES logistics_accounts (id, shop_id) ON DELETE RESTRICT, -- MATCH SIMPLE: skipped when owner_shop_id is null
        CONSTRAINT logistics_account_shops_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT logistics_account_shops_owner_check CHECK ((account_owner_type = 'platform') = (owner_shop_id IS NULL)
          AND (owner_shop_id IS NULL OR owner_shop_id = shop_id)),
        CONSTRAINT logistics_account_shops_active_check CHECK (is_active = (disabled_at IS NULL))
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX logistics_account_shops_shop_idx ON logistics_account_shops (shop_id) WHERE is_active
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER logistics_account_shops_guard BEFORE UPDATE ON logistics_account_shops FOR EACH ROW
        EXECUTE FUNCTION allow_only_columns('is_active', 'enabled_at', 'disabled_at', 'updated_at')
    `)

    // docs/04a §9.11 (logistics, OD-56). A shop with no row is `manual` with
    // is_enabled true.
    this.schema.raw(String.raw`
      CREATE TABLE shop_logistics_settings (
        shop_id uuid NOT NULL,
        fulfillment_mode text NOT NULL DEFAULT 'manual',
        default_account_id uuid,
        default_account_owner_type text,
        is_enabled boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shop_logistics_settings_pkey PRIMARY KEY (shop_id),
        CONSTRAINT shop_logistics_settings_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT shop_logistics_settings_account_shop_fkey FOREIGN KEY (default_account_id, shop_id)
          REFERENCES logistics_account_shops (account_id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT shop_logistics_settings_account_owner_fkey FOREIGN KEY (default_account_id, default_account_owner_type)
          REFERENCES logistics_accounts (id, owner_type) ON DELETE RESTRICT,
        CONSTRAINT shop_logistics_settings_mode_check CHECK (
          (fulfillment_mode = 'manual' AND default_account_id IS NULL AND default_account_owner_type IS NULL)
          OR (fulfillment_mode = 'vendor' AND default_account_id IS NOT NULL AND default_account_owner_type = 'shop')
          OR (fulfillment_mode = 'platform' AND default_account_id IS NOT NULL AND default_account_owner_type = 'platform'))
      )
    `)

    // docs/04 §2.2: one updated_at trigger per table that has the column.
    this.schema.raw(String.raw`
      CREATE TRIGGER shops_set_updated_at BEFORE UPDATE ON shops
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_memberships_set_updated_at BEFORE UPDATE ON shop_memberships
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_addresses_set_updated_at BEFORE UPDATE ON shop_addresses
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_payout_accounts_set_updated_at BEFORE UPDATE ON shop_payout_accounts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_categories_set_updated_at BEFORE UPDATE ON shop_categories
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_shipping_rates_set_updated_at BEFORE UPDATE ON shop_shipping_rates
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER logistics_accounts_set_updated_at BEFORE UPDATE ON logistics_accounts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER logistics_account_shops_set_updated_at BEFORE UPDATE ON logistics_account_shops
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER shop_logistics_settings_set_updated_at BEFORE UPDATE ON shop_logistics_settings
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_logistics_settings`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS logistics_account_shops`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS logistics_accounts`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_shipping_rates`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_delivery_coverage`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS slug_redirects`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_category_assignments`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_categories`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_payout_accounts`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_addresses`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_review_decisions`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_agreements`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_invitations`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shop_memberships`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS shops`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS shops_require_agreement()`)
  }
}
