import { BaseSchema } from '@adonisjs/lucid/schema'

/*
 * Baseline file 7 of 14 (docs/04 §20.2.2): catalog. Tables and constraints
 * are those of docs/04a §7.1 to §7.12 and §7.14, created in the order of
 * docs/04 §20.2.2, in which every foreign key points at a table created
 * earlier (here or in files 3, 5 and 6). `media_assets` (§7.13) is file 6;
 * `collections` (§7.15) is R2 and not in the baseline.
 *
 * The append-only trigger and REVOKEs of `product_review_decisions` are in
 * file 14 (docs/04 §2.12). The keys from `inventory_items`, `cart_items` and
 * `order_items` to `product_variants` are created by those tables' files.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.raw(String.raw`SET LOCAL lock_timeout = '5s'`)

    // docs/04a §7.1. Unique indexes only: the tree is read whole and cached.
    this.schema.raw(String.raw`
      CREATE TABLE categories (
        id uuid NOT NULL DEFAULT uuidv7(),
        parent_id uuid,
        slug citext NOT NULL,
        name text NOT NULL,
        description text,
        path text NOT NULL,
        depth smallint NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT categories_pkey PRIMARY KEY (id),
        CONSTRAINT categories_parent_fkey FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT,
        CONSTRAINT categories_slug_key UNIQUE (slug),
        CONSTRAINT categories_slug_check CHECK (slug::text ~ '^[a-z0-9](\?:[a-z0-9-]{1,38}[a-z0-9])$'),
        CONSTRAINT categories_parent_name_key UNIQUE NULLS NOT DISTINCT (parent_id, name),
        CONSTRAINT categories_path_key UNIQUE (path),
        CONSTRAINT categories_path_check CHECK (path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/)+$'),
        CONSTRAINT categories_depth_check CHECK (depth BETWEEN 1 AND 4 AND (parent_id IS NULL) = (depth = 1)),
        CONSTRAINT categories_not_own_parent_check CHECK (parent_id IS NULL OR parent_id <> id)
      )
    `)

    // docs/04a §7.2
    this.schema.raw(String.raw`
      CREATE TABLE attributes (
        id uuid NOT NULL DEFAULT uuidv7(),
        code text NOT NULL,
        name text NOT NULL,
        scope text NOT NULL,
        input text NOT NULL,
        is_filterable boolean NOT NULL DEFAULT false,
        position smallint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attributes_pkey PRIMARY KEY (id),
        CONSTRAINT attributes_code_key UNIQUE (code),
        CONSTRAINT attributes_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
        CONSTRAINT attributes_scope_check CHECK (scope IN ('product','variant')),
        CONSTRAINT attributes_input_check CHECK (input IN ('single','multi')),
        CONSTRAINT attributes_variant_single_check CHECK (scope <> 'variant' OR input = 'single')
      )
    `)

    // docs/04a §7.3
    this.schema.raw(String.raw`
      CREATE TABLE attribute_values (
        id uuid NOT NULL DEFAULT uuidv7(),
        attribute_id uuid NOT NULL,
        code text NOT NULL,
        label text NOT NULL,
        position smallint NOT NULL DEFAULT 0,
        swatch_hex text,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attribute_values_pkey PRIMARY KEY (id),
        CONSTRAINT attribute_values_attribute_fkey FOREIGN KEY (attribute_id)
          REFERENCES attributes (id) ON DELETE RESTRICT,
        CONSTRAINT attribute_values_attribute_code_key UNIQUE (attribute_id, code),
        CONSTRAINT attribute_values_id_attribute_id_key UNIQUE (id, attribute_id),
        CONSTRAINT attribute_values_code_check
          CHECK (code ~ '^[a-z0-9]+(\?:[-_][a-z0-9]+)*$' AND char_length(code) <= 40),
        CONSTRAINT attribute_values_label_check CHECK (char_length(label) BETWEEN 1 AND 40),
        CONSTRAINT attribute_values_swatch_check CHECK (swatch_hex ~ '^#[0-9a-f]{6}$')
      )
    `)

    // docs/04a §7.4. Composite key: written with the query builder (docs/04 §2.15).
    this.schema.raw(String.raw`
      CREATE TABLE category_attributes (
        category_id uuid NOT NULL,
        attribute_id uuid NOT NULL,
        usage text NOT NULL,
        is_required boolean NOT NULL DEFAULT false,
        position smallint NOT NULL DEFAULT 0,
        CONSTRAINT category_attributes_pkey PRIMARY KEY (category_id, attribute_id),
        CONSTRAINT category_attributes_category_fkey FOREIGN KEY (category_id)
          REFERENCES categories (id) ON DELETE RESTRICT,
        CONSTRAINT category_attributes_attribute_fkey FOREIGN KEY (attribute_id)
          REFERENCES attributes (id) ON DELETE RESTRICT,
        CONSTRAINT category_attributes_usage_check CHECK (usage IN ('product','variant_axis'))
      )
    `)

    // docs/04a §7.5. brands_name_lower_key is a unique index on an expression.
    this.schema.raw(String.raw`
      CREATE TABLE brands (
        id uuid NOT NULL DEFAULT uuidv7(),
        slug citext NOT NULL,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        requires_moderation boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT brands_pkey PRIMARY KEY (id),
        CONSTRAINT brands_slug_key UNIQUE (slug),
        CONSTRAINT brands_slug_check CHECK (slug::text ~ '^[a-z0-9](\?:[a-z0-9-]{1,38}[a-z0-9])$'),
        CONSTRAINT brands_name_check CHECK (char_length(name) BETWEEN 1 AND 80),
        CONSTRAINT brands_status_check CHECK (status IN ('active','pending','rejected'))
      )
    `)
    this.schema.raw(String.raw`CREATE UNIQUE INDEX brands_name_lower_key ON brands (lower(name))`)

    // docs/04a §7.6
    this.schema.raw(String.raw`
      CREATE TABLE products (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        public_id char(8) NOT NULL,
        slug text NOT NULL,
        title text NOT NULL,
        description text,
        category_id uuid NOT NULL,
        brand_id uuid,
        manufacturer_name text,
        is_imported boolean NOT NULL DEFAULT false,
        country_of_origin char(2),
        warranty_text text,
        care_and_precautions text,
        status text NOT NULL DEFAULT 'draft',
        rejection_reason text,
        submitted_at timestamptz,
        published_at timestamptz,
        first_published_at timestamptz,
        version int NOT NULL DEFAULT 1,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT products_pkey PRIMARY KEY (id),
        CONSTRAINT products_id_shop_id_key UNIQUE (id, shop_id),
        CONSTRAINT products_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
        CONSTRAINT products_category_fkey FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT,
        CONSTRAINT products_brand_fkey FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE RESTRICT,
        CONSTRAINT products_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT products_public_id_key UNIQUE (public_id),
        CONSTRAINT products_public_id_check CHECK (public_id ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
        CONSTRAINT products_slug_check CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
        CONSTRAINT products_title_check CHECK (char_length(title) BETWEEN 3 AND 120),
        CONSTRAINT products_description_check CHECK (description IS NULL OR (description ~ '[^[:space:]]' AND char_length(description) <= 5000)),
        CONSTRAINT products_manufacturer_name_check CHECK (manufacturer_name IS NULL OR (manufacturer_name ~ '[^[:space:]]' AND char_length(manufacturer_name) <= 200)),
        CONSTRAINT products_warranty_text_check CHECK (warranty_text IS NULL OR (warranty_text ~ '[^[:space:]]' AND char_length(warranty_text) <= 1000)),
        CONSTRAINT products_care_and_precautions_check CHECK (care_and_precautions IS NULL OR (care_and_precautions ~ '[^[:space:]]' AND char_length(care_and_precautions) <= 2000)),
        CONSTRAINT products_status_check CHECK (status IN ('draft','pending_review','published','unpublished','rejected','archived','blocked')),
        CONSTRAINT products_country_check CHECK (country_of_origin ~ '^[A-Z]{2}$' AND is_imported = (country_of_origin <> 'NP')),
        CONSTRAINT products_disclosures_check CHECK (status NOT IN ('pending_review','published','unpublished') OR (description IS NOT NULL AND manufacturer_name IS NOT NULL AND warranty_text IS NOT NULL AND care_and_precautions IS NOT NULL AND (NOT is_imported OR country_of_origin IS NOT NULL))),
        CONSTRAINT products_published_at_check CHECK (status <> 'published' OR (published_at IS NOT NULL AND first_published_at IS NOT NULL)),
        CONSTRAINT products_rejection_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
        CONSTRAINT products_submitted_check CHECK (status <> 'pending_review' OR submitted_at IS NOT NULL)
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX products_seller_list_idx ON products (shop_id, status, updated_at DESC, id DESC);
      CREATE INDEX products_moderation_queue_idx ON products (submitted_at, id) WHERE status = 'pending_review';
      CREATE INDEX products_category_idx ON products (category_id);
      CREATE INDEX products_brand_idx ON products (brand_id) WHERE brand_id IS NOT NULL
    `)

    // docs/04a §7.8. The position key is deferrable so that one UPDATE can
    // swap the two axes; it is neither a foreign-key target nor an ON
    // CONFLICT arbiter.
    this.schema.raw(String.raw`
      CREATE TABLE product_option_axes (
        product_id uuid NOT NULL,
        attribute_id uuid NOT NULL,
        position smallint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_option_axes_pkey PRIMARY KEY (product_id, attribute_id),
        CONSTRAINT product_option_axes_position_key UNIQUE (product_id, position) DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT product_option_axes_position_check CHECK (position BETWEEN 1 AND 2),
        CONSTRAINT product_option_axes_product_fkey FOREIGN KEY (product_id)
          REFERENCES products (id) ON DELETE RESTRICT,
        CONSTRAINT product_option_axes_attribute_fkey FOREIGN KEY (attribute_id)
          REFERENCES attributes (id) ON DELETE RESTRICT
      )
    `)

    // docs/04a §7.9. The three natural keys are partial unique indexes over
    // active variants, so an archived SKU or combination can be reused.
    this.schema.raw(String.raw`
      CREATE TABLE product_variants (
        id uuid NOT NULL DEFAULT uuidv7(),
        shop_id uuid NOT NULL,
        product_id uuid NOT NULL,
        sku text NOT NULL,
        price_minor bigint NOT NULL,
        compare_at_price_minor bigint,
        currency char(3) NOT NULL DEFAULT 'NPR',
        weight_grams int,
        is_default boolean NOT NULL DEFAULT false,
        option_signature text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_variants_pkey PRIMARY KEY (id),
        CONSTRAINT product_variants_id_shop_id_key UNIQUE (id, shop_id),
        CONSTRAINT product_variants_id_product_id_key UNIQUE (id, product_id),
        CONSTRAINT product_variants_product_fkey FOREIGN KEY (product_id, shop_id)
          REFERENCES products (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT product_variants_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT product_variants_price_check CHECK (price_minor BETWEEN 0 AND 100000000),
        CONSTRAINT product_variants_compare_at_check
          CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor > price_minor),
        CONSTRAINT product_variants_weight_check CHECK (weight_grams IS NULL OR weight_grams BETWEEN 1 AND 50000),
        CONSTRAINT product_variants_sku_check
          CHECK (char_length(sku) BETWEEN 1 AND 64 AND sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'),
        CONSTRAINT product_variants_status_check CHECK (status IN ('active','archived')),
        CONSTRAINT product_variants_default_signature_check CHECK (is_default = (option_signature = '')),
        CONSTRAINT product_variants_signature_check CHECK (option_signature ~ '^([a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*(\|[a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*)*)\?$')
      )
    `)
    this.schema.raw(String.raw`
      CREATE UNIQUE INDEX product_variants_shop_sku_key ON product_variants (shop_id, sku) WHERE status = 'active';
      CREATE UNIQUE INDEX product_variants_product_signature_key ON product_variants (product_id, option_signature)
        WHERE status = 'active';
      CREATE UNIQUE INDEX product_variants_default_key ON product_variants (product_id)
        WHERE is_default AND status = 'active';
      CREATE INDEX product_variants_product_idx ON product_variants (product_id, status)
    `)

    // docs/04a §7.10. The cascade from product_variants is one of the three
    // of docs/04 §2.6.
    this.schema.raw(String.raw`
      CREATE TABLE variant_option_values (
        variant_id uuid NOT NULL,
        product_id uuid NOT NULL,
        attribute_id uuid NOT NULL,
        attribute_value_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT variant_option_values_pkey PRIMARY KEY (variant_id, attribute_id),
        CONSTRAINT variant_option_values_variant_fkey FOREIGN KEY (variant_id, product_id)
          REFERENCES product_variants (id, product_id) ON DELETE CASCADE,
        CONSTRAINT variant_option_values_axis_fkey FOREIGN KEY (product_id, attribute_id)
          REFERENCES product_option_axes (product_id, attribute_id) ON DELETE RESTRICT,
        CONSTRAINT variant_option_values_value_fkey FOREIGN KEY (attribute_value_id, attribute_id)
          REFERENCES attribute_values (id, attribute_id) ON DELETE RESTRICT
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX variant_option_values_product_idx ON variant_option_values (product_id, attribute_id, attribute_value_id)
    `)

    // docs/04a §7.7
    this.schema.raw(String.raw`
      CREATE TABLE product_attribute_values (
        product_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        attribute_id uuid NOT NULL,
        attribute_value_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_attribute_values_pkey PRIMARY KEY (product_id, attribute_value_id),
        CONSTRAINT product_attribute_values_product_fkey FOREIGN KEY (product_id, shop_id)
          REFERENCES products (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT product_attribute_values_value_fkey FOREIGN KEY (attribute_value_id, attribute_id)
          REFERENCES attribute_values (id, attribute_id) ON DELETE RESTRICT
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX product_attribute_values_value_idx ON product_attribute_values (attribute_value_id)
    `)

    // docs/04a §7.11. Append-only (docs/04 §2.12): the trigger and REVOKEs are in file 14.
    this.schema.raw(String.raw`
      CREATE TABLE product_review_decisions (
        id uuid NOT NULL DEFAULT uuidv7(),
        product_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        decision text NOT NULL,
        reason_code text,
        note text,
        decided_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_review_decisions_pkey PRIMARY KEY (id),
        CONSTRAINT product_review_decisions_product_fkey FOREIGN KEY (product_id, shop_id)
          REFERENCES products (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT product_review_decisions_decided_by_fkey FOREIGN KEY (decided_by)
          REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT product_review_decisions_decision_check
          CHECK (decision IN ('approved','rejected','blocked','unblocked')),
        CONSTRAINT product_review_decisions_reason_code_check CHECK (reason_code IN ('counterfeit_suspected','misleading_claim','prohibited_item','missing_disclosure','poor_images','other')),
        CONSTRAINT product_review_decisions_reason_required_check CHECK (decision NOT IN ('rejected','blocked') OR (reason_code IS NOT NULL AND note IS NOT NULL AND char_length(note) BETWEEN 10 AND 2000))
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX product_review_decisions_product_idx ON product_review_decisions (product_id, created_at DESC)
    `)

    // docs/04a §7.14 (module media). The asset key carries the constant kind,
    // so only a product image of the same shop can join a gallery.
    this.schema.raw(String.raw`
      CREATE TABLE product_media (
        product_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        media_asset_id uuid NOT NULL,
        media_kind text NOT NULL DEFAULT 'product_image',
        color_value_id uuid,
        position smallint NOT NULL,
        alt_text text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_media_pkey PRIMARY KEY (product_id, media_asset_id),
        CONSTRAINT product_media_position_key UNIQUE (product_id, position),
        CONSTRAINT product_media_product_fkey FOREIGN KEY (product_id, shop_id)
          REFERENCES products (id, shop_id) ON DELETE RESTRICT,
        CONSTRAINT product_media_asset_fkey FOREIGN KEY (media_asset_id, shop_id, media_kind)
          REFERENCES media_assets (id, shop_id, kind) ON DELETE RESTRICT,
        CONSTRAINT product_media_media_kind_check CHECK (media_kind = 'product_image'),
        CONSTRAINT product_media_position_check CHECK (position BETWEEN 1 AND 12),
        CONSTRAINT product_media_alt_text_check CHECK (alt_text IS NULL OR char_length(alt_text) <= 150),
        CONSTRAINT product_media_color_fkey FOREIGN KEY (color_value_id)
          REFERENCES attribute_values (id) ON DELETE RESTRICT
      )
    `)

    // docs/04a §7.12, the derived read model (ADR-0014). The two-argument
    // to_tsvector is required in a generated column; search_tsv is STORED
    // explicitly (PostgreSQL 18 defaults to VIRTUAL).
    this.schema.raw(String.raw`
      CREATE TABLE product_listings (
        product_id uuid NOT NULL,
        shop_id uuid NOT NULL,
        shop_slug citext NOT NULL,
        shop_name text NOT NULL,
        public_id char(8) NOT NULL,
        slug text NOT NULL,
        title text NOT NULL,
        category_id uuid NOT NULL,
        category_path text NOT NULL,
        category_names text NOT NULL,
        brand_id uuid,
        brand_name text,
        brand_slug citext,
        audience_value_ids uuid[] NOT NULL DEFAULT '{}',
        size_value_ids uuid[] NOT NULL DEFAULT '{}',
        color_value_ids uuid[] NOT NULL DEFAULT '{}',
        min_price_minor bigint NOT NULL,
        max_price_minor bigint NOT NULL,
        compare_at_price_minor bigint,
        currency char(3) NOT NULL DEFAULT 'NPR',
        in_stock boolean NOT NULL,
        primary_image_keys jsonb NOT NULL,
        primary_image_alt text NOT NULL,
        published_at timestamptz NOT NULL,
        search_tsv tsvector NOT NULL GENERATED ALWAYS AS (setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') || setweight(to_tsvector('simple', category_names || ' ' || shop_name), 'C')) STORED,
        refreshed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT product_listings_pkey PRIMARY KEY (product_id),
        CONSTRAINT product_listings_product_fkey FOREIGN KEY (product_id, shop_id)
          REFERENCES products (id, shop_id) ON DELETE CASCADE,
        CONSTRAINT product_listings_price_range_check
          CHECK (min_price_minor > 0 AND min_price_minor <= max_price_minor),
        CONSTRAINT product_listings_currency_check CHECK (currency = 'NPR'),
        CONSTRAINT product_listings_image_check CHECK (jsonb_typeof(primary_image_keys) = 'object')
      )
    `)
    this.schema.raw(String.raw`
      CREATE INDEX product_listings_category_idx ON product_listings (category_path text_pattern_ops, published_at DESC, product_id);
      CREATE INDEX product_listings_shop_idx ON product_listings (shop_id, published_at DESC, product_id);
      CREATE INDEX product_listings_search_idx ON product_listings USING GIN (search_tsv);
      CREATE INDEX product_listings_title_trgm_idx ON product_listings USING GIN (title gin_trgm_ops)
    `)

    // docs/04 §2.2: one updated_at trigger per table that has the column.
    this.schema.raw(String.raw`
      CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER attributes_set_updated_at BEFORE UPDATE ON attributes
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER attribute_values_set_updated_at BEFORE UPDATE ON attribute_values
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON brands
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
      CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON product_variants
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)
  }

  async down() {
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_listings`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_media`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_review_decisions`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_attribute_values`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS variant_option_values`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_variants`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS product_option_axes`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS products`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS brands`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS category_attributes`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS attribute_values`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS attributes`)
    this.schema.raw(String.raw`DROP TABLE IF EXISTS categories`)
  }
}
