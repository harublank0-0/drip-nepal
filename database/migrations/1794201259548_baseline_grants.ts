import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 14 of 14 (docs/04 §20.2.2): the append-only triggers of
 * docs/04 §2.12 and the runtime-role grants of docs/07 §4.10.
 *
 * Layer 2 of docs/04 §2.12: each of the nine append-only tables gets a row
 * trigger `<table>_no_update_delete` and a statement trigger
 * `<table>_no_truncate`, both calling `forbid_mutation()` (file 1), so even
 * the owner is stopped.
 *
 * Layer 1, the grants (docs/07 §4.10). `dripnepal_app` gets `USAGE` on schema
 * `public` and `SELECT, INSERT, UPDATE, DELETE` on every table in it; then the
 * REVOKEs: no `UPDATE`, `DELETE` or `TRUNCATE` on the nine append-only
 * tables, and `REVOKE UPDATE, TRUNCATE` on `payout_entries` again (docs/04a
 * §13.3), because the blanket grant would undo the REVOKE of file 12.
 * `dripnepal_readonly` gets `USAGE` on `public` and `SELECT` on every table
 * except `sessions`, `user_tokens`, `rate_limits`, `idempotency_keys` and
 * `users`; on `users` it gets column-level `SELECT` on every column except the
 * plaintext Secret columns `password_hash` and `security_stamp`. A column
 * added to `users` later is granted to `dripnepal_readonly` in its `grant_*`
 * file (docs/09 §8.3). No default privileges: each later table gets its
 * grants in its `grant_*` file (docs/07 §4.10).
 *
 * Sequences: the one sequence in the baseline backs the identity column
 * `audit_logs.id`, and an identity column draws its value without a
 * privilege check on its sequence, so neither role is granted it.
 *
 * Each role's statements have their own guard, so a database without one of
 * the roles still migrates (docs/04 §20.2.2, docs/09 §8.3). Role membership
 * (`pg_read_all_stats` for `dripnepal_readonly`) is granted where the roles
 * are created, not here: the migrator cannot grant it.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04 §2.12, layer 2: the nine append-only tables
    this.schema.raw(String.raw`
      CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER ledger_entries_no_update_delete BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER inventory_movements_no_update_delete BEFORE UPDATE OR DELETE ON inventory_movements
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER inventory_movements_no_truncate BEFORE TRUNCATE ON inventory_movements
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER order_events_no_update_delete BEFORE UPDATE OR DELETE ON order_events
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER order_events_no_truncate BEFORE TRUNCATE ON order_events
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shipment_events_no_update_delete BEFORE UPDATE OR DELETE ON shipment_events
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shipment_events_no_truncate BEFORE TRUNCATE ON shipment_events
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shop_review_decisions_no_update_delete BEFORE UPDATE OR DELETE ON shop_review_decisions
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shop_review_decisions_no_truncate BEFORE TRUNCATE ON shop_review_decisions
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER product_review_decisions_no_update_delete BEFORE UPDATE OR DELETE ON product_review_decisions
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER product_review_decisions_no_truncate BEFORE TRUNCATE ON product_review_decisions
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shop_agreements_no_update_delete BEFORE UPDATE OR DELETE ON shop_agreements
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER shop_agreements_no_truncate BEFORE TRUNCATE ON shop_agreements
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER support_case_messages_no_update_delete BEFORE UPDATE OR DELETE ON support_case_messages
        FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
      CREATE TRIGGER support_case_messages_no_truncate BEFORE TRUNCATE ON support_case_messages
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation()
    `)

    // docs/07 §4.10 and docs/04 §2.12, layer 1. The REVOKEs follow the blanket
    // GRANT, so the grant cannot undo them.
    this.schema.raw(String.raw`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_app') THEN
          GRANT USAGE ON SCHEMA public TO dripnepal_app;
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dripnepal_app;
          REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs, ledger_entries, inventory_movements, order_events,
            shipment_events, shop_review_decisions, product_review_decisions, shop_agreements,
            support_case_messages FROM dripnepal_app;
          REVOKE UPDATE, TRUNCATE ON payout_entries FROM dripnepal_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_readonly') THEN
          GRANT USAGE ON SCHEMA public TO dripnepal_readonly;
          GRANT SELECT ON ALL TABLES IN SCHEMA public TO dripnepal_readonly;
          -- A table-level REVOKE also removes column privileges, so it comes before the column grant
          REVOKE SELECT ON sessions, user_tokens, rate_limits, idempotency_keys, users FROM dripnepal_readonly;
          GRANT SELECT (id, email, email_verified_at, full_name, phone_enc, phone_hash, phone_last4,
            phone_verified_at, marketing_email_consent_at, marketing_sms_consent_at, age_confirmed_at, status,
            mfa_totp_secret_enc, mfa_enabled_at, mfa_last_used_step, last_login_at, deletion_requested_at,
            anonymized_at, created_at, updated_at) ON users TO dripnepal_readonly;
        END IF;
      END $$
    `)
  }

  async down() {
    this.schema.raw(String.raw`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_app') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dripnepal_app;
          REVOKE USAGE ON SCHEMA public FROM dripnepal_app;
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_readonly') THEN
          REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dripnepal_readonly;
          REVOKE USAGE ON SCHEMA public FROM dripnepal_readonly;
        END IF;
      END $$
    `)
    this.schema.raw(String.raw`
      DROP TRIGGER IF EXISTS support_case_messages_no_truncate ON support_case_messages;
      DROP TRIGGER IF EXISTS support_case_messages_no_update_delete ON support_case_messages;
      DROP TRIGGER IF EXISTS shop_agreements_no_truncate ON shop_agreements;
      DROP TRIGGER IF EXISTS shop_agreements_no_update_delete ON shop_agreements;
      DROP TRIGGER IF EXISTS product_review_decisions_no_truncate ON product_review_decisions;
      DROP TRIGGER IF EXISTS product_review_decisions_no_update_delete ON product_review_decisions;
      DROP TRIGGER IF EXISTS shop_review_decisions_no_truncate ON shop_review_decisions;
      DROP TRIGGER IF EXISTS shop_review_decisions_no_update_delete ON shop_review_decisions;
      DROP TRIGGER IF EXISTS shipment_events_no_truncate ON shipment_events;
      DROP TRIGGER IF EXISTS shipment_events_no_update_delete ON shipment_events;
      DROP TRIGGER IF EXISTS order_events_no_truncate ON order_events;
      DROP TRIGGER IF EXISTS order_events_no_update_delete ON order_events;
      DROP TRIGGER IF EXISTS inventory_movements_no_truncate ON inventory_movements;
      DROP TRIGGER IF EXISTS inventory_movements_no_update_delete ON inventory_movements;
      DROP TRIGGER IF EXISTS ledger_entries_no_truncate ON ledger_entries;
      DROP TRIGGER IF EXISTS ledger_entries_no_update_delete ON ledger_entries;
      DROP TRIGGER IF EXISTS audit_logs_no_truncate ON audit_logs;
      DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON audit_logs
    `)
  }
}
