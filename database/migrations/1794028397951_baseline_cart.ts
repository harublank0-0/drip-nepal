import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 8 of 14 (docs/04 §20.2.2): cart. `carts` and `cart_items`
 * are docs/04a §10.1 and §10.2; they reference only `users` (file 3) and
 * `product_variants` (file 7).
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §10.1. No fillfactor: every update changes indexed columns,
    // so a cart update is never HOT.
    this.schema.raw(String.raw`
      CREATE TABLE carts (
        id uuid NOT NULL DEFAULT uuidv7(),
        user_id uuid,
        guest_token_hash bytea,
        status text NOT NULL DEFAULT 'active',
        version int NOT NULL DEFAULT 1,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT carts_pkey PRIMARY KEY (id),
        CONSTRAINT carts_status_check CHECK (status IN ('active', 'converted', 'abandoned', 'merged')),
        CONSTRAINT carts_owner_check CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL),
        CONSTRAINT carts_guest_token_hash_check
          CHECK (guest_token_hash IS NULL OR octet_length(guest_token_hash) = 32),
        CONSTRAINT carts_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX carts_active_user_key ON carts (user_id) WHERE status = 'active';
      CREATE UNIQUE INDEX carts_active_guest_key ON carts (guest_token_hash) WHERE status = 'active';
      CREATE INDEX carts_expiry_idx ON carts (expires_at) WHERE status = 'active';
      CREATE INDEX carts_purge_idx ON carts (updated_at) WHERE status <> 'active'
    `)

    // docs/04a §10.2. The cascade from carts is one of the three of
    // docs/04 §2.6; variant_id is deliberately not indexed (docs/04 §17.3).
    this.schema.raw(String.raw`
      CREATE TABLE cart_items (
        id uuid NOT NULL DEFAULT uuidv7(),
        cart_id uuid NOT NULL,
        variant_id uuid NOT NULL,
        quantity int NOT NULL,
        unit_price_minor_at_add bigint NOT NULL,
        currency char(3) NOT NULL DEFAULT 'NPR',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT cart_items_pkey PRIMARY KEY (id),
        CONSTRAINT cart_items_cart_fkey FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
        CONSTRAINT cart_items_variant_fkey FOREIGN KEY (variant_id)
          REFERENCES product_variants (id) ON DELETE RESTRICT,
        CONSTRAINT cart_items_cart_variant_key UNIQUE (cart_id, variant_id),
        CONSTRAINT cart_items_quantity_check CHECK (quantity BETWEEN 1 AND 10),
        CONSTRAINT cart_items_unit_price_check CHECK (unit_price_minor_at_add >= 0),
        CONSTRAINT cart_items_currency_check CHECK (currency = 'NPR')
      )
    `)

    // docs/04 §2.2: one updated_at trigger per table that has the column.
    this.schema.raw(String.raw`
      CREATE TRIGGER carts_set_updated_at BEFORE UPDATE ON carts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER cart_items_set_updated_at BEFORE UPDATE ON cart_items
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS cart_items`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS carts`)
  }
}
