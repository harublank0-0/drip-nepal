import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 4 of 14 (docs/04 §20.2.2): platform. Tables and constraints
 * are those of docs/04a §15.1 to §15.4. `rate_limits` is the table of the
 * @adonisjs/limiter database store stub, written as SQL. The append-only
 * triggers and REVOKEs of `audit_logs` are in file 14 (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §15.1
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION jsonb_int_between(v jsonb, lo bigint, hi bigint) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN jsonb_typeof(v) = 'number' AND (v #>> '{}') ~ '^[0-9]{1,18}$'
                    THEN (v #>> '{}')::bigint BETWEEN lo AND hi ELSE false END
      $$
    `)
    this.schema.raw(String.raw`
      CREATE TABLE platform_settings (
        key text NOT NULL,
        value jsonb NOT NULL,
        updated_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT platform_settings_pkey PRIMARY KEY (key),
        CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT platform_settings_value_check CHECK (CASE key
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
      )
    `)

    // docs/04a §15.2
    this.schema.raw(String.raw`
      CREATE TABLE idempotency_keys (
        id uuid NOT NULL DEFAULT uuidv7(),
        actor_scope text NOT NULL,
        operation text NOT NULL,
        key text NOT NULL,
        fingerprint bytea NOT NULL,
        status text NOT NULL DEFAULT 'completed',
        response_status smallint NOT NULL,
        response_body jsonb NOT NULL,
        resource_type text,
        resource_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id),
        CONSTRAINT idempotency_keys_scope_key UNIQUE (actor_scope, operation, key),
        CONSTRAINT idempotency_keys_actor_scope_check CHECK (actor_scope ~
          '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|provider:[a-z]+|system)$'),
        CONSTRAINT idempotency_keys_operation_check CHECK (operation ~ '^[a-z][A-Za-z0-9]{2,60}$'),
        CONSTRAINT idempotency_keys_key_check CHECK (key ~ '^[A-Za-z0-9_-]{16,64}$'),
        CONSTRAINT idempotency_keys_fingerprint_check CHECK (octet_length(fingerprint) = 32),
        CONSTRAINT idempotency_keys_status_check CHECK (status IN ('completed')),
        CONSTRAINT idempotency_keys_response_check
          CHECK (response_status BETWEEN 200 AND 599 AND jsonb_typeof(response_body) = 'object'),
        CONSTRAINT idempotency_keys_expiry_check
          CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')
      );
      CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at)
    `)

    // docs/04a §15.3. No foreign keys, by design (docs/04 §4.5).
    this.schema.raw(String.raw`
      CREATE TABLE audit_logs (
        id bigint GENERATED ALWAYS AS IDENTITY,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        actor_type text NOT NULL,
        actor_user_id uuid,
        actor_role text,
        action text NOT NULL,
        subject_type text NOT NULL,
        subject_id text NOT NULL,
        shop_id uuid,
        request_id text,
        ip_hash bytea,
        changes jsonb NOT NULL DEFAULT '{}',
        reason text,
        CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
        CONSTRAINT audit_logs_actor_type_check
          CHECK (actor_type IN ('customer', 'shop_member', 'platform_staff', 'system', 'provider')),
        CONSTRAINT audit_logs_actor_check
          CHECK (actor_type NOT IN ('shop_member', 'platform_staff') OR actor_user_id IS NOT NULL),
        CONSTRAINT audit_logs_action_check CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
        CONSTRAINT audit_logs_subject_check CHECK (char_length(subject_type) BETWEEN 2 AND 40
          AND char_length(subject_id) BETWEEN 1 AND 100),
        CONSTRAINT audit_logs_changes_check CHECK (jsonb_typeof(changes) = 'object'),
        CONSTRAINT audit_logs_ip_hash_check CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
        CONSTRAINT audit_logs_reason_check CHECK (reason IS NULL OR char_length(reason) <= 2000)
      );
      CREATE INDEX audit_logs_subject_idx ON audit_logs (subject_type, subject_id, id DESC);
      CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_user_id, id DESC) WHERE actor_user_id IS NOT NULL;
      CREATE INDEX audit_logs_shop_idx ON audit_logs (shop_id, id DESC) WHERE shop_id IS NOT NULL;
      CREATE INDEX audit_logs_action_idx ON audit_logs (action, id DESC);
      CREATE INDEX audit_logs_occurred_at_idx ON audit_logs (occurred_at)
    `)

    // docs/04a §15.4: the limiter store table, as the package stub creates it.
    this.schema.raw(String.raw`
      CREATE TABLE rate_limits (
        key varchar(255) NOT NULL,
        points integer NOT NULL DEFAULT 0,
        expire bigint,
        CONSTRAINT rate_limits_pkey PRIMARY KEY (key)
      )
    `)

    // docs/04 §2.2
    this.schema.raw(String.raw`
      CREATE TRIGGER platform_settings_set_updated_at BEFORE UPDATE ON platform_settings
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS rate_limits`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS audit_logs`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS idempotency_keys`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS platform_settings`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS jsonb_int_between(jsonb, bigint, bigint)`)
  }
}
