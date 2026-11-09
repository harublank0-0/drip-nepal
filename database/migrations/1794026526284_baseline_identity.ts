import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 3 of 14 (docs/04 §20.2.2): identity. Tables and constraints
 * are those of docs/04a §5.1 to §5.5. `sessions` is the table of
 * `node ace make:session-table` (@adonisjs/session), written as SQL with the
 * stub's columns and index names.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §5.1
    this.schema.raw(String.raw`
      CREATE TABLE users (
        id uuid NOT NULL DEFAULT uuidv7(),
        email citext NOT NULL,
        email_verified_at timestamptz,
        password_hash text,
        full_name text,
        phone_enc text,
        phone_hash bytea,
        phone_last4 char(4),
        phone_verified_at timestamptz,
        marketing_email_consent_at timestamptz,
        marketing_sms_consent_at timestamptz,
        age_confirmed_at timestamptz,
        status text NOT NULL DEFAULT 'pending_verification',
        security_stamp uuid NOT NULL DEFAULT gen_random_uuid(),
        mfa_totp_secret_enc text,
        mfa_enabled_at timestamptz,
        mfa_last_used_step bigint,
        last_login_at timestamptz,
        deletion_requested_at timestamptz,
        anonymized_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT users_pkey PRIMARY KEY (id),
        CONSTRAINT users_email_key UNIQUE (email),
        CONSTRAINT users_email_check
          CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(btrim(email::text))),
        CONSTRAINT users_status_check
          CHECK (status IN ('pending_verification','active','suspended','deactivated','anonymized')),
        CONSTRAINT users_full_name_check CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 1 AND 100),
        CONSTRAINT users_identity_required_check
          CHECK (status = 'anonymized' OR (full_name IS NOT NULL AND password_hash IS NOT NULL)),
        CONSTRAINT users_active_verified_check CHECK (status <> 'active' OR email_verified_at IS NOT NULL),
        CONSTRAINT users_deactivated_check CHECK (status <> 'deactivated' OR deletion_requested_at IS NOT NULL),
        CONSTRAINT users_phone_parts_check
          CHECK ((phone_enc IS NULL) = (phone_hash IS NULL) AND (phone_enc IS NULL) = (phone_last4 IS NULL)),
        CONSTRAINT users_phone_hash_check CHECK (phone_hash IS NULL OR octet_length(phone_hash) = 32),
        CONSTRAINT users_phone_last4_check CHECK (phone_last4 ~ '^[0-9]{4}$'),
        CONSTRAINT users_mfa_check CHECK (mfa_enabled_at IS NULL OR mfa_totp_secret_enc IS NOT NULL),
        CONSTRAINT users_phone_enc_check CHECK (phone_enc IS NULL OR phone_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT users_mfa_totp_secret_enc_check CHECK (mfa_totp_secret_enc IS NULL OR mfa_totp_secret_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT users_anonymized_check CHECK ((status = 'anonymized') = (anonymized_at IS NOT NULL) AND (status <> 'anonymized' OR (email::text = 'deleted-' || id::text || '@anonymized.invalid' AND full_name IS NULL AND password_hash IS NULL AND phone_enc IS NULL AND mfa_totp_secret_enc IS NULL AND marketing_email_consent_at IS NULL AND marketing_sms_consent_at IS NULL AND age_confirmed_at IS NULL)))
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX users_verified_phone_key ON users (phone_hash) WHERE phone_verified_at IS NOT NULL;
      CREATE INDEX users_phone_hash_idx ON users (phone_hash) WHERE phone_hash IS NOT NULL;
      CREATE INDEX users_deletion_queue_idx ON users (deletion_requested_at, id) WHERE status = 'deactivated'
    `)

    // docs/04a §5.2
    this.schema.raw(String.raw`
      CREATE TABLE user_tokens (
        id uuid NOT NULL DEFAULT uuidv7(),
        user_id uuid NOT NULL,
        purpose text NOT NULL,
        token_hash bytea NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_tokens_pkey PRIMARY KEY (id),
        CONSTRAINT user_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT user_tokens_token_hash_key UNIQUE (token_hash),
        CONSTRAINT user_tokens_token_hash_check CHECK (octet_length(token_hash) = 32),
        CONSTRAINT user_tokens_purpose_check
          CHECK (purpose IN ('email_verification','password_reset','mfa_enrollment')),
        CONSTRAINT user_tokens_expiry_check
          CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX user_tokens_live_key ON user_tokens (user_id, purpose) WHERE consumed_at IS NULL;
      CREATE INDEX user_tokens_expires_at_idx ON user_tokens (expires_at)
    `)

    // docs/04a §5.3: the session store table, as make:session-table creates it.
    this.schema.raw(String.raw`
      CREATE TABLE sessions (
        id varchar(255) NOT NULL,
        data text NOT NULL,
        user_id varchar(255),
        expires_at timestamptz NOT NULL,
        CONSTRAINT sessions_pkey PRIMARY KEY (id)
      );
      CREATE INDEX sessions_user_id_index ON sessions (user_id);
      CREATE INDEX sessions_expires_at_index ON sessions (expires_at)
    `)

    // docs/04a §5.4
    this.schema.raw(String.raw`
      CREATE TABLE platform_staff (
        user_id uuid NOT NULL,
        role text NOT NULL,
        granted_by uuid,
        granted_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz,
        revoked_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT platform_staff_pkey PRIMARY KEY (user_id),
        CONSTRAINT platform_staff_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT platform_staff_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT platform_staff_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT platform_staff_role_check
          CHECK (role IN ('platform_admin','support_agent','catalog_moderator','finance_officer')),
        CONSTRAINT platform_staff_self_grant_check CHECK (granted_by IS NULL OR granted_by <> user_id),
        CONSTRAINT platform_staff_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
      )
    `)

    // docs/04a §5.5. postal_code is STORED explicitly: PostgreSQL 18 makes
    // generated columns VIRTUAL by default.
    this.schema.raw(String.raw`
      CREATE TABLE user_addresses (
        id uuid NOT NULL DEFAULT uuidv7(),
        user_id uuid NOT NULL,
        label text,
        recipient_name_enc text NOT NULL,
        recipient_phone_enc text NOT NULL,
        recipient_phone_last4 char(4) NOT NULL,
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
        CONSTRAINT user_addresses_pkey PRIMARY KEY (id),
        CONSTRAINT user_addresses_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT user_addresses_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT,
        CONSTRAINT user_addresses_district_fkey FOREIGN KEY (district_code, province_code)
          REFERENCES districts (code, province_code) ON DELETE RESTRICT,
        CONSTRAINT user_addresses_local_level_fkey FOREIGN KEY (local_level_code, district_code)
          REFERENCES local_levels (code, district_code) ON DELETE RESTRICT,
        CONSTRAINT user_addresses_ward_no_check CHECK (ward_no BETWEEN 1 AND 40),
        CONSTRAINT user_addresses_label_check CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30),
        CONSTRAINT user_addresses_recipient_phone_last4_check CHECK (recipient_phone_last4 ~ '^[0-9]{4}$'),
        CONSTRAINT user_addresses_recipient_name_enc_check CHECK (recipient_name_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT user_addresses_recipient_phone_enc_check CHECK (recipient_phone_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT user_addresses_area_tole_enc_check CHECK (area_tole_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT user_addresses_street_landmark_enc_check CHECK (street_landmark_enc IS NULL OR street_landmark_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
        CONSTRAINT user_addresses_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL))
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX user_addresses_one_default_key ON user_addresses (user_id) WHERE is_default AND archived_at IS NULL;
      CREATE INDEX user_addresses_user_active_idx ON user_addresses (user_id, created_at) WHERE archived_at IS NULL;
      CREATE INDEX user_addresses_archived_idx ON user_addresses (archived_at) WHERE archived_at IS NOT NULL
    `)

    // docs/04 §2.2
    this.schema.raw(String.raw`
      CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER platform_staff_set_updated_at BEFORE UPDATE ON platform_staff
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER user_addresses_set_updated_at BEFORE UPDATE ON user_addresses
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS user_addresses`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS platform_staff`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS sessions`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS user_tokens`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS users`)
  }
}
