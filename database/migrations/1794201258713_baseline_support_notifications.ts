import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 13 of 14 (docs/04 §20.2.2): support cases and notification
 * deliveries. Tables and constraints are those of docs/04a §14.1 to §14.3,
 * created in the order the file list gives: `support_cases`,
 * `support_case_messages`, `notification_deliveries`; then
 * `return_requests_case_fkey` of docs/04a §11.7, which closes cycle 2
 * (`return_requests` → `support_cases` → `orders`). The proposed
 * `page_view_daily_totals` (docs/04a §15.6) is created here only once
 * adopted.
 *
 * The append-only triggers and REVOKEs of `support_case_messages` are in
 * file 14 (docs/04 §2.12).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §14.1
    this.schema.raw(String.raw`
      CREATE TABLE support_cases (
        id uuid NOT NULL DEFAULT uuidv7(),
        number text NOT NULL,
        opened_by_user_id uuid,
        customer_user_id uuid,
        order_id uuid,
        shop_order_id uuid,
        shop_id uuid,
        category text NOT NULL,
        status text NOT NULL DEFAULT 'open',
        subject text NOT NULL,
        due_at timestamptz NOT NULL,
        resolution_summary text,
        assigned_to_user_id uuid,
        resolved_at timestamptz,
        closed_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT support_cases_pkey PRIMARY KEY (id),
        CONSTRAINT support_cases_number_key UNIQUE (number),
        CONSTRAINT support_cases_id_customer_user_id_key UNIQUE (id, customer_user_id),   -- target for §11.7
        CONSTRAINT support_cases_number_check CHECK (number ~ '^SC-[0-9A-HJKMNP-TV-Z]{7}$'),
        CONSTRAINT support_cases_opened_by_fkey FOREIGN KEY (opened_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_customer_fkey FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_order_customer_fkey FOREIGN KEY (order_id, customer_user_id)
          REFERENCES orders (id, customer_user_id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
          REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_shop_order_shop_fkey FOREIGN KEY (shop_order_id, shop_id)
          REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_assignee_fkey FOREIGN KEY (assigned_to_user_id)
          REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
        CONSTRAINT support_cases_category_check CHECK (category IN ('order_issue', 'return_request', 'refund',
          'delivery', 'product_complaint', 'account', 'other')),
        CONSTRAINT support_cases_status_check
          CHECK (status IN ('open', 'awaiting_customer', 'awaiting_shop', 'resolved', 'closed')),
        CONSTRAINT support_cases_links_check CHECK ((order_id IS NULL OR customer_user_id IS NOT NULL)
          AND (shop_order_id IS NULL OR (order_id IS NOT NULL AND shop_id IS NOT NULL))),
        CONSTRAINT support_cases_due_check CHECK (due_at <= created_at + interval '15 days'),
        CONSTRAINT support_cases_resolution_check CHECK (status NOT IN ('resolved', 'closed')
          OR (resolution_summary IS NOT NULL AND resolved_at IS NOT NULL)),
        CONSTRAINT support_cases_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
        CONSTRAINT support_cases_text_check CHECK (char_length(subject) BETWEEN 3 AND 150
          AND char_length(coalesce(resolution_summary, '')) <= 5000)
      )
    `)
    // The number key and the (id, customer_user_id) key are indexes too
    this.schema.raw(String.raw`
      CREATE INDEX support_cases_customer_idx ON support_cases (customer_user_id, created_at DESC, id DESC)
        WHERE customer_user_id IS NOT NULL;
      CREATE INDEX support_cases_shop_idx ON support_cases (shop_id, created_at DESC, id DESC)
        WHERE shop_id IS NOT NULL;
      CREATE INDEX support_cases_open_due_idx ON support_cases (due_at)
        WHERE status IN ('open', 'awaiting_customer', 'awaiting_shop');
      CREATE INDEX support_cases_open_shop_order_idx ON support_cases (shop_order_id)
        WHERE shop_order_id IS NOT NULL AND status IN ('open', 'awaiting_customer', 'awaiting_shop')
    `)

    // docs/04a §14.2. Append-only: its triggers and REVOKEs are in file 14.
    this.schema.raw(String.raw`
      CREATE TABLE support_case_messages (
        id uuid NOT NULL DEFAULT uuidv7(),
        case_id uuid NOT NULL,
        author_type text NOT NULL,
        author_user_id uuid,
        visibility text NOT NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT support_case_messages_pkey PRIMARY KEY (id),
        CONSTRAINT support_case_messages_case_fkey FOREIGN KEY (case_id)
          REFERENCES support_cases (id) ON DELETE RESTRICT,
        CONSTRAINT support_case_messages_author_fkey FOREIGN KEY (author_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT support_case_messages_author_type_check
          CHECK (author_type IN ('customer', 'shop_member', 'platform_staff', 'system')
          AND (author_type = 'system') = (author_user_id IS NULL)),
        CONSTRAINT support_case_messages_visibility_check CHECK (visibility IN ('customer', 'shop', 'internal')),
        CONSTRAINT support_case_messages_author_visibility_check CHECK (
              (author_type <> 'customer'    OR visibility = 'customer')
          AND (author_type <> 'shop_member' OR visibility = 'shop')),
        CONSTRAINT support_case_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 5000)
      )
    `)
    this.schema.raw(
      String.raw`CREATE INDEX support_case_messages_case_idx ON support_case_messages (case_id, created_at, id)`
    )

    // docs/04a §14.3. The `\.` in notification_deliveries_template_check is a literal dot.
    this.schema.raw(String.raw`
      CREATE TABLE notification_deliveries (
        id uuid NOT NULL DEFAULT uuidv7(),
        dedupe_key text NOT NULL,
        channel text NOT NULL DEFAULT 'email',
        template text NOT NULL,
        recipient_user_id uuid,
        shop_id uuid,
        to_address_hash bytea,
        status text NOT NULL DEFAULT 'queued',
        attempts int NOT NULL DEFAULT 0,
        provider_message_id text,
        last_error text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
        CONSTRAINT notification_deliveries_dedupe_key_key UNIQUE (dedupe_key),
        CONSTRAINT notification_deliveries_recipient_fkey FOREIGN KEY (recipient_user_id)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT notification_deliveries_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email')),
        CONSTRAINT notification_deliveries_template_check CHECK (template ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
        CONSTRAINT notification_deliveries_status_check CHECK (status IN ('queued', 'sent', 'failed')),
        CONSTRAINT notification_deliveries_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
        CONSTRAINT notification_deliveries_hash_check CHECK (to_address_hash IS NULL OR octet_length(to_address_hash) = 32),
        CONSTRAINT notification_deliveries_dedupe_key_check CHECK (char_length(dedupe_key) BETWEEN 10 AND 200)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX notification_deliveries_recipient_idx ON notification_deliveries (recipient_user_id, created_at DESC)
        WHERE recipient_user_id IS NOT NULL;
      CREATE INDEX notification_deliveries_unsent_idx ON notification_deliveries (created_at)
        WHERE status IN ('queued', 'failed')
    `)

    // docs/04a §11.7, cycle 2 of docs/04 §20.2.2. MATCH SIMPLE: a return without a case is not checked.
    this.schema.raw(String.raw`
      ALTER TABLE return_requests ADD CONSTRAINT return_requests_case_fkey FOREIGN KEY (support_case_id, requested_by_user_id)
        REFERENCES support_cases (id, customer_user_id) ON DELETE RESTRICT
    `)

    // docs/04 §2.2: the two tables here with `updated_at`
    this.schema.raw(String.raw`
      CREATE TRIGGER support_cases_set_updated_at BEFORE UPDATE ON support_cases
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER notification_deliveries_set_updated_at BEFORE UPDATE ON notification_deliveries
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(
      String.raw`ALTER TABLE IF EXISTS return_requests DROP CONSTRAINT IF EXISTS return_requests_case_fkey`
    )
    this.schema.raw(String.raw`DROP TABLE IF EXISTS notification_deliveries`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS support_case_messages`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS support_cases`)
  }
}
