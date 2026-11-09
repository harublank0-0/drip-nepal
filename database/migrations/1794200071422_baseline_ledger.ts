import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 12 of 14 (docs/04 §20.2.2): ledger and payouts. Tables and
 * constraints are those of docs/04a §13.1 to §13.4, created in the order the
 * file list gives: `payouts`, `vendor_remittances`, `ledger_entries` (it
 * references both), `payout_entries` with `payout_entries_guard` and its
 * `REVOKE UPDATE, TRUNCATE` (docs/04a §13.3). The proposed
 * `ledger_adjustment_requests` (§13.5) is created here only once adopted.
 *
 * Deferred foreign keys: none. Every key of docs/04a §13.1 to §13.4 points
 * at a table created by this file or an earlier one.
 *
 * The append-only triggers and REVOKEs of `ledger_entries` are in file 14
 * (docs/04 §2.12). File 14 also repeats the `payout_entries` REVOKE after its
 * blanket grant to `dripnepal_app`, so the grant does not undo it.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §13.2
    this.schema.raw(String.raw`
      CREATE TABLE payouts (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        payout_account_id uuid NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        status text NOT NULL DEFAULT 'draft',
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        bank_reference text,
        failure_reason text,
        created_by uuid NOT NULL,
        approved_by uuid,
        is_single_operator_approval boolean NOT NULL DEFAULT false,
        approved_at timestamptz,
        paid_at timestamptz,
        failed_at timestamptz,
        cancelled_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payouts_pkey PRIMARY KEY (id),
        CONSTRAINT payouts_id_shop_id_key UNIQUE (id, shop_id),                   -- target for §13.1, §13.3
        CONSTRAINT payouts_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT payouts_account_fkey FOREIGN KEY (payout_account_id, shop_id)
          REFERENCES shop_payout_accounts (id, shop_id) ON DELETE RESTRICT,       -- shop_payout_accounts_id_shop_id_key, §6.7
        CONSTRAINT payouts_created_by_fkey FOREIGN KEY (created_by)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT payouts_approved_by_fkey FOREIGN KEY (approved_by)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT payouts_status_check CHECK (status IN ('draft', 'approved', 'paid', 'failed', 'cancelled')),
        CONSTRAINT payouts_amount_check CHECK (amount_minor > 0),
        CONSTRAINT payouts_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT payouts_period_check CHECK (period_end > period_start),
        CONSTRAINT payouts_maker_checker_check
          CHECK (approved_by IS NULL OR approved_by <> created_by OR is_single_operator_approval),
        CONSTRAINT payouts_approved_check CHECK ((status IN ('approved', 'paid', 'failed'))
          = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
        CONSTRAINT payouts_paid_check
          CHECK ((status = 'paid') = (paid_at IS NOT NULL AND bank_reference IS NOT NULL)),
        CONSTRAINT payouts_failed_check
          CHECK ((status = 'failed') = (failed_at IS NOT NULL AND failure_reason IS NOT NULL)),
        CONSTRAINT payouts_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
      )
    `)
    // One payout in flight per shop [Assumption]: finance works a shop's payouts one at a time
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX payouts_one_open_per_shop_key ON payouts (shop_id) WHERE status IN ('draft', 'approved');
      CREATE INDEX payouts_shop_idx ON payouts (shop_id, created_at DESC, id DESC);
      CREATE INDEX payouts_admin_status_idx ON payouts (status, created_at DESC, id DESC)
    `)

    // docs/04a §13.4
    this.schema.raw(String.raw`
      CREATE TABLE vendor_remittances (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        method text NOT NULL,
        reference text NOT NULL,
        received_at timestamptz NOT NULL,
        recorded_by uuid NOT NULL,
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT vendor_remittances_pkey PRIMARY KEY (id),
        CONSTRAINT vendor_remittances_id_shop_id_key UNIQUE (id, shop_id),                 -- target for §13.1
        CONSTRAINT vendor_remittances_reference_key UNIQUE (shop_id, method, reference),   -- one transfer, one record
        CONSTRAINT vendor_remittances_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT vendor_remittances_recorded_by_fkey FOREIGN KEY (recorded_by)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT vendor_remittances_amount_check CHECK (amount_minor > 0),
        CONSTRAINT vendor_remittances_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT vendor_remittances_method_check CHECK (method IN ('bank_transfer', 'wallet', 'cash', 'other')),
        CONSTRAINT vendor_remittances_reference_check CHECK (char_length(reference) BETWEEN 3 AND 100),
        CONSTRAINT vendor_remittances_received_at_check CHECK (received_at <= created_at + interval '1 day'),
        CONSTRAINT vendor_remittances_note_check CHECK (note IS NULL OR char_length(note) <= 500)
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX vendor_remittances_shop_idx ON vendor_remittances (shop_id, received_at DESC)`
    )

    // docs/04a §13.1. Append-only: its triggers and REVOKEs are in file 14.
    // The `\?` in ledger_entries_dedupe_key_check is the regex quantifier `?`.
    this.schema.raw(String.raw`
      CREATE TABLE ledger_entries (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        entry_type text NOT NULL,
        amount_minor bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        shop_order_id uuid,
        order_item_id uuid,
        refund_id uuid,
        payout_id uuid,
        remittance_id uuid,
        reverses_entry_id uuid,
        available_at timestamptz NOT NULL,
        description text NOT NULL,
        created_by uuid,
        dedupe_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
        CONSTRAINT ledger_entries_dedupe_key_key UNIQUE (dedupe_key),
        CONSTRAINT ledger_entries_id_shop_id_key UNIQUE (id, shop_id),          -- target for §13.3, §13.5 and self-reference
        CONSTRAINT ledger_entries_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_order_item_fkey FOREIGN KEY (order_item_id, shop_id)
          REFERENCES order_items (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_refund_fkey FOREIGN KEY (refund_id, shop_id)
          REFERENCES refunds (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_payout_fkey FOREIGN KEY (payout_id, shop_id)
          REFERENCES payouts (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_remittance_fkey FOREIGN KEY (remittance_id, shop_id)
          REFERENCES vendor_remittances (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_reverses_fkey FOREIGN KEY (reverses_entry_id, shop_id)
          REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT ledger_entries_type_check CHECK (entry_type IN ('sale', 'shipping_income', 'commission',
          'commission_reversal', 'cod_cash_held', 'refund', 'vendor_remittance', 'payout', 'payout_reversal',
          'tax_withholding', 'adjustment')),
        CONSTRAINT ledger_entries_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT ledger_entries_sign_check CHECK (CASE entry_type
          WHEN 'sale'                THEN amount_minor >= 0
          WHEN 'shipping_income'     THEN amount_minor >= 0
          WHEN 'commission_reversal' THEN amount_minor >= 0
          WHEN 'vendor_remittance'   THEN amount_minor > 0
          WHEN 'payout_reversal'     THEN amount_minor > 0
          WHEN 'commission'          THEN amount_minor <= 0
          WHEN 'cod_cash_held'       THEN amount_minor <= 0
          WHEN 'refund'              THEN amount_minor <= 0
          WHEN 'tax_withholding'     THEN amount_minor <= 0
          WHEN 'payout'              THEN amount_minor < 0
          WHEN 'adjustment'          THEN amount_minor <> 0 END),
        CONSTRAINT ledger_entries_reference_check CHECK (CASE entry_type
          WHEN 'sale'                THEN shop_order_id IS NOT NULL
          WHEN 'shipping_income'     THEN shop_order_id IS NOT NULL
          WHEN 'commission'          THEN shop_order_id IS NOT NULL
          WHEN 'cod_cash_held'       THEN shop_order_id IS NOT NULL
          WHEN 'refund'              THEN shop_order_id IS NOT NULL AND refund_id IS NOT NULL
          WHEN 'commission_reversal' THEN shop_order_id IS NOT NULL AND refund_id IS NOT NULL
          WHEN 'vendor_remittance'   THEN remittance_id IS NOT NULL AND created_by IS NOT NULL
          WHEN 'payout'              THEN payout_id IS NOT NULL
          WHEN 'payout_reversal'     THEN payout_id IS NOT NULL AND reverses_entry_id IS NOT NULL
          WHEN 'tax_withholding'     THEN payout_id IS NOT NULL
          WHEN 'adjustment'          THEN created_by IS NOT NULL AND char_length(description) >= 20 END),
        CONSTRAINT ledger_entries_description_check CHECK (char_length(description) BETWEEN 3 AND 500),
        CONSTRAINT ledger_entries_dedupe_key_check CHECK (dedupe_key ~
          '^(delivery|refund|remittance|payout|adjustment):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-z_]+)\?$')
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX ledger_entries_shop_statement_idx
        ON ledger_entries (shop_id, created_at DESC, id DESC) INCLUDE (amount_minor, available_at, entry_type);
      CREATE INDEX ledger_entries_shop_available_idx ON ledger_entries (shop_id, available_at);
      CREATE INDEX ledger_entries_shop_order_idx ON ledger_entries (shop_order_id) WHERE shop_order_id IS NOT NULL;
      CREATE INDEX ledger_entries_recent_idx ON ledger_entries (created_at DESC, id DESC)
    `)

    // docs/04a §13.3. Composite primary key: written with the query builder
    // (docs/04 §2.15). The primary key and the ledger-entry key are its
    // indexes.
    this.schema.raw(String.raw`
      CREATE TABLE payout_entries (
        payout_id uuid NOT NULL,
        ledger_entry_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payout_entries_pkey PRIMARY KEY (payout_id, ledger_entry_id),
        CONSTRAINT payout_entries_ledger_entry_key UNIQUE (ledger_entry_id),
        CONSTRAINT payout_entries_payout_fkey FOREIGN KEY (payout_id, shop_id)
          REFERENCES payouts (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT payout_entries_entry_fkey FOREIGN KEY (ledger_entry_id, shop_id)
          REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT
      )
    `)
    // Links may be added or removed only while the payout is a draft; a payout entry is never itself paid out
    this.schema.raw(String.raw`
      CREATE OR REPLACE FUNCTION payout_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        v_payout uuid;
        v_status text;
      BEGIN
        IF TG_OP = 'DELETE' THEN v_payout := OLD.payout_id; ELSE v_payout := NEW.payout_id; END IF;
        SELECT status INTO v_status FROM payouts WHERE id = v_payout FOR SHARE;
        IF v_status IS DISTINCT FROM 'draft' THEN
          RAISE EXCEPTION 'payout_entries can change only while the payout is a draft' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM ledger_entries
                                         WHERE id = NEW.ledger_entry_id AND entry_type = 'payout') THEN
          RAISE EXCEPTION 'a payout entry cannot be included in a payout' USING ERRCODE = 'P0001';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END $$
    `)
    this.schema.raw(String.raw`
      CREATE TRIGGER payout_entries_guard BEFORE INSERT OR DELETE ON payout_entries
        FOR EACH ROW EXECUTE FUNCTION payout_entries_guard()
    `)
    // The REVOKE of docs/04a §13.3, under the per-role guard of file 14
    // (docs/04 §20.2.2), so a database without `dripnepal_app` still migrates.
    this.schema.raw(String.raw`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dripnepal_app') THEN
          REVOKE UPDATE, TRUNCATE ON payout_entries FROM dripnepal_app;
        END IF;
      END $$
    `)

    // docs/04 §2.2: `payouts` is the one table here with `updated_at`
    this.schema.raw(String.raw`
      CREATE TRIGGER payouts_set_updated_at BEFORE UPDATE ON payouts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS payout_entries`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS ledger_entries`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS vendor_remittances`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS payouts`)
    this.schema.raw(String.raw`DROP FUNCTION IF EXISTS payout_entries_guard()`)
  }
}
